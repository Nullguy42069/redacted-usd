// Client-side helpers for the private_vote program.
// Encrypts a yes/no choice with x25519 + RescueCipher and orchestrates the
// full lifecycle: init → init_poll → cast_vote × N → try_finalize → CPI to Squads.

import { AnchorProvider, Program } from "@anchor-lang/core";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  RescueCipher,
  getCompDefAccOffset,
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getArciumEnv,
  deserializeLE,
  x25519,
} from "@arcium-hq/client";
import * as multisig from "@sqds/multisig";
import BN from "bn.js";
import { randomBytes } from "crypto";
import idl from "./private_vote.idl.json";
import type { PrivateVote } from "./private_vote.idl";
import { PRIVATE_VOTE_PROGRAM_ID_OVERRIDE } from "./env";

export const PRIVATE_VOTE_PROGRAM_ID = new PublicKey(
  PRIVATE_VOTE_PROGRAM_ID_OVERRIDE || idl.address,
);

const SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

// ─────────────── PDAs ───────────────

export function derivePrivateVotePda(
  multisig: PublicKey,
  transactionIndex: bigint,
): [PublicKey, number] {
  const txIndexBuf = Buffer.alloc(8);
  txIndexBuf.writeBigUInt64LE(transactionIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("private_vote"), multisig.toBuffer(), txIndexBuf],
    PRIVATE_VOTE_PROGRAM_ID,
  );
}

export function deriveWrapperMemberPda(multisig: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("squads_member"), multisig.toBuffer()],
    PRIVATE_VOTE_PROGRAM_ID,
  );
}

// ─────────────── State ───────────────

export type PrivateVoteState = {
  multisig: PublicKey;
  transactionIndex: bigint;
  threshold: number;
  memberCount: number;
  members: PublicKey[];
  votedBitmap: bigint;
  finalized: boolean;
  approved: boolean;
  pollInitialized: boolean;
};

function getProgram(provider: AnchorProvider): Program<PrivateVote> {
  return new Program<PrivateVote>(idl as unknown as PrivateVote, provider);
}

export async function loadPrivateVoteState(
  connection: Connection,
  pda: PublicKey,
): Promise<PrivateVoteState | null> {
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const decoded = program.coder.accounts.decode("privateVoteAccount", info.data);
  return {
    multisig: decoded.multisig,
    transactionIndex: BigInt(decoded.transactionIndex.toString()),
    threshold: decoded.threshold,
    memberCount: decoded.memberCount,
    members: decoded.members,
    votedBitmap: BigInt(decoded.votedBitmap.toString()),
    finalized: decoded.finalized,
    approved: decoded.approved,
    pollInitialized: decoded.pollInitialized,
  };
}

// Lifecycle phase derived from on-chain state.
export type LifecyclePhase =
  | "uninitialized"
  | "needsPoll"
  | "voting"
  | "needsFinalize"
  | "approved"
  | "rejected";

export function phase(state: PrivateVoteState | null, allVoted: boolean): LifecyclePhase {
  if (!state) return "uninitialized";
  if (!state.pollInitialized) return "needsPoll";
  if (state.finalized) return state.approved ? "approved" : "rejected";
  if (allVoted) return "needsFinalize";
  return "voting";
}

export function hasVoted(state: PrivateVoteState | null, member: PublicKey): boolean {
  if (!state) return false;
  const idx = state.members.findIndex((m) => m.equals(member));
  if (idx < 0) return false;
  return (state.votedBitmap & (1n << BigInt(idx))) !== 0n;
}

export function allMembersVoted(state: PrivateVoteState | null): boolean {
  if (!state) return false;
  const full = (1n << BigInt(state.memberCount)) - 1n;
  return state.votedBitmap === full;
}

export function isPrivateVoteWrapped(
  squadsMembers: PublicKey[],
  multisig: PublicKey,
): boolean {
  const [wrapper] = deriveWrapperMemberPda(multisig);
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

export async function buildInitPrivateVoteTx(input: {
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
  const [privateVotePda] = derivePrivateVotePda(multisig, transactionIndex);
  const ix = await program.methods
    .initPrivateVote(multisig, new BN(transactionIndex.toString()), threshold, members)
    .accountsPartial({
      creator,
      privateVote: privateVotePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return compileV0(connection, creator, [ix]);
}

export async function buildInitPollTx(input: {
  connection: Connection;
  payer: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
}): Promise<VersionedTransaction> {
  const { connection, payer, multisig, transactionIndex } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [privateVotePda] = derivePrivateVotePda(multisig, transactionIndex);
  const arciumEnv = getArciumEnv();
  const computationOffset = new BN(randomBytes(8), "hex");
  const ix = await program.methods
    .initPoll(computationOffset)
    .accountsPartial({
      payer,
      privateVote: privateVotePda,
      computationAccount: getComputationAccAddress(
        arciumEnv.arciumClusterOffset,
        computationOffset,
      ),
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      mxeAccount: getMXEAccAddress(PRIVATE_VOTE_PROGRAM_ID),
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      compDefAccount: getCompDefAccAddress(
        PRIVATE_VOTE_PROGRAM_ID,
        Buffer.from(getCompDefAccOffset("init_poll")).readUInt32LE(),
      ),
    })
    .instruction();
  return compileV0(connection, payer, [ix]);
}

export async function buildEncryptedVoteTx(input: {
  connection: Connection;
  voter: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
  choice: boolean;
}): Promise<VersionedTransaction> {
  const { connection, voter, multisig, transactionIndex, choice } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);

  const mxePubkey = await getMXEPublicKey(provider, PRIVATE_VOTE_PROGRAM_ID);
  if (!mxePubkey) throw new Error("MXE public key not available");

  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePubkey);
  const cipher = new RescueCipher(sharedSecret);

  const nonce = randomBytes(16);
  const ciphertext = cipher.encrypt([choice ? 1n : 0n], nonce);

  const [privateVotePda] = derivePrivateVotePda(multisig, transactionIndex);
  const arciumEnv = getArciumEnv();
  const computationOffset = new BN(randomBytes(8), "hex");

  const ix = await program.methods
    .castVote(
      computationOffset,
      Array.from(ciphertext[0]!),
      Array.from(publicKey),
      new BN(deserializeLE(nonce).toString()),
    )
    .accountsPartial({
      payer: voter,
      voter,
      privateVote: privateVotePda,
      computationAccount: getComputationAccAddress(
        arciumEnv.arciumClusterOffset,
        computationOffset,
      ),
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      mxeAccount: getMXEAccAddress(PRIVATE_VOTE_PROGRAM_ID),
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      compDefAccount: getCompDefAccAddress(
        PRIVATE_VOTE_PROGRAM_ID,
        Buffer.from(getCompDefAccOffset("cast_vote")).readUInt32LE(),
      ),
    })
    .instruction();
  return compileV0(connection, voter, [ix]);
}

export async function buildTryFinalizeTx(input: {
  connection: Connection;
  payer: PublicKey;
  multisig: PublicKey;
  transactionIndex: bigint;
}): Promise<VersionedTransaction> {
  const { connection, payer, multisig, transactionIndex } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [privateVotePda] = derivePrivateVotePda(multisig, transactionIndex);
  const arciumEnv = getArciumEnv();
  const computationOffset = new BN(randomBytes(8), "hex");
  const ix = await program.methods
    .tryFinalize(computationOffset)
    .accountsPartial({
      payer,
      privateVote: privateVotePda,
      computationAccount: getComputationAccAddress(
        arciumEnv.arciumClusterOffset,
        computationOffset,
      ),
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      mxeAccount: getMXEAccAddress(PRIVATE_VOTE_PROGRAM_ID),
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      compDefAccount: getCompDefAccAddress(
        PRIVATE_VOTE_PROGRAM_ID,
        Buffer.from(getCompDefAccOffset("try_finalize")).readUInt32LE(),
      ),
    })
    .instruction();
  return compileV0(connection, payer, [ix]);
}

export async function buildCpiProposalApproveTx(input: {
  connection: Connection;
  trigger: PublicKey;
  multisigPda: PublicKey;
  transactionIndex: bigint;
}): Promise<VersionedTransaction> {
  const { connection, trigger, multisigPda, transactionIndex } = input;
  const provider = new AnchorProvider(connection, {} as never, {});
  const program = getProgram(provider);
  const [privateVotePda] = derivePrivateVotePda(multisigPda, transactionIndex);
  const [memberAuthority] = deriveWrapperMemberPda(multisigPda);
  const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex });
  const ix = await program.methods
    .cpiProposalApprove()
    .accountsPartial({
      trigger,
      privateVote: privateVotePda,
      multisig: multisigPda,
      proposal: proposalPda,
      memberAuthority,
      squadsProgram: SQUADS_PROGRAM_ID,
    })
    .instruction();
  return compileV0(connection, trigger, [ix]);
}
