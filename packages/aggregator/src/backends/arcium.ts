// Arcium MPC backend adapter. Wraps the private_vote Anchor program: each
// "vote" intent maps to a cast_vote MPC tx (init_poll + setup happen earlier
// via dedicated lifecycle calls, not inside this adapter).

import { AnchorProvider, Program } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as squads from "@sqds/multisig";
import {
  RescueCipher,
  deserializeLE,
  getArciumEnv,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  x25519,
} from "@arcium-hq/client";
import BN from "bn.js";
import { randomBytes } from "crypto";
import idl from "./arcium-idl.json" with { type: "json" };
import type { PrivateVote as PrivateVoteIdl } from "./arcium-idl";
import type {
  BuildResult,
  Intent,
  PrivacyBackend,
  BackendStaticMeta,
  SetupMultisigIntent,
  VoteIntent,
} from "../types";
import { getMeta } from "./registry";
import { loadSquadsProgramConfig } from "../utils/network";

const META: BackendStaticMeta = getMeta("arcium");

export type ArciumOptions = {
  // Override the deployed program ID (defaults to the IDL's embedded address).
  programId?: PublicKey;
};

export class ArciumBackend implements PrivacyBackend {
  readonly id = "arcium" as const;
  readonly meta = META;
  private readonly programId: PublicKey;

  constructor(opts: ArciumOptions = {}) {
    this.programId = opts.programId ?? new PublicKey(idl.address);
  }

  canHandle(intent: Intent): boolean {
    return META.supportedIntents.includes(intent.type);
  }

  async estimateLatencyMs(_intent: Intent, _conn: Connection): Promise<number> {
    // Could read live arx-node metrics; baseline is the honest expectation today.
    return META.baselineLatencyMs;
  }

  async estimateCost(_intent: Intent, _conn: Connection): Promise<number> {
    return META.baselineCostLamports;
  }

  async buildTransactions(
    intent: Intent,
    conn: Connection,
    signer: PublicKey,
  ): Promise<BuildResult> {
    if (intent.type === "vote") {
      return { txs: [await this.buildCastVote(intent, conn, signer)] };
    }
    if (intent.type === "setup_multisig") {
      return this.buildSetupMultisig(intent, conn, signer);
    }
    throw new Error(`ArciumBackend cannot build for intent "${intent.type}"`);
  }

  // ─────────────── setup_multisig — Arcium-wrapped Squads ───────────────

  // Creates a Squads multisig with the wrapper PDA as the sole voting member
  // (1-of-1 in Squads' view). The real voters and threshold from the intent
  // live in the PrivateVote PDA created lazily per-proposal via init_private_vote.
  // We still register the creator as a Propose-only member so a human can open
  // new proposals.
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
    const [wrapperPda] = deriveWrapperMemberPda(this.programId, multisigPda);

    // Shared helper gives a crystal-clear error if the user is on the wrong cluster
    // (the root cause of most "create vault" tx failures).
    const programConfig = await loadSquadsProgramConfig(conn);

    const ix = squads.instructions.multisigCreateV2({
      creator: feePayer,
      createKey: createKey.publicKey,
      multisigPda,
      configAuthority: null,
      threshold: 1, // Squads-level threshold; real threshold lives in PrivateVote.
      members: [
        { key: feePayer, permissions: { mask: 1 } }, // Propose
        { key: wrapperPda, permissions: { mask: 6 } }, // Vote | Execute
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
        privateVoteMembers: intent.members,
        privateVoteThreshold: intent.threshold,
      },
    };
  }

  // ─────────────── vote — cast_vote ───────────────

  private async buildCastVote(
    intent: VoteIntent,
    conn: Connection,
    voter: PublicKey,
  ): Promise<VersionedTransaction> {
    const provider = new AnchorProvider(conn, {} as never, {});
    const program = new Program<PrivateVoteIdl>(idl as unknown as PrivateVoteIdl, provider);

    const mxePubkey = await getMXEPublicKey(provider, this.programId);
    if (!mxePubkey) throw new Error("MXE public key not available");

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePubkey);
    const cipher = new RescueCipher(sharedSecret);

    const nonce = randomBytes(16);
    const ciphertext = cipher.encrypt([intent.choice ? 1n : 0n], nonce);

    const [privateVotePda] = derivePrivateVotePda(
      this.programId,
      intent.multisig,
      intent.transactionIndex,
    );
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
        mxeAccount: getMXEAccAddress(this.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
        compDefAccount: getCompDefAccAddress(
          this.programId,
          Buffer.from(getCompDefAccOffset("cast_vote")).readUInt32LE(),
        ),
      })
      .instruction();

    const { blockhash } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: voter,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    return new VersionedTransaction(msg);
  }
}

// Helper exported for the multisig's lifecycle ix (init / poll / finalize / approve).
// These don't fit the per-intent adapter pattern but the user has to call them
// in order, so they live alongside.
export function derivePrivateVotePda(
  programId: PublicKey,
  multisig: PublicKey,
  transactionIndex: bigint,
): [PublicKey, number] {
  const txIndexBuf = Buffer.alloc(8);
  txIndexBuf.writeBigUInt64LE(transactionIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("private_vote"), multisig.toBuffer(), txIndexBuf],
    programId,
  );
}

export function deriveWrapperMemberPda(
  programId: PublicKey,
  multisig: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("squads_member"), multisig.toBuffer()],
    programId,
  );
}

// Re-export for compatibility with apps/web/lib/privateVote.ts callers.
export { SystemProgram };
