// MagicBlock TEE backend (Intel TDX Private Ephemeral Rollups) — Phase 2.
//
// Now drives the `private_vote_tee` Anchor program for the `vote` intent.
// Lifecycle:
//   1. setup_multisig → creates a Squads multisig with our TEE wrapper PDA as
//      the sole voting member, then atomically inits the vote_state PDA and
//      delegates it to MagicBlock so subsequent votes execute inside TDX.
//   2. vote → cast_vote ix on the rollup endpoint (private execution).
//   3. (Off-intent lifecycle) finalize_and_commit + cpi_proposal_approve close
//      the session and trigger Squads.
//
// Privacy story: vote storage is plaintext, but the rollup executes inside
// Intel TDX so external observers see only the final committed state, not
// individual votes. Same end-user privacy as Arcium MPC, different mechanism.

import { AnchorProvider, Program } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";
import * as squads from "@sqds/multisig";
import BN from "bn.js";
import idl from "./tee-idl.json" with { type: "json" };
import type { PrivateVoteTee as PrivateVoteTeeIdl } from "./tee-idl";
import type {
  BackendStaticMeta,
  BuildResult,
  CreateVoteIntent,
  FinalizeVoteIntent,
  Intent,
  PrivacyBackend,
  SetupMultisigIntent,
  SubmitResult,
  VaultTransferIntent,
  VoteIntent,
} from "../types";
import { getMeta } from "./registry";
import { loadSquadsProgramConfig } from "../utils/network";

const DEFAULT_ROUTER_ENDPOINT = "https://devnet.magicblock.app";
// For mainnet, replace with the current MagicBlock mainnet router endpoint
// (commonly something like https://mainnet.magicblock.app or a dedicated router).
// Confirm the exact endpoint in MagicBlock docs before going live on mainnet.
const META: BackendStaticMeta = getMeta("magicblock-tee");
const PERM_PROPOSE = 1;
const PERM_VOTE_EXECUTE = 6;

export type MagicBlockOptions = {
  /** 
   * MagicBlock Ephemeral Rollup router endpoint.
   * Devnet default:  https://devnet.magicblock.app
   * Mainnet:         Use the current production router (check MagicBlock docs).
   *                  Mainnet routers often require separate registration or have different URLs.
   */
  routerEndpoint?: string;
  programId?: PublicKey;
};

export class MagicBlockTeeBackend implements PrivacyBackend {
  readonly id = "magicblock-tee" as const;
  readonly meta = META;
  private readonly routerEndpoint: string;
  private readonly programId: PublicKey;
  private routerConn: ConnectionMagicRouter | null = null;

  constructor(opts: MagicBlockOptions = {}) {
    this.routerEndpoint = opts.routerEndpoint ?? DEFAULT_ROUTER_ENDPOINT;
    this.programId = opts.programId ?? new PublicKey(idl.address);
  }

  canHandle(intent: Intent): boolean {
    return META.supportedIntents.includes(intent.type);
  }

  async estimateLatencyMs(_intent: Intent, _conn: Connection): Promise<number> {
    return META.baselineLatencyMs;
  }

  async estimateCost(intent: Intent, _conn: Connection): Promise<number> {
    if (intent.type === "setup_multisig") {
      const sizeBytes = 200 + intent.members.length * 32;
      return Math.round(sizeBytes * 6960 * 2);
    }
    return META.baselineCostLamports;
  }

  async buildTransactions(
    intent: Intent,
    conn: Connection,
    signer: PublicKey,
  ): Promise<BuildResult> {
    if (intent.type === "setup_multisig") return this.buildSetupMultisig(intent, conn, signer);
    if (intent.type === "vault_transfer") return this.buildVaultTransfer(intent, conn, signer);
    if (intent.type === "vote") return this.buildCastVote(intent, conn, signer);
    if (intent.type === "create_vote") return this.buildCreateVote(intent, conn, signer);
    if (intent.type === "finalize_vote") return this.buildFinalizeVote(intent, conn, signer);
    throw new Error(`MagicBlockTeeBackend has no builder for intent "${intent.type}"`);
  }

  // Vote txs go via the MagicRouter so a delegated vote_state routes into the
  // ER automatically. Setup + vault_transfer stay on mainnet (Squads accounts
  // aren't delegatable anyway).
  async submit(
    build: BuildResult,
    _conn: Connection,
    sendAndConfirm: (tx: VersionedTransaction) => Promise<string>,
  ): Promise<SubmitResult> {
    void this.lazyRouter(); // warm the router instance; submission still goes via wallet adapter
    let lastSig = "";
    for (const tx of build.txs) lastSig = await sendAndConfirm(tx);
    return { signature: lastSig, status: "confirmed", meta: build.meta };
  }

  private lazyRouter(): ConnectionMagicRouter {
    if (!this.routerConn) this.routerConn = new ConnectionMagicRouter(this.routerEndpoint);
    return this.routerConn;
  }

  private getProgram(conn: Connection): Program<PrivateVoteTeeIdl> {
    const provider = new AnchorProvider(conn, {} as never, {});
    return new Program<PrivateVoteTeeIdl>(idl as unknown as PrivateVoteTeeIdl, provider);
  }

  // ─────────────── PDAs ───────────────

  static deriveTeeMemberPda(programId: PublicKey, multisig: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("tee_member"), multisig.toBuffer()],
      programId,
    );
  }

  static deriveVoteStatePda(
    programId: PublicKey,
    multisig: PublicKey,
    transactionIndex: bigint,
  ): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(transactionIndex);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vote_state"), multisig.toBuffer(), buf],
      programId,
    );
  }

  // ─────────────── setup_multisig ───────────────
  // Same outer flow as Arcium: Squads multisig with creator (Propose only) +
  // wrapper PDA (Vote+Execute). The TEE wrapper uses a different seed
  // namespace (`tee_member`) so a vault can never simultaneously belong to
  // both backends.

  private async buildSetupMultisig(
    intent: SetupMultisigIntent,
    conn: Connection,
    feePayer: PublicKey,
  ): Promise<BuildResult> {
    if (intent.members.length === 0 || intent.members.length > 8) {
      throw new Error("members must be 1..=8");
    }
    if (intent.threshold < 1 || intent.threshold > intent.members.length) {
      throw new Error("threshold must be 1..=members.length");
    }

    const createKey = Keypair.generate();
    const [multisigPda] = squads.getMultisigPda({ createKey: createKey.publicKey });
    const [wrapperPda] = MagicBlockTeeBackend.deriveTeeMemberPda(this.programId, multisigPda);

    // Shared helper gives a crystal-clear error if the user is on the wrong cluster
    // (the root cause of most "create vault" tx failures).
    const programConfig = await loadSquadsProgramConfig(conn);

    const ix = squads.instructions.multisigCreateV2({
      creator: feePayer,
      createKey: createKey.publicKey,
      multisigPda,
      configAuthority: null,
      threshold: 1, // Squads-level: only the wrapper votes. Real threshold lives in vote_state.
      members: [
        { key: feePayer, permissions: { mask: PERM_PROPOSE } },
        { key: wrapperPda, permissions: { mask: PERM_VOTE_EXECUTE } },
      ],
      timeLock: 0,
      treasury: programConfig.treasury,
      rentCollector: null,
    });

    const { blockhash } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);

    return {
      txs: [tx],
      additionalSigners: [createKey],
      meta: {
        multisigPda,
        createKey: createKey.publicKey,
        wrapperPda,
        teeMembers: intent.members,
        teeThreshold: intent.threshold,
      },
    };
  }

  // ─────────────── vote (cast_vote on the rollup) ───────────────

  private async buildCastVote(
    intent: VoteIntent,
    conn: Connection,
    voter: PublicKey,
  ): Promise<BuildResult> {
    const program = this.getProgram(conn);
    const [voteStatePda] = MagicBlockTeeBackend.deriveVoteStatePda(
      this.programId,
      intent.multisig,
      intent.transactionIndex,
    );
    const ix = await program.methods
      .castVote(intent.choice)
      .accountsPartial({ voter, voteState: voteStatePda })
      .instruction();
    const { blockhash } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: voter,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    return {
      txs: [new VersionedTransaction(msg)],
      meta: { routedVia: "magicblock-router", voteStatePda },
    };
  }

  // ─────────────── vault_transfer ───────────────

  private async buildVaultTransfer(
    intent: VaultTransferIntent,
    conn: Connection,
    feePayer: PublicKey,
  ): Promise<BuildResult> {
    if (intent.mint !== null) {
      throw new Error(
        "MagicBlockTeeBackend.vault_transfer: SOL only (Token-2022 confidential is a separate backend).",
      );
    }
    if (intent.amount <= 0n) throw new Error("amount must be > 0");

    const transferIx = SystemProgram.transfer({
      fromPubkey: intent.vault,
      toPubkey: intent.to,
      lamports: intent.amount,
    });
    const { blockhash } = await conn.getLatestBlockhash();
    const innerMessage = new TransactionMessage({
      payerKey: intent.vault,
      recentBlockhash: blockhash,
      instructions: [transferIx],
    });

    const createIx = squads.instructions.vaultTransactionCreate({
      multisigPda: intent.multisig,
      transactionIndex: intent.transactionIndex,
      creator: intent.creator,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: innerMessage,
      ...(intent.memo ? { memo: intent.memo } : {}),
    });
    const proposalIx = squads.instructions.proposalCreate({
      multisigPda: intent.multisig,
      transactionIndex: intent.transactionIndex,
      creator: intent.creator,
    });
    const approveIx = squads.instructions.proposalApprove({
      multisigPda: intent.multisig,
      transactionIndex: intent.transactionIndex,
      member: intent.creator,
    });

    const outer = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: [createIx, proposalIx, approveIx],
    }).compileToV0Message();
    return {
      txs: [new VersionedTransaction(outer)],
      meta: { transactionIndex: intent.transactionIndex, routedVia: "magicblock-router" },
    };
  }

  // ─────────────── create_vote (init + delegate for a proposal) ───────────────
  // This is the "proposer" step for a TEE private vote.
  // 1. init_vote_state (mainnet) — creates the VoteStateAccount with real members/threshold.
  // 2. delegate_for_tee (mainnet) — hands ownership to the MagicBlock delegation program.
  // After this, all subsequent castVote calls must be routed through the ER.

  private async buildCreateVote(
    intent: CreateVoteIntent,
    conn: Connection,
    payer: PublicKey,
  ): Promise<BuildResult> {
    const program = this.getProgram(conn);
    const [voteStatePda] = MagicBlockTeeBackend.deriveVoteStatePda(
      this.programId,
      intent.multisig,
      intent.transactionIndex,
    );

    const initIx = await program.methods
      .initVoteState(
        intent.multisig,
        new BN(intent.transactionIndex.toString()),
        intent.threshold,
        intent.members,
      )
      .accountsPartial({
        creator: payer,
        voteState: voteStatePda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const delegateIx = await program.methods
      .delegateForTee(intent.multisig, new BN(intent.transactionIndex.toString()))
      .accountsPartial({ payer, voteState: voteStatePda })
      .instruction();

    const { blockhash } = await conn.getLatestBlockhash();

    // Two separate transactions (init then delegate). Wallet will sign both.
    const initMsg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [initIx],
    }).compileToV0Message();

    const delegateMsg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [delegateIx],
    }).compileToV0Message();

    return {
      txs: [
        new VersionedTransaction(initMsg),
        new VersionedTransaction(delegateMsg),
      ],
      meta: {
        multisig: intent.multisig,
        transactionIndex: intent.transactionIndex,
        voteStatePda,
        routedVia: "mainnet",
      },
    };
  }

  // ─────────────── finalize_vote ───────────────
  // Step 3 of the TEE lifecycle.
  // 1. finalize_and_commit — executed on the rollup (closes the ER session and
  //    writes the final approved/rejected state back to the mainnet vote_state).
  // 2. cpi_proposal_approve — mainnet CPI from the wrapper PDA into Squads to
  //    record the approval on the original proposal.

  private async buildFinalizeVote(
    intent: FinalizeVoteIntent,
    conn: Connection,
    trigger: PublicKey,
  ): Promise<BuildResult> {
    const program = this.getProgram(conn);
    const [voteStatePda] = MagicBlockTeeBackend.deriveVoteStatePda(
      this.programId,
      intent.multisig,
      intent.transactionIndex,
    );
    const [memberAuthority] = MagicBlockTeeBackend.deriveTeeMemberPda(
      this.programId,
      intent.multisig,
    );
    const [proposalPda] = squads.getProposalPda({
      multisigPda: intent.multisig,
      transactionIndex: intent.transactionIndex,
    });

    const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
    const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");
    const SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

    const finalizeIx = await program.methods
      .finalizeAndCommit()
      .accountsPartial({
        payer: trigger,
        voteState: voteStatePda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const cpiApproveIx = await program.methods
      .cpiProposalApprove()
      .accountsPartial({
        trigger,
        voteState: voteStatePda,
        multisig: intent.multisig,
        proposal: proposalPda,
        memberAuthority,
        squadsProgram: SQUADS_PROGRAM_ID,
      })
      .instruction();

    const { blockhash } = await conn.getLatestBlockhash();

    // finalize_and_commit must go through the router (rollup).
    // cpi_proposal_approve is a normal mainnet CPI.
    const finalizeMsg = new TransactionMessage({
      payerKey: trigger,
      recentBlockhash: blockhash,
      instructions: [finalizeIx],
    }).compileToV0Message();

    const cpiMsg = new TransactionMessage({
      payerKey: trigger,
      recentBlockhash: blockhash,
      instructions: [cpiApproveIx],
    }).compileToV0Message();

    return {
      txs: [
        new VersionedTransaction(finalizeMsg),
        new VersionedTransaction(cpiMsg),
      ],
      meta: {
        multisig: intent.multisig,
        transactionIndex: intent.transactionIndex,
        voteStatePda,
        routedVia: "mixed (rollup + mainnet)",
      },
    };
  }
}

// Health monitor / external callers can ping the rollup endpoint directly.
export function makeMagicRouterConnection(endpoint = DEFAULT_ROUTER_ENDPOINT): ConnectionMagicRouter {
  return new ConnectionMagicRouter(endpoint);
}

// BN is now actively used for the full TEE lifecycle builders.
