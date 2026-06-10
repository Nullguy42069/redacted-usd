// Client-side helpers for the private_vote_tee program (MagicBlock TEE backend).
// Structurally parallel to ./privateVote.ts so the UI stepper can map the
// two backends with identical phase semantics. Same shape:
//   init_vote_state → delegate_for_tee → cast_vote × N → finalize_and_commit → cpi_proposal_approve
//
// Symmetry note: where Arcium uses x25519 + RescueCipher to encrypt votes,
// the TEE path stores votes in plaintext but inside a MagicBlock ephemeral
// rollup running on Intel TDX — external observers only see the committed
// final state, not individual votes.

import { AnchorProvider, Program } from "@anchor-lang/core";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import BN from "bn.js";
import idl from "./private_vote_tee.idl.json";
import type { PrivateVoteTee } from "./private_vote_tee.idl";
import { PRIVATE_VOTE_TEE_PROGRAM_ID_OVERRIDE } from "./env";

export const TEE_VOTE_PROGRAM_ID = new PublicKey(
  PRIVATE_VOTE_TEE_PROGRAM_ID_OVERRIDE || idl.address,
);

const SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");

// ─────────────── PDAs ───────────────
// Wrapper member uses seed `tee_member` (vs `squads_member` for Arcium). Different
// namespace → a vault can never simultaneously belong to both backends.

export function deriveTeeVoteStatePda(
  multisig: PublicKey,
  transactionIndex: bigint,
): [PublicKey, number] {
  const txIndexBuf = Buffer.alloc(8);
  txIndexBuf.writeBigUInt64LE(transactionIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote_state"), multisig.toBuffer(), txIndexBuf],
    TEE_VOTE_PROGRAM_ID,
  );
}

export function deriveTeeMemberPda(multisig: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tee_member"), multisig.toBuffer()],
    TEE_VOTE_PROGRAM_ID,
  );
}

// ─────────────── State ───────────────
// Mirror of PrivateVoteState shape so consumer code can be generic over backend.

export type TeeVoteState = {
  multisig: PublicKey;
  transactionIndex: bigint;
  threshold: number;
  memberCount: number;
  members: PublicKey[];
  votedBitmap: bigint;
  finalized: boolean;
  approved: boolean;
  delegated: boolean;     // true once delegate_for_tee fired (state is in rollup)
};

function getProgram(provider: AnchorProvider): Program<PrivateVoteTee> {
  return new Program<PrivateVoteTee>(idl as unknown as PrivateVoteTee, provider);
}

export async function loadTeeVoteState(
  connection: Connection,
  pda: PublicKey,
): Promise<TeeVoteState | null> {
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const decoded = program.coder.accounts.decode("voteStateAccount", info.data);
  return {
    multisig: decoded.multisig,
    transactionIndex: BigInt(decoded.transactionIndex.toString()),
    threshold: decoded.threshold,
    memberCount: decoded.memberCount,
    members: decoded.members,
    votedBitmap: BigInt((decoded.votedBitmap ?? new BN(0)).toString()),
    finalized: !!decoded.finalized,
    approved: !!decoded.approved,
    // When delegated, the account's owner switches to DELEGATION_PROGRAM_ID —
    // the on-chain decoded state may not surface this directly; consumers
    // should additionally check info.owner if precise lifecycle is needed.
    delegated: !!decoded.delegated,
  };
}

// Lifecycle phase parallel to privateVote.LifecyclePhase.
//   uninitialized → needsDelegate → voting → needsFinalize → approved | rejected
export type TeeLifecyclePhase =
  | "uninitialized"
  | "needsDelegate"
  | "voting"
  | "needsFinalize"
  | "approved"
  | "rejected";

export function phase(state: TeeVoteState | null, allVoted: boolean): TeeLifecyclePhase {
  if (!state) return "uninitialized";
  if (!state.delegated) return "needsDelegate";
  if (state.finalized) return state.approved ? "approved" : "rejected";
  if (allVoted) return "needsFinalize";
  return "voting";
}

export function hasVoted(state: TeeVoteState | null, member: PublicKey): boolean {
  if (!state) return false;
  const idx = state.members.findIndex((m) => m.equals(member));
  if (idx < 0) return false;
  return (state.votedBitmap & (1n << BigInt(idx))) !== 0n;
}

export function allMembersVoted(state: TeeVoteState | null): boolean {
  if (!state) return false;
  const full = (1n << BigInt(state.memberCount)) - 1n;
  return state.votedBitmap === full;
}

// Detector parallel to isPrivateVoteWrapped. True if the multisig has the
// TEE wrapper PDA as a member — i.e. the vault is bound to the TEE backend.
export function isTeeVoteWrapped(
  squadsMembers: PublicKey[],
  multisig: PublicKey,
): boolean {
  const [wrapper] = deriveTeeMemberPda(multisig);
  return squadsMembers.some((m) => m.equals(wrapper));
}

// ─────────────── Tx builders ───────────────

async function compileV0(
  connection: Connection,
  payer: PublicKey,
  instructions: import("@solana/web3.js").TransactionInstruction[],
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

// 1/4 — init_vote_state. Mainnet ix. Creates the vote_state PDA. Idempotent
// if already initialized (caller should guard via loadTeeVoteState first).
export async function buildInitVoteStateTx(input: {
  connection: Connection;
  creator: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
  threshold: number;
  members: PublicKey[];
}): Promise<VersionedTransaction> {
  const { connection, creator, multisig, transactionIndex, threshold, members } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [voteStatePda] = deriveTeeVoteStatePda(multisig, transactionIndex);
  const ix = await program.methods
    .initVoteState(multisig, new BN(transactionIndex.toString()), threshold, members)
    .accountsPartial({
      creator,
      voteState: voteStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return compileV0(connection, creator, [ix]);
}

// 2/4 — delegate_for_tee. Mainnet ix. After this, vote_state ownership
// transfers to the MagicBlock delegation program and subsequent castVote txs
// must be routed via the MagicRouter (or the rollup endpoint) — they will
// fail on mainnet RPCs.
export async function buildDelegateForTeeTx(input: {
  connection: Connection;
  payer: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
}): Promise<VersionedTransaction> {
  const { connection, payer, multisig, transactionIndex } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [voteStatePda] = deriveTeeVoteStatePda(multisig, transactionIndex);
  // buffer / delegation_record / delegation_metadata / owner_program /
  // delegation_program / system_program all auto-resolve from the IDL's
  // PDA + const-address declarations — accountsPartial({voteState}) is enough.
  const ix = await program.methods
    .delegateForTee(multisig, new BN(transactionIndex.toString()))
    .accountsPartial({ payer, voteState: voteStatePda })
    .instruction();
  return compileV0(connection, payer, [ix]);
}

// 3/4 — cast_vote. Rollup ix. Send via the MagicRouter (or directly to the
// rollup endpoint) — NOT a mainnet RPC. The caller is responsible for
// routing; this builder only constructs the tx.
export async function buildTeeCastVoteTx(input: {
  connection: Connection;
  voter: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
  choice: boolean;
}): Promise<VersionedTransaction> {
  const { connection, voter, multisig, transactionIndex, choice } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [voteStatePda] = deriveTeeVoteStatePda(multisig, transactionIndex);
  const ix = await program.methods
    .castVote(choice)
    .accountsPartial({ voter, voteState: voteStatePda })
    .instruction();
  return compileV0(connection, voter, [ix]);
}

// 4/4 — finalize_and_commit. Rollup ix. Closes the rollup session and commits
// the final vote_state (approved=true/false) back to mainnet. Must route via
// the rollup endpoint — same as cast_vote.
export async function buildFinalizeAndCommitTx(input: {
  connection: Connection;
  payer: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
}): Promise<VersionedTransaction> {
  const { connection, payer, multisig, transactionIndex } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [voteStatePda] = deriveTeeVoteStatePda(multisig, transactionIndex);
  const ix = await program.methods
    .finalizeAndCommit()
    .accountsPartial({
      payer,
      voteState: voteStatePda,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .instruction();
  return compileV0(connection, payer, [ix]);
}

// 5/5 — cpi_proposal_approve. Mainnet ix. Permissionless after commit. Same
// shape as the Arcium version — once approved=true on the (now-committed)
// vote_state, anyone can call this to trigger Squads proposal approval.
export async function buildTeeCpiProposalApproveTx(input: {
  connection: Connection;
  trigger: PublicKey;
  multisigPda: PublicKey;
  transactionIndex: bigint;
}): Promise<VersionedTransaction> {
  const { connection, trigger, multisigPda, transactionIndex } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [voteStatePda] = deriveTeeVoteStatePda(multisigPda, transactionIndex);
  const [memberAuthority] = deriveTeeMemberPda(multisigPda);
  const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex });
  const ix = await program.methods
    .cpiProposalApprove()
    .accountsPartial({
      trigger,
      voteState: voteStatePda,
      multisig: multisigPda,
      proposal: proposalPda,
      memberAuthority,
      squadsProgram: SQUADS_PROGRAM_ID,
    })
    .instruction();
  return compileV0(connection, trigger, [ix]);
}

// ─────────────── Stepper-friendly summary ───────────────
// What Grok's stepper needs: a stable description per phase mapping to the
// builder it should call. Same shape as Arcium's stepper so the UI is generic.

export type TeeStep = {
  id: "init" | "delegate" | "vote" | "finalize" | "approve";
  label: string;
  route: "mainnet" | "rollup";
  buildsTx: string;   // builder function name
};

export const TEE_STEPS: readonly TeeStep[] = [
  { id: "init",     label: "Initialize vote state",     route: "mainnet", buildsTx: "buildInitVoteStateTx" },
  { id: "delegate", label: "Delegate to TEE",           route: "mainnet", buildsTx: "buildDelegateForTeeTx" },
  { id: "vote",     label: "Cast encrypted-by-rollup vote", route: "rollup",  buildsTx: "buildTeeCastVoteTx" },
  { id: "finalize", label: "Finalize & commit",         route: "rollup",  buildsTx: "buildFinalizeAndCommitTx" },
  { id: "approve",  label: "Approve in Squads",         route: "mainnet", buildsTx: "buildTeeCpiProposalApproveTx" },
] as const;
