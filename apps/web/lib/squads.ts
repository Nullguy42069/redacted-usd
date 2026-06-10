import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  cachedGetBalance,
  cachedGetAccountInfo,
  cachedGetMultipleAccountsInfo,
} from "./rpc-cache";

const { Multisig, Proposal, VaultTransaction, SpendingLimit } = multisig.accounts;

function toBigInt(n: number | BN | bigint): bigint {
  if (typeof n === "bigint") return n;
  if (typeof n === "number") return BigInt(n);
  return BigInt(n.toString());
}

export type MultisigView = {
  address: PublicKey;
  vault: PublicKey;
  vaultIndex: number;
  threshold: number;
  members: { pubkey: PublicKey; permissions: number }[];
  transactionIndex: bigint;
  staleTransactionIndex: bigint;
  vaultLamports: number;
  timeLockSeconds: number;
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label = "rpc"): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e || "");
      const isRateLimited = msg.includes("429") || e?.status === 429;
      if (isRateLimited || attempt < 1) {
        const delay = 250 * Math.pow(2, attempt) + Math.random() * 100;
        if (isRateLimited) console.warn(`[${label}] rate limited, retrying in ${Math.round(delay)}ms`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function loadMultisig(
  conn: Connection,
  multisigPda: PublicKey,
): Promise<MultisigView> {
  const m = await withRetry(() => Multisig.fromAccountAddress(conn, multisigPda), "loadMultisig");
  const [vault] = multisig.getVaultPda({ multisigPda, index: 0 });
  const vaultLamports = await withRetry(() => cachedGetBalance(conn, vault), "vaultBalance");
  return {
    address: multisigPda,
    vault,
    vaultIndex: 0,
    threshold: m.threshold,
    members: m.members.map((mem) => ({ pubkey: mem.key, permissions: mem.permissions.mask })),
    transactionIndex: toBigInt(m.transactionIndex),
    staleTransactionIndex: toBigInt(m.staleTransactionIndex),
    vaultLamports,
    timeLockSeconds: m.timeLock,
  };
}

export type ProposalStatus =
  | "Draft"
  | "Active"
  | "Approved"
  | "Rejected"
  | "Cancelled"
  | "Executing"
  | "Executed";

export type TxKind = "vault" | "config" | "batch" | "unknown";

export type TxRow = {
  index: bigint;
  proposalPda: PublicKey;
  transactionPda: PublicKey;
  kind: TxKind;
  status: ProposalStatus;
  approvals: PublicKey[];
  rejections: PublicKey[];
  cancellations: PublicKey[];
  createdAt: number;
};

// Anchor-style discriminators (sha256("account:<TypeName>")[0..8]) for the
// three transaction account types Squads v4 ships. We use these to identify
// what kind of tx a proposal points at, since the proposal account itself
// doesn't carry a "kind" field.
const VAULT_TX_DISC  = new Uint8Array([168, 250, 162, 100, 81, 14, 162, 207]);
const CONFIG_TX_DISC = new Uint8Array([94, 8, 4, 35, 113, 139, 139, 112]);
const BATCH_DISC     = new Uint8Array([156, 194, 70, 44, 22, 88, 137, 44]);

function classifyTxAccount(data: Buffer | Uint8Array | null | undefined): TxKind {
  if (!data || data.length < 8) return "unknown";
  const head = data.subarray(0, 8);
  const eq = (d: Uint8Array) => {
    for (let i = 0; i < 8; i++) if (head[i] !== d[i]) return false;
    return true;
  };
  if (eq(VAULT_TX_DISC)) return "vault";
  if (eq(CONFIG_TX_DISC)) return "config";
  if (eq(BATCH_DISC)) return "batch";
  return "unknown";
}

export async function loadTransactions(
  conn: Connection,
  multisigPda: PublicKey,
  view: MultisigView,
): Promise<TxRow[]> {
  const lastIndex = view.transactionIndex;
  if (lastIndex === 0n) return [];

  // Walk most-recent first; cap at 25 entries so a fresh page load stays snappy.
  const indices: bigint[] = [];
  const cap = lastIndex < 25n ? lastIndex : 25n;
  for (let i = 0n; i < cap; i++) indices.push(lastIndex - i);

  const proposalPdas = indices.map((idx) => {
    const [pda] = multisig.getProposalPda({ multisigPda, transactionIndex: idx });
    return pda;
  });
  const transactionPdas = indices.map((idx) => {
    const [pda] = multisig.getTransactionPda({ multisigPda, index: idx });
    return pda;
  });

  // One round-trip for both: proposal accounts and tx accounts (whose
  // discriminator tells us if it's a vault/config/batch tx). Cached 15s —
  // multisig state changes only when a member acts, so brief staleness is fine.
  const infos = await cachedGetMultipleAccountsInfo(conn, [...proposalPdas, ...transactionPdas]);
  const propInfos = infos.slice(0, proposalPdas.length);
  const txInfos = infos.slice(proposalPdas.length);

  const rows: TxRow[] = [];
  for (let i = 0; i < propInfos.length; i++) {
    const pInfo = propInfos[i];
    if (!pInfo) continue; // proposal not created yet for this index
    const [p] = Proposal.fromAccountInfo(pInfo);
    const statusUnion = p.status as { __kind: ProposalStatus; timestamp?: BN | number | bigint };
    const kind = classifyTxAccount(txInfos[i]?.data);
    rows.push({
      index: indices[i]!,
      proposalPda: proposalPdas[i]!,
      transactionPda: transactionPdas[i]!,
      kind,
      status: statusUnion.__kind,
      approvals: p.approved,
      rejections: p.rejected,
      cancellations: p.cancelled,
      createdAt: statusUnion.timestamp != null ? Number(toBigInt(statusUnion.timestamp)) : 0,
    });
  }
  return rows;
}

export function isQueueStatus(s: ProposalStatus): boolean {
  return s === "Draft" || s === "Active" || s === "Approved";
}

// ────────────────────────────────────────────────────────────────────────────
// Decode-before-approve (Fable 5 audit 2026-06-10)
//
// The drain chain identified in the audit relies on a multisig UI that shows
// only "Vault tx" + a memo on the Approve/Execute buttons. The signer never
// sees what they're authorizing. This decoder turns the on-chain
// VaultTransaction / ConfigTransaction account back into a human-readable list
// of actions. The render layer in app/transactions/page.tsx MUST disable the
// Approve button if any returned action is type:"unknown" — a vault tx whose
// instructions can't be fully decoded cannot be safely approved.
// ────────────────────────────────────────────────────────────────────────────

const SYS_PROGRAM_ID = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type DecodedAction =
  | { type: "sol_transfer"; recipient: string; lamports: bigint }
  | {
      type: "spl_transfer";
      programId: string;
      mint?: string;
      dest: string;
      amount: bigint;
    }
  | {
      type: "config";
      action:
        | "add_member"
        | "remove_member"
        | "change_threshold"
        | "set_time_lock"
        | "add_spending_limit"
        | "remove_spending_limit"
        | "set_rent_collector"
        | "other";
      detail: string;
    }
  | { type: "unknown"; programId: string; reason?: string };

function safeBase58(pk: PublicKey | undefined | null): string {
  try {
    return pk ? pk.toBase58() : "?";
  } catch {
    return "?";
  }
}

// VaultTransaction inner messages carry SystemProgram / TokenProgram instructions
// the vault PDA will execute via CPI. Decode them. Returns one DecodedAction per
// inner instruction; unknown programs yield {type:"unknown"} which the UI MUST
// use to hard-block the Approve button.
export function decodeVaultTransactionInstructions(
  txAccount: { message: { accountKeys: PublicKey[]; instructions: Array<{ programIdIndex: number; accountIndexes: Uint8Array | number[]; data: Uint8Array }> } },
): DecodedAction[] {
  const out: DecodedAction[] = [];
  const keys = txAccount.message.accountKeys || [];
  const ixs = txAccount.message.instructions || [];

  for (const ix of ixs) {
    const programId = keys[ix.programIdIndex];
    const pid = safeBase58(programId);
    const accountIdxs = Array.from(ix.accountIndexes || []);
    const data = ix.data instanceof Uint8Array ? ix.data : new Uint8Array(ix.data);

    if (pid === SYS_PROGRAM_ID) {
      // System program: discriminator is u32 LE at offset 0.
      // SystemInstruction::Transfer = 2; lamports = u64 LE at offset 4.
      if (data.length >= 12) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const variant = view.getUint32(0, true);
        if (variant === 2 && accountIdxs[1] != null) {
          // accountIndexes: [from, to]
          const recipient = safeBase58(keys[accountIdxs[1] as number]);
          const lamports = view.getBigUint64(4, true);
          out.push({ type: "sol_transfer", recipient, lamports });
          continue;
        }
      }
      out.push({ type: "unknown", programId: pid, reason: "system_non_transfer" });
      continue;
    }

    if (pid === TOKEN_PROGRAM_ID || pid === TOKEN_2022_PROGRAM_ID) {
      // SPL Token instruction discriminator = u8 at offset 0.
      // Transfer       = 3:  amount=u64 LE @ 1. accounts: [source, dest, authority].
      // TransferChecked = 12: amount=u64 LE @ 1, decimals=u8 @ 9.
      //                     accounts: [source, mint, dest, authority].
      if (data.length >= 9) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const variant = data[0];
        if (variant === 3 && accountIdxs[1] != null) {
          const amount = view.getBigUint64(1, true);
          const dest = safeBase58(keys[accountIdxs[1] as number]);
          out.push({ type: "spl_transfer", programId: pid, dest, amount });
          continue;
        }
        if (variant === 12 && accountIdxs[1] != null && accountIdxs[2] != null) {
          const amount = view.getBigUint64(1, true);
          const mint = safeBase58(keys[accountIdxs[1] as number]);
          const dest = safeBase58(keys[accountIdxs[2] as number]);
          out.push({ type: "spl_transfer", programId: pid, mint, dest, amount });
          continue;
        }
      }
      out.push({ type: "unknown", programId: pid, reason: "spl_non_transfer" });
      continue;
    }

    // Anything else (custom programs, defi protocol calls, etc.) is unknown.
    // The UI MUST hard-block on this.
    out.push({ type: "unknown", programId: pid });
  }
  return out;
}

// ConfigTransaction decoding — these are the highest-stakes actions because a
// blind-approved add_member is a permanent backdoor.
export function decodeConfigActions(
  cfgAccount: { actions: Array<any> },
): DecodedAction[] {
  const out: DecodedAction[] = [];
  for (const action of cfgAccount.actions || []) {
    // The @sqds/multisig SDK encodes ConfigAction as a tagged enum.
    // Shape: { __kind: 'AddMember', member: { key: PublicKey, permissions: ... } }
    // Names: AddMember, RemoveMember, ChangeThreshold, SetTimeLock,
    //        AddSpendingLimit, RemoveSpendingLimit, SetRentCollector.
    const kind = (action.__kind ?? action.kind ?? "").toString();
    switch (kind) {
      case "AddMember": {
        const key = safeBase58(action.member?.key ?? action.newMember?.key);
        const mask = action.member?.permissions?.mask ?? action.newMember?.permissions?.mask;
        out.push({ type: "config", action: "add_member", detail: `${key} (perms=${mask ?? "?"})` });
        break;
      }
      case "RemoveMember": {
        const key = safeBase58(action.oldMember ?? action.member);
        out.push({ type: "config", action: "remove_member", detail: key });
        break;
      }
      case "ChangeThreshold": {
        const t = action.newThreshold ?? action.threshold;
        out.push({ type: "config", action: "change_threshold", detail: `→ ${t}` });
        break;
      }
      case "SetTimeLock": {
        const s = action.newTimeLock ?? action.timeLock;
        out.push({ type: "config", action: "set_time_lock", detail: `${s} sec` });
        break;
      }
      case "AddSpendingLimit": {
        const sl = safeBase58(action.createKey ?? action.key);
        out.push({ type: "config", action: "add_spending_limit", detail: sl });
        break;
      }
      case "RemoveSpendingLimit": {
        const sl = safeBase58(action.spendingLimit ?? action.key);
        out.push({ type: "config", action: "remove_spending_limit", detail: sl });
        break;
      }
      case "SetRentCollector": {
        const k = safeBase58(action.newRentCollector ?? action.rentCollector);
        out.push({ type: "config", action: "set_rent_collector", detail: k });
        break;
      }
      default:
        out.push({ type: "unknown", programId: "ConfigAction", reason: kind || "unrecognized_config_action" });
    }
  }
  return out;
}

// Top-level decoder — takes any tx account info and dispatches to the right path.
// Returns an empty list ONLY for genuine no-op accounts; an unknown account type
// returns a single {type:"unknown"} so the UI hard-blocks.
export async function decodeTransactionAccount(
  conn: Connection,
  multisigPda: PublicKey,
  transactionIndex: bigint | number,
): Promise<DecodedAction[]> {
  const [txPda] = multisig.getTransactionPda({ multisigPda, index: BigInt(transactionIndex) });
  const info = await conn.getAccountInfo(txPda);
  if (!info) return [{ type: "unknown", programId: "?", reason: "tx_account_missing" }];
  const kind = classifyTxAccount(info.data);
  try {
    if (kind === "vault") {
      const [acct] = VaultTransaction.fromAccountInfo(info);
      return decodeVaultTransactionInstructions(acct as any);
    }
    if (kind === "config") {
      const [acct] = multisig.accounts.ConfigTransaction.fromAccountInfo(info);
      return decodeConfigActions(acct as any);
    }
    if (kind === "batch") {
      return [{ type: "unknown", programId: "BatchTransaction", reason: "batch_unsupported_in_decoder" }];
    }
    return [{ type: "unknown", programId: "?", reason: "unrecognized_tx_kind" }];
  } catch (e) {
    return [{ type: "unknown", programId: "?", reason: `decode_error:${(e as Error)?.message?.slice(0, 60)}` }];
  }
}

// Human-readable line per action — used by transactions/page.tsx render.
export function formatDecodedAction(a: DecodedAction): string {
  switch (a.type) {
    case "sol_transfer":
      return `Send ${Number(a.lamports) / LAMPORTS_PER_SOL} SOL → ${shortAddress(a.recipient)}`;
    case "spl_transfer":
      return `Send ${a.amount.toString()} tokens → ${shortAddress(a.dest)}${a.mint ? ` (mint ${shortAddress(a.mint)})` : ""}`;
    case "config":
      switch (a.action) {
        case "add_member":
          return `Add signer ${a.detail}`;
        case "remove_member":
          return `Remove signer ${a.detail}`;
        case "change_threshold":
          return `Change threshold ${a.detail}`;
        case "set_time_lock":
          return `Set time lock ${a.detail}`;
        case "add_spending_limit":
          return `Add spending limit ${a.detail}`;
        case "remove_spending_limit":
          return `Remove spending limit ${a.detail}`;
        case "set_rent_collector":
          return `Set rent collector ${a.detail}`;
        default:
          return `Config: ${a.detail}`;
      }
    case "unknown":
      return `🛑 Unknown program ${shortAddress(a.programId)}${a.reason ? ` (${a.reason})` : ""}`;
  }
}

// Used by Approve/Execute buttons: if true, the UI MUST disable the button.
export function actionsRequireHardBlock(actions: DecodedAction[]): boolean {
  return actions.length === 0 || actions.some((a) => a.type === "unknown");
}

export type ProposeSolTransferInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  recipient: PublicKey;
  amountLamports: bigint;
  memo?: string;
};

// Build a single transaction that creates the vault tx, the proposal, and
// records the creator's approval — three Squads ixs in one wallet signature.
export async function buildProposeSolTransfer(input: ProposeSolTransferInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, recipient, amountLamports, memo } = input;
  const nextIndex = view.transactionIndex + 1n;

  const transferIx = SystemProgram.transfer({
    fromPubkey: view.vault,
    toPubkey: recipient,
    lamports: amountLamports,
  });

  const { blockhash } = await conn.getLatestBlockhash();

  const innerMessage = new TransactionMessage({
    payerKey: view.vault,
    recentBlockhash: blockhash,
    instructions: [transferIx],
  });

  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    vaultIndex: view.vaultIndex,
    ephemeralSigners: 0,
    transactionMessage: innerMessage,
    memo,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex: nextIndex,
    member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

export type ProposeTransactionInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  instructions: TransactionInstruction[];
  memo?: string;
};

/**
 * General version for arbitrary instructions coming from embedded dApps via the iframe adapter.
 */
export async function buildProposeTransaction(input: ProposeTransactionInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, instructions, memo } = input;
  const nextIndex = view.transactionIndex + 1n;

  const { blockhash } = await conn.getLatestBlockhash();

  const innerMessage = new TransactionMessage({
    payerKey: view.vault,
    recentBlockhash: blockhash,
    instructions,
  });

  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    vaultIndex: view.vaultIndex,
    ephemeralSigners: 0,
    transactionMessage: innerMessage,
    memo,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex: nextIndex,
    member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

// ─── Manage signers (config-tx proposals) ──────────────────────────────────
// Add / remove a member on the vault. Each is a Squads config transaction:
// create config-tx + create proposal + creator auto-approve, in one wallet
// signature. The proposal then needs the remaining threshold of votes via
// the Transactions tab, like any other proposal.

export type AddMemberInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  newMember: PublicKey;
  /** Squads Permissions; defaults to all (Initiate · Vote · Execute = mask 7). */
  permissionsMask?: number;
  memo?: string;
};

export async function buildAddMemberProposal(input: AddMemberInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, newMember, permissionsMask, memo } = input;
  const nextIndex = view.transactionIndex + 1n;
  const { blockhash } = await conn.getLatestBlockhash();

  const createIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    actions: [{
      __kind: "AddMember",
      newMember: {
        key: newMember,
        permissions: { mask: permissionsMask ?? 7 },
      },
    }],
    memo,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda, transactionIndex: nextIndex, creator,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: nextIndex, member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

export type RemoveMemberInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  oldMember: PublicKey;
  memo?: string;
};

export async function buildRemoveMemberProposal(input: RemoveMemberInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, oldMember, memo } = input;
  const nextIndex = view.transactionIndex + 1n;
  const { blockhash } = await conn.getLatestBlockhash();

  const createIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    actions: [{ __kind: "RemoveMember", oldMember }],
    memo,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda, transactionIndex: nextIndex, creator,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: nextIndex, member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

// ─── Modules: spending limits & time lock ───────────────────────────────────

export type SpendingLimitView = {
  pda: PublicKey;
  createKey: PublicKey;
  mint: PublicKey;          // PublicKey.default (11111…) means native SOL
  amount: bigint;           // raw amount in token base units (or lamports for SOL)
  period: number;           // 0 OneTime, 1 Day, 2 Week, 3 Month
  periodLabel: string;
  remaining: bigint;
  lastReset: bigint;        // unix seconds
  members: PublicKey[];
  destinations: PublicKey[]; // empty = any destination allowed
};

const PERIOD_LABELS: Record<number, string> = {
  0: "One-time",
  1: "Daily",
  2: "Weekly",
  3: "Monthly",
};

// Anchor-style discriminator for SpendingLimit: sha256("account:SpendingLimit")[0..8].
// Hard-coded constant to avoid pulling in a hash dep; verified against the SDK
// (see history). If Squads ever renames the account, this needs to change.
const SPENDING_LIMIT_DISCRIMINATOR = new Uint8Array([10, 201, 27, 160, 218, 195, 222, 152]);

// Squads v4 program ID — extracted from the SDK so we don't hard-code the
// pubkey twice; falls back to the constant if `multisig.PROGRAM_ID` is absent.
// CORRECTED 2026-06-10 (Fable 5 audit): fallback was previously SQDS4ej65cBF...
// (one char wrong) which made the spending-limit GPA query silently return zero
// accounts when the fallback path was taken. Hidden spending limits = attacker-
// added drain authorization that the UI cannot detect or revoke.
const SQUADS_PROGRAM_ID = (multisig as any).PROGRAM_ID
  ? new PublicKey((multisig as any).PROGRAM_ID)
  : new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

// Fall back to direct getProgramAccountsV2 (Helius pushed legacy gpa off for
// large datasets). Decodes responses ourselves so we don't depend on the SDK's
// gpaBuilder transport.
async function listSpendingLimitsV2(
  conn: Connection,
  multisigPda: PublicKey,
): Promise<SpendingLimitView[]> {
  const filters = [
    { memcmp: { offset: 0, bytes: Buffer.from(SPENDING_LIMIT_DISCRIMINATOR).toString("base64"), encoding: "base64" } },
    { memcmp: { offset: 8, bytes: multisigPda.toBuffer().toString("base64"), encoding: "base64" } },
  ];
  const out: SpendingLimitView[] = [];
  let paginationKey: string | null = null;
  for (let page = 0; page < 20; page++) {
    // Build options object inline so we OMIT paginationKey on the first page
    // instead of sending it as null. Helius's getProgramAccountsV2 validates
    // the param as a string and rejects null with
    // "Invalid param at index 1: invalid type: null, expected a string".
    const opts: Record<string, unknown> = { encoding: "base64", filters, limit: 1000 };
    if (paginationKey) opts.paginationKey = paginationKey;
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccountsV2",
      params: [
        SQUADS_PROGRAM_ID.toBase58(),
        opts,
      ],
    };
    const r = await fetch(conn.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`getProgramAccountsV2 HTTP ${r.status}`);
    const json: any = await r.json();
    if (json.error) throw new Error(json.error.message ?? "getProgramAccountsV2 error");
    const accounts: any[] = json.result?.accounts ?? json.result ?? [];
    for (const a of accounts) {
      const dataBuf = Buffer.from(a.account.data[0], "base64");
      const accountInfo = {
        executable: a.account.executable,
        lamports: a.account.lamports,
        owner: new PublicKey(a.account.owner),
        rentEpoch: a.account.rentEpoch ?? 0,
        data: dataBuf,
      };
      const sl = SpendingLimit.fromAccountInfo(accountInfo as any)[0];
      out.push({
        pda: new PublicKey(a.pubkey),
        createKey: sl.createKey,
        mint: sl.mint,
        amount: toBigInt(sl.amount as any),
        period: sl.period as number,
        periodLabel: PERIOD_LABELS[sl.period as number] ?? "Unknown",
        remaining: toBigInt(sl.remainingAmount as any),
        lastReset: toBigInt(sl.lastReset as any),
        members: sl.members,
        destinations: sl.destinations,
      });
    }
    paginationKey = json.result?.paginationKey ?? null;
    if (!paginationKey) break;
  }
  return out;
}

export async function listSpendingLimits(
  conn: Connection,
  multisigPda: PublicKey,
): Promise<SpendingLimitView[]> {
  // Try the SDK's legacy gpaBuilder first. Falls back to getProgramAccountsV2
  // when the RPC rejects legacy gpa (Helius's "account index service overloaded").
  try {
    const limits = await SpendingLimit.gpaBuilder().addFilter("multisig", multisigPda).run(conn);
    return limits.map((acc) => {
      const sl = SpendingLimit.fromAccountInfo(acc.account)[0];
      return {
        pda: acc.pubkey,
        createKey: sl.createKey,
        mint: sl.mint,
        amount: toBigInt(sl.amount as any),
        period: sl.period as number,
        periodLabel: PERIOD_LABELS[sl.period as number] ?? "Unknown",
        remaining: toBigInt(sl.remainingAmount as any),
        lastReset: toBigInt(sl.lastReset as any),
        members: sl.members,
        destinations: sl.destinations,
      };
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    const shouldFallback =
      msg.includes("getProgramAccountsV2") ||
      msg.includes("account index service") ||
      msg.includes("overloaded") ||
      msg.includes("pagination");
    if (!shouldFallback) throw e;
    return await listSpendingLimitsV2(conn, multisigPda);
  }
}

export type ChangeThresholdInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  newThreshold: number;
  memo?: string;
};

export async function buildChangeThresholdProposal(input: ChangeThresholdInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, newThreshold, memo } = input;
  const nextIndex = view.transactionIndex + 1n;
  const { blockhash } = await conn.getLatestBlockhash();

  const createIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    actions: [{ __kind: "ChangeThreshold", newThreshold }],
    memo,
  });
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda, transactionIndex: nextIndex, creator,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: nextIndex, member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

export type SetTimeLockInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  newTimeLockSeconds: number;
  memo?: string;
};

export async function buildSetTimeLockProposal(input: SetTimeLockInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, newTimeLockSeconds, memo } = input;
  const nextIndex = view.transactionIndex + 1n;
  const { blockhash } = await conn.getLatestBlockhash();

  const createIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    actions: [{ __kind: "SetTimeLock", newTimeLock: newTimeLockSeconds }],
    memo,
  });
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda, transactionIndex: nextIndex, creator,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: nextIndex, member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

export type AddSpendingLimitInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  mint: PublicKey;                     // PublicKey.default for native SOL
  amountBaseUnits: bigint;             // raw base units (lamports for SOL)
  period: number;                      // 0 OneTime, 1 Day, 2 Week, 3 Month
  members: PublicKey[];                // who can spend
  destinations?: PublicKey[];          // empty = anywhere
  memo?: string;
};

export async function buildAddSpendingLimitProposal(input: AddSpendingLimitInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
  createKey: PublicKey;
}> {
  const { conn, multisigPda, view, creator, mint, amountBaseUnits, period, members, destinations, memo } = input;
  const nextIndex = view.transactionIndex + 1n;
  const { blockhash } = await conn.getLatestBlockhash();

  // Spending Limit accounts are PDAs derived from (multisig, createKey).
  // createKey is just a unique salt — generate a fresh one per limit.
  const createKey = Keypair.generate().publicKey;

  const periodVariant = period === 0 ? "OneTime"
                      : period === 1 ? "Day"
                      : period === 2 ? "Week"
                      : "Month";

  const createIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    actions: [{
      __kind: "AddSpendingLimit",
      createKey,
      vaultIndex: view.vaultIndex,
      mint,
      amount: amountBaseUnits as any,
      period: periodVariant as any,
      members,
      destinations: destinations ?? [],
    }],
    memo,
  });
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda, transactionIndex: nextIndex, creator,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: nextIndex, member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex, createKey };
}

export type RemoveSpendingLimitInput = {
  conn: Connection;
  multisigPda: PublicKey;
  view: MultisigView;
  creator: PublicKey;
  spendingLimitPda: PublicKey;
  memo?: string;
};

export async function buildRemoveSpendingLimitProposal(input: RemoveSpendingLimitInput): Promise<{
  tx: VersionedTransaction;
  transactionIndex: bigint;
}> {
  const { conn, multisigPda, view, creator, spendingLimitPda, memo } = input;
  const nextIndex = view.transactionIndex + 1n;
  const { blockhash } = await conn.getLatestBlockhash();

  const createIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex: nextIndex,
    creator,
    actions: [{ __kind: "RemoveSpendingLimit", spendingLimit: spendingLimitPda }],
    memo,
  });
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda, transactionIndex: nextIndex, creator,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: nextIndex, member: creator,
  });

  const outer = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx, approveIx],
  }).compileToV0Message();

  return { tx: new VersionedTransaction(outer), transactionIndex: nextIndex };
}

// Humanize a seconds value for the time-lock UI.
export function humanizeSeconds(s: number): string {
  if (!s || s <= 0) return "Instant (no lock)";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(s % 3600 === 0 ? 0 : 1)}h`;
  return `${(s / 86400).toFixed(s % 86400 === 0 ? 0 : 1)}d`;
}

export async function buildApprove(
  conn: Connection,
  multisigPda: PublicKey,
  transactionIndex: bigint,
  member: PublicKey,
): Promise<VersionedTransaction> {
  const ix = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member,
  });
  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: member,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

export async function buildReject(
  conn: Connection,
  multisigPda: PublicKey,
  transactionIndex: bigint,
  member: PublicKey,
): Promise<VersionedTransaction> {
  const ix = multisig.instructions.proposalReject({
    multisigPda,
    transactionIndex,
    member,
  });
  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: member,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

// Inspect the transaction account at this index and pick the right executor.
// Vault txs use `vaultTransactionExecute`. Config txs use `configTransactionExecute`
// — and if the config action adds/removes a spending limit, we need to pass
// the SpendingLimit PDAs in the `spendingLimits` array (otherwise execution
// fails on missing remaining accounts).
export async function buildExecute(
  conn: Connection,
  multisigPda: PublicKey,
  transactionIndex: bigint,
  member: PublicKey,
): Promise<VersionedTransaction> {
  const [txPda] = multisig.getTransactionPda({ multisigPda, index: transactionIndex });
  // 15s cache — tx account is immutable once created, this protects against
  // the dialog opening and re-fetching on each render.
  const info = await cachedGetAccountInfo(conn, txPda, 15_000);
  const kind = classifyTxAccount(info?.data);

  let executeIx;
  if (kind === "vault") {
    const { instruction } = await multisig.instructions.vaultTransactionExecute({
      connection: conn,
      multisigPda,
      transactionIndex,
      member,
    });
    executeIx = instruction;
  } else if (kind === "config") {
    const [configTxAccount] = multisig.accounts.ConfigTransaction.fromAccountInfo(info!);
    const spendingLimits: PublicKey[] = [];
    for (const action of configTxAccount.actions) {
      if (action.__kind === "AddSpendingLimit") {
        const [pda] = multisig.getSpendingLimitPda({
          multisigPda,
          createKey: action.createKey,
        });
        spendingLimits.push(pda);
      } else if (action.__kind === "RemoveSpendingLimit") {
        spendingLimits.push(action.spendingLimit);
      }
    }
    executeIx = multisig.instructions.configTransactionExecute({
      multisigPda,
      transactionIndex,
      member,
      rentPayer: member,
      spendingLimits: spendingLimits.length ? spendingLimits : undefined,
    });
  } else if (kind === "batch") {
    throw new Error("Batch transaction execution is not supported yet.");
  } else {
    throw new Error(`Unknown transaction kind at index ${transactionIndex} (${txPda.toBase58()}). The account may be missing or corrupted.`);
  }

  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: member,
    recentBlockhash: blockhash,
    instructions: [executeIx],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL));
}

export function shortAddress(addr: string | PublicKey, head = 4, tail = 4): string {
  const s = typeof addr === "string" ? addr : addr.toBase58();
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// Force VaultTransaction symbol to be considered "used" — keeps it in the
// import list so downstream tabs can pull richer instruction details later.
export { VaultTransaction };
