import type { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

// ─────────────── Intents ───────────────

// What the user is trying to do, in privacy-relevant terms. The aggregator
// classifies an incoming request into one of these so we can pick the right
// backend; each backend declares which intents it supports.
export type IntentType =
  | "setup_multisig" // create a new vault (router picks gating backend)
  | "vault_transfer" // propose a transfer out of a vault (router picks inner-ix backend)
  | "create_vote" // open a private vote session (init vote_state + delegate to ER)
  | "vote" // multi-party encrypted vote with threshold reveal
  | "finalize_vote" // close the session, commit state, trigger the Squads approval
  | "transfer" // move a token while hiding amount (and optionally sender/receiver)
  | "auction" // sealed-bid auction
  | "compute" // generic encrypted computation
  | "storage"; // cheap private state storage

export type SetupMultisigIntent = {
  type: "setup_multisig";
  creator: PublicKey;
  // Voting members. For a wrapped Arcium vault these are the real voters; for
  // a plain Squads vault they are the on-chain members directly.
  members: PublicKey[];
  threshold: number;
  // Optional explicit per-member Squads permission masks (bit 0=Initiate, 1=Vote,
  // 2=Execute). Index-matched with `members`. If omitted, the backend assigns
  // safe defaults (typically full permissions = mask 7 for the plain Squads path).
  // Privacy-wrapped backends may ignore this field if their design pins the
  // permission distribution (e.g. Arcium splits Vote+Execute to its wrapper PDA).
  memberPermissions?: number[];
};

// Step 1 of the 3-step TEE vote lifecycle: init the vote_state PDA for a given
// (multisig, transactionIndex) with its real voter set + threshold, then
// delegate it to MagicBlock so subsequent `vote` ixs execute inside the ER.
export type CreateVoteIntent = {
  type: "create_vote";
  multisig: PublicKey;
  transactionIndex: bigint;
  creator: PublicKey; // payer + signer for init + delegate
  members: PublicKey[];
  threshold: number;
};

export type VoteIntent = {
  type: "vote";
  multisig: PublicKey;
  transactionIndex: bigint;
  choice: boolean;
  voter: PublicKey;
};

// Step 3: pull the delegated vote_state back, commit final tally to base layer,
// then CPI into Squads to record the wrapper's approval on the proposal.
export type FinalizeVoteIntent = {
  type: "finalize_vote";
  multisig: PublicKey;
  transactionIndex: bigint;
  trigger: PublicKey; // payer + signer
};

export type TransferIntent = {
  type: "transfer";
  from: PublicKey;
  to: PublicKey;
  mint: PublicKey;
  amount: bigint;
  hideAmount: boolean;
  hideRecipient: boolean;
};

// Propose a transfer of assets OUT of a multisig vault. Always wrapped in a
// Squads vault transaction; the privacy choice is which inner transfer ix the
// vault tx executes (plain SystemProgram/SPL vs Token-2022 confidential).
export type VaultTransferIntent = {
  type: "vault_transfer";
  // The Squads multisig that owns the vault.
  multisig: PublicKey;
  vault: PublicKey;
  // The Squads tx index to use for this proposal (current + 1).
  transactionIndex: bigint;
  creator: PublicKey;
  // Recipient + asset.
  to: PublicKey;
  // null = native SOL; otherwise the SPL/Token-2022 mint pubkey.
  mint: PublicKey | null;
  amount: bigint;
  // User's optional memo (encrypted only in confidential backends).
  memo?: string;
};

export type AuctionIntent = {
  type: "auction";
  auctionId: PublicKey;
  bidder: PublicKey;
  bidAmount: bigint;
};

export type ComputeIntent = {
  type: "compute";
  program: PublicKey;
  circuit: string;
  inputs: unknown; // backend-specific
};

export type StorageIntent = {
  type: "storage";
  key: PublicKey;
  data: Uint8Array;
};

export type Intent =
  | SetupMultisigIntent
  | VaultTransferIntent
  | CreateVoteIntent
  | VoteIntent
  | FinalizeVoteIntent
  | TransferIntent
  | AuctionIntent
  | ComputeIntent
  | StorageIntent;

// ─────────────── Backend capabilities ───────────────

// Subjective privacy strength score. Lifted to 0-100 so it can be weighted
// against speed and cost. See backends/registry.ts for how each backend earns
// its score and the rationale we'd defend in an audit.
export type PrivacyScore = number; // 0-100, higher = stronger

export type TrustModel =
  | "validators" // standard Solana, no extra trust
  | "tee" // Intel TDX / SGX hardware attestation
  | "mpc" // 1-of-N or M-of-N honest MPC nodes
  | "fhe" // mathematical (FHE soundness)
  | "zk"; // ZK proof system soundness

export type AuditStatus = "unaudited" | "in-audit" | "audited" | "formally-verified";

export type BackendId =
  | "arcium"
  | "magicblock-tee"
  | "encrypt-fhe"
  | "token2022-confidential"
  | "light-compressed"
  | "zkprime"
  | "squads-plain"; // explicit "no privacy" route for cost-priority intents

// Static, hand-curated capabilities. Updated weekly by scripts/weekly-privacy-scan.mjs.
export type BackendStaticMeta = {
  id: BackendId;
  displayName: string;
  trustModel: TrustModel;
  auditStatus: AuditStatus;
  privacyScore: PrivacyScore;
  // Intents this backend can handle. The router never asks a backend about an
  // intent it doesn't support.
  supportedIntents: IntentType[];
  // Network status — "mainnet" means production-ready, "devnet" means we'd
  // route to it only behind an explicit opt-in.
  network: "mainnet" | "devnet" | "preview";
  // What the project itself claims for expected latency + cost — these are
  // starting points, overridden by live health data once we have it.
  baselineLatencyMs: number;
  baselineCostLamports: number;
  // Trust-model footnotes the user / auditor should see surfaced in the UI.
  trustNotes: string[];
  // Last time we re-verified these numbers via the scanner.
  lastVerifiedAt: string; // ISO date
  // Selection eligibility. SECURITY-CRITICAL and default-deny: the router only
  // ever routes user funds through backends explicitly marked "active". The
  // weekly scanner may auto-add a newly discovered backend at "monitor", but
  // promotion to "active" requires a human to (a) write/audit the adapter and
  // (b) flip this field. "quarantined" = known-bad / regressed, never routed.
  //   • active     — vetted, adapter written, selectable
  //   • monitor    — catalogued by scanner, NOT selectable, awaiting human audit
  //   • quarantined — explicitly disabled (security regression / failed audit)
  selectionStatus: "active" | "monitor" | "quarantined";
};

// Live health snapshot. The health monitor maintains this; the router multiplies
// in the latest values when scoring.
export type BackendHealth = {
  available: boolean;
  successRate: number; // 0-1 over recent window
  p50LatencyMs: number;
  p95LatencyMs: number;
  lastFailureAt: string | null; // ISO
  sampleCount: number;
};

// ─────────────── Routing policy ───────────────

// How the user wants to weigh speed vs privacy vs cost. Vault settings can pin
// these per-vault. Defaults favor a balanced mix.
export type PolicyWeights = {
  speed: number; // 0-100
  privacy: number; // 0-100
  cost: number; // 0-100
};

export const BALANCED_POLICY: PolicyWeights = { speed: 30, privacy: 40, cost: 30 };
export const PRIVACY_PRIORITY: PolicyWeights = { speed: 10, privacy: 80, cost: 10 };
export const SPEED_PRIORITY: PolicyWeights = { speed: 70, privacy: 20, cost: 10 };
export const COST_PRIORITY: PolicyWeights = { speed: 20, privacy: 10, cost: 70 };

export type Policy = {
  weights: PolicyWeights;
  // Hard constraints — backends that violate these are eliminated before scoring.
  minPrivacyScore?: number;
  maxLatencyMs?: number;
  maxCostLamports?: number;
  // Allow-list of backends the user is willing to use. Empty = all.
  allowList?: BackendId[];
  // Deny-list overrides allow-list — backends the user refuses to use.
  denyList?: BackendId[];
};

// ─────────────── Routing output ───────────────

export type BackendScore = {
  backendId: BackendId;
  total: number; // composite score the router used to rank
  speed: number;
  privacy: number;
  cost: number;
  expectedLatencyMs: number;
  expectedCostLamports: number;
  privacyScore: PrivacyScore;
  // True when expectedCostLamports came from a live simulateTransaction call
  // rather than the backend's static estimate.
  costSimulated?: boolean;
  // If a backend was eliminated by a hard constraint, this carries why.
  eliminatedReason?: string;
};

export type RoutingDecision = {
  intent: Intent;
  policy: Policy;
  winner: BackendId | null;
  scores: BackendScore[]; // sorted desc by total, includes eliminated entries
  decidedAt: string; // ISO
};

// ─────────────── Backend adapter interface ───────────────

export type SubmitResult = {
  signature: string;
  status: "submitted" | "confirmed" | "finalized";
  // Backend-specific output (e.g. multisigPda after setup, computation offset
  // for MPC, etc.). Returned to the caller so they can pick up the artifacts.
  meta?: Record<string, unknown>;
};

// What a backend hands back from buildTransactions. The tx list is what the
// user wallet signs; additionalSigners cover backend-internal keypairs (e.g.
// Squads createKey); meta is for downstream consumers (e.g. the UI showing
// "your vault is at <multisigPda>").
export type BuildResult = {
  txs: VersionedTransaction[];
  additionalSigners?: Keypair[];
  meta?: Record<string, unknown>;
};

// Every privacy backend implements this — different mechanisms, same shape so
// the router can swap between them without caring.
export interface PrivacyBackend {
  readonly id: BackendId;
  readonly meta: BackendStaticMeta;

  // Cheap check before scoring. Returns false if this backend can't handle the
  // intent at all (e.g. asking Arcium to handle a "storage" intent).
  canHandle(intent: Intent): boolean;

  // Backend-specific cost estimate for this exact intent. May call out to live
  // pricing if available; otherwise returns baseline from meta.
  estimateCost(intent: Intent, conn: Connection): Promise<number>;
  estimateLatencyMs(intent: Intent, conn: Connection): Promise<number>;

  // Build the transaction(s) for the connected wallet to sign. May include
  // additional ephemeral signers (e.g. Squads createKey for setup_multisig).
  buildTransactions(
    intent: Intent,
    conn: Connection,
    signer: PublicKey,
  ): Promise<BuildResult>;

  // Optional: submit + wait helper.
  submit?(
    build: BuildResult,
    conn: Connection,
    sendAndConfirm: (tx: VersionedTransaction) => Promise<string>,
  ): Promise<SubmitResult>;
}
