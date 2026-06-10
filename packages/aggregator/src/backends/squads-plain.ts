// Plain Squads backend — no privacy gating. The router picks this when the
// user's policy weighs cost above privacy, or as the fallback when no
// privacy-bearing backend can handle the intent.

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as squads from "@sqds/multisig";
import type {
  BuildResult,
  Intent,
  PrivacyBackend,
  BackendStaticMeta,
  SetupMultisigIntent,
  VaultTransferIntent,
} from "../types";
import { getMeta } from "./registry";
import { loadSquadsProgramConfig } from "../utils/network";

const META: BackendStaticMeta = getMeta("squads-plain");

const PERM_ALL = 7; // Propose | Vote | Execute

export class SquadsPlainBackend implements PrivacyBackend {
  readonly id = "squads-plain" as const;
  readonly meta = META;

  canHandle(intent: Intent): boolean {
    return META.supportedIntents.includes(intent.type);
  }

  async estimateLatencyMs(_intent: Intent, _conn: Connection): Promise<number> {
    return META.baselineLatencyMs;
  }

  async estimateCost(intent: Intent, _conn: Connection): Promise<number> {
    // Squads creation rents one multisig account. Estimate from the SDK's
    // expected size; falls back to baseline if anything errors.
    if (intent.type === "setup_multisig") {
      // Rent for the multisig account (~165 + 32 per member, padded).
      const sizeBytes = 200 + intent.members.length * 32;
      // Approx rent: 6960 lamports/byte/year at 2 years exemption.
      return Math.round(sizeBytes * 6960 * 2);
    }
    return META.baselineCostLamports;
  }

  async buildTransactions(
    intent: Intent,
    conn: Connection,
    signer: PublicKey,
  ): Promise<BuildResult> {
    if (intent.type === "setup_multisig") {
      return this.buildSetupMultisig(intent, conn, signer);
    }
    if (intent.type === "vault_transfer") {
      return this.buildVaultTransfer(intent, conn, signer);
    }
    throw new Error(
      `SquadsPlainBackend has no builder for intent "${intent.type}"`,
    );
  }

  // ─────────────── vault_transfer (SOL only for now) ───────────────

  private async buildVaultTransfer(
    intent: VaultTransferIntent,
    conn: Connection,
    feePayer: PublicKey,
  ): Promise<BuildResult> {
    if (intent.mint !== null) {
      throw new Error(
        "SquadsPlainBackend.vault_transfer: SPL transfers not yet supported; use SOL or route to Token2022Confidential for Token-2022 mints.",
      );
    }
    if (intent.amount <= 0n) throw new Error("amount must be > 0");

    // The inner ix the vault will execute once approved.
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

    // Three Squads ixs bundled so the proposer also records their approval.
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

    const outerMsg = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: [createIx, proposalIx, approveIx],
    }).compileToV0Message();
    const tx = new VersionedTransaction(outerMsg);

    return { txs: [tx], meta: { transactionIndex: intent.transactionIndex } };
  }

  // ─────────────── setup_multisig ───────────────

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

    // Squads stores the program treasury inside the program config — load it
    // so the createV2 instruction knows where to route the (zero, in our case)
    // creation fee. Uses the shared helper so we get a clear actionable error
    // (the #1 reason vault creation txs "do not go through").
    const programConfig = await loadSquadsProgramConfig(conn);

    const ix = squads.instructions.multisigCreateV2({
      creator: feePayer,
      createKey: createKey.publicKey,
      multisigPda,
      configAuthority: null,
      threshold: intent.threshold,
      members: intent.members.map((key, i) => ({
        key,
        // Honor explicit per-member permissions when provided. Otherwise default
        // every member to full permissions — that's the right default because a
        // member without Initiate+Vote can't move the vault forward.
        permissions: { mask: intent.memberPermissions?.[i] ?? PERM_ALL },
      })),
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
      meta: { multisigPda, createKey: createKey.publicKey },
    };
  }
}
