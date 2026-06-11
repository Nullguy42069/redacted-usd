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
    id: "light-compressed",
    selectionStatus: "active",
    displayName: "Light Protocol (ZK Compression + Confidential Transfers)",
    trustModel: "validators",
    auditStatus: "audited",
    // 2026 reality: Strong ZK infrastructure + shielded transfer flows.
    // Excellent cost layer + real confidentiality options via ZK compression
    // and shielded transfers. A first-class citizen for transfers and as a
    // scaling/privacy foundation.
    quantumResistance: "classical", // shielded-transfer proofs are pairing-based (Groth16); the Merkle/hash commitment layer is itself PQ
    hides: ["amount"],
    privacyScore: 45,
    supportedIntents: ["storage", "transfer", "vault_transfer"],
    network: "mainnet",
    baselineLatencyMs: 800,
    baselineCostLamports: 5000,
    trustNotes: [
      "Native compression is a cost/scalability primitive (state remains committed on-chain).",
      "ZK shielded transfer flows provide strong confidentiality for amounts (and optionally participants).",
      "Helius-aligned — same vendor as our RPC; cheap + fast via ZK compression.",
      "Sponsors and actively supports 2026 Solana privacy ecosystem (Privacy Hack, ZK tooling).",
    ],
    lastVerifiedAt: "2026-05-31",
  },
  {
    id: "squads-plain",
    selectionStatus: "active",
    displayName: "Public vault (no privacy)",
    trustModel: "validators",
    auditStatus: "audited",
    quantumResistance: "classical", // no confidentiality; base Ed25519 signatures are classical like all of Solana
    hides: [],
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
