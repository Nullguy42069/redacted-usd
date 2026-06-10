import type { BackendStaticMeta } from "../types";

// Hand-curated registry of every privacy backend on Solana we know about as of
// the date below. SECURITY > RELIABILITY > PRIVACY > SPEED > COST.
//
// Scanner (scripts/weekly-privacy-scan.mjs) auto-enrolls from here, proposes
// upgrades + new candidates to docs/proposed-candidates/. NEVER auto-mutates
// this file or loads candidates at runtime. Promotion requires audit + 2
// reviewers (one cryptographer) + multisig trail. Single high-privacy path
// for any flagship intent is a hard blocker on promotion.
//
// Privacy scoring rubric (0-100):
//   • +25 — encrypted computation (not just at-rest encryption)
//   • +20 — no hardware-trust assumption (i.e. cryptographic only)
//   • +15 — production audit by a top-tier firm
//   • +15 — mainnet-live with non-trivial usage
//   • +10 — no honest-majority validator assumption for privacy
//   • +10 — works without a separate offchain coordinator
//   • +5 — open-source backend implementation
// Subtract:
//   •  -X — known limitations stamped in trustNotes
//
// We document scoring in the meta so any auditor can recompute it.

export const REGISTRY: BackendStaticMeta[] = [
  {
    id: "arcium",
    selectionStatus: "active",
    displayName: "Arcium MPC",
    trustModel: "mpc",
    auditStatus: "audited",
    privacyScore: 80, // 25 (encrypted compute) + 20 (no hw trust) + 15 (audit) + 10 (no validator-honesty) + 5 (open) + 5 (mainnet alpha, modest usage)
    supportedIntents: ["setup_multisig", "vote", "compute", "auction"],
    network: "mainnet",
    baselineLatencyMs: 30_000,
    baselineCostLamports: 10_000,
    trustNotes: [
      "Requires at least 1 honest MPC node (Cerberus backend).",
      "Cluster liveness — votes get stuck if the MPC cluster degrades.",
      "Latency ~30s per computation in current network.",
    ],
    lastVerifiedAt: "2026-05-30",
  },
  {
    id: "magicblock-tee",
    selectionStatus: "active",
    displayName: "MagicBlock TEE (Intel TDX)",
    trustModel: "tee",
    auditStatus: "audited",
    // Phase 2: private_vote_tee program is deployed-ready and the adapter
    // drives it for vote intents. Score: 25 (encrypted compute, behind hw) +
    // 15 (audit) + 15 (mainnet) + 5 (open SDK) = 60. No "no-hw-trust" bonus
    // because TDX is hardware-rooted.
    privacyScore: 60,
    supportedIntents: ["setup_multisig", "vault_transfer", "create_vote", "vote", "finalize_vote"],
    network: "mainnet",
    baselineLatencyMs: 50,
    baselineCostLamports: 5_000,
    trustNotes: [
      "Trusts Intel TDX hardware + remote attestation for vote execution.",
      "Vote tally stored plaintext on-chain after commit; privacy is execution-time only.",
      "Side-channel attacks on TDX would compromise privacy.",
      "Lifecycle: init_vote_state → delegate_for_tee → cast_vote (in rollup) → finalize_and_commit → cpi_proposal_approve. Delegate/finalize/approve ixs are exposed by private_vote_tee program but not yet wired as separate routed intents — currently only cast_vote routes through here.",
    ],
    lastVerifiedAt: "2026-05-31",
  },
  {
    id: "encrypt-fhe",
    selectionStatus: "monitor",
    displayName: "Encrypt FHE",
    trustModel: "fhe",
    auditStatus: "unaudited",
    privacyScore: 70, // 25 (encrypted compute) + 20 (no hw trust) + 10 (no validator honesty) + 10 (no offchain coordinator with threshold) + 5 (open) — minus audit
    supportedIntents: ["vote", "compute", "transfer"],
    network: "devnet",
    baselineLatencyMs: 10_000,
    baselineCostLamports: 20_000,
    trustNotes: [
      "Pre-mainnet (devnet Q2 2026, mainnet later 2026).",
      "Threshold FHE for scaling — operates in async communication model.",
      "Latency / cost numbers are project claims, not benchmarked.",
    ],
    lastVerifiedAt: "2026-05-30",
  },
  {
    id: "token2022-confidential",
    selectionStatus: "active",
    displayName: "Token-2022 Confidential Transfers",
    trustModel: "validators",
    auditStatus: "audited",
    privacyScore: 50, // 20 (encrypted balances) + 15 (audit) + 15 (mainnet, broad use) — limited to balance privacy only
    supportedIntents: ["transfer", "vault_transfer"],
    network: "mainnet",
    baselineLatencyMs: 1_000,
    baselineCostLamports: 5_000,
    trustNotes: [
      "Hides token transfer amounts via ElGamal + ZK range proofs.",
      "Does NOT hide sender/receiver, only amount.",
      "Native Solana primitive — no external trust beyond validator set.",
    ],
    lastVerifiedAt: "2026-05-30",
  },
  {
    id: "light-compressed",
    selectionStatus: "active",
    displayName: "Light Protocol (ZK Compression + Confidential Transfers)",
    trustModel: "validators",
    auditStatus: "audited",
    // 2026 reality: Strong ZK infrastructure + shielded transfer flows.
    // Excellent cost layer + real confidentiality options when used with
    // Token-2022 confidential extensions or custom ZK circuits.
    // Not a standalone replacement for Arcium/TEE on high-stakes private voting,
    // but a first-class citizen for transfers and as a scaling/privacy foundation.
    privacyScore: 45,
    supportedIntents: ["storage", "transfer", "vault_transfer"],
    network: "mainnet",
    baselineLatencyMs: 800,
    baselineCostLamports: 5000,
    trustNotes: [
      "Native compression is a cost/scalability primitive (state remains committed on-chain).",
      "When combined with ZK shielded transfer flows or Token-2022 Confidential Balances, provides strong confidentiality for amounts (and optionally participants).",
      "Ideal as a high-performance layer underneath Arcium MPC or MagicBlock TEE for private voting / governance state.",
      "Sponsors and actively supports 2026 Solana privacy ecosystem (Privacy Hack, ZK tooling).",
    ],
    lastVerifiedAt: "2026-05-31",
  },
  {
    id: "zkprime",
    selectionStatus: "monitor",
    displayName: "ZKPRIME",
    trustModel: "zk",
    auditStatus: "unaudited",
    privacyScore: 45, // 20 (ZK-encrypted state) + 15 (mainnet) + 10 (some hardware enclaves) — minus audit
    supportedIntents: ["compute", "storage", "transfer"],
    network: "mainnet",
    baselineLatencyMs: 5_000,
    baselineCostLamports: 8_000,
    trustNotes: [
      "ZK proofs + secure enclaves hybrid; less battle-tested than Arcium / MagicBlock.",
      "Modular SDK, claims ~99% cheaper state via compression.",
    ],
    lastVerifiedAt: "2026-05-30",
  },
  {
    id: "squads-plain",
    selectionStatus: "active",
    displayName: "Public vault (no privacy)",
    trustModel: "validators",
    auditStatus: "audited",
    privacyScore: 0,
    supportedIntents: ["setup_multisig", "vault_transfer", "vote", "transfer", "storage"],
    network: "mainnet",
    baselineLatencyMs: 800,
    baselineCostLamports: 5_000,
    trustNotes: [
      "Explicit fallback when the user prioritizes cost over privacy.",
      "All votes / state public on-chain.",
    ],
    lastVerifiedAt: "2026-05-30",
  },
];

export function getMeta(id: BackendStaticMeta["id"]): BackendStaticMeta {
  const m = REGISTRY.find((b) => b.id === id);
  if (!m) throw new Error(`unknown backend: ${id}`);
  return m;
}
