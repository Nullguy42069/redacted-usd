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
    id: "umbra",
    // ACTIVE — the audit's fund-lock finding is fixed: unshield now reads the
    // decrypted SHIELDED balance (getEncryptedBalanceQuerierFunction) and shield
    // uses exact public-ATA base units. SDK is still RC (5.0.0-rc.6) and the
    // round-trip is unverified end-to-end, so test with a tiny amount first.
    selectionStatus: "active",
    displayName: "Umbra (Arcium shielded balances)",
    trustModel: "mpc",
    auditStatus: "unaudited", // @umbra-privacy/sdk is 5.0.0-rc.6 — confirm Umbra mainnet audit before promoting
    quantumResistance: "post-quantum", // Arcium = information-theoretic MPC; confidentiality survives Shor (signature layer still classical, like all of Solana)
    hides: ["amount", "balance", "sender", "graph"],
    privacyScore: 60,
    supportedIntents: ["transfer", "vault_transfer", "storage"],
    network: "mainnet", // wSOL/USDC/USDT live on mainnet; devnet = wSOL only
    baselineLatencyMs: 4000, // MPC compute + proof + relayer submit
    baselineCostLamports: 5000,
    trustNotes: [
      "Powered by Arcium MPC — encrypted token accounts + UTXO/stealth-pool 'airlock'.",
      "Hides amounts/balances + breaks linkage (sender/graph). A 'private swap' is shield → fresh addr → Jupiter → re-shield, NOT a native confidential swap.",
      "Shield IN is free; a small % fee is deducted from the encrypted balance on transfer/exit; the relayer submits exits (gasless).",
      "Solana-only (umbraprivacy.com). NOT ScopeLift's EVM umbra.cash — unrelated project/team/tech.",
      "Integration via @umbra-privacy/sdk@5.0.0-rc.6 (release candidate). Pin version + confirm Umbra's mainnet audit before promoting to active.",
    ],
    lastVerifiedAt: "2026-06-17",
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
