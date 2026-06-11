// Single source of truth for the privacy-aggregator UI (per-transaction picker,
// Assets "Private" toggle, Settings default). It derives everything from the
// aggregator REGISTRY and layers on (a) display props for the quantum class /
// "what it hides", and (b) an HONEST per-backend readiness flag.
//
// Why readiness matters: REGISTRY.selectionStatus is "active" for both
// backends, but Light gives no privacy for native SOL (it falls back to a
// public transfer). For a PRIVACY product, a toggle that says "shielded" while
// routing through a stub is the worst possible bug — so the UI gates on
// `readiness`, not on selectionStatus alone. Flip an entry to "live" only when
// its shield path is actually implemented + verified end-to-end.

import { REGISTRY } from "@redacted-usd/aggregator";
import type { BackendId, QuantumClass, PrivacyDimension } from "@redacted-usd/aggregator";

export type Readiness = "live" | "partial" | "in-development" | "devnet" | "voting-only";

// Hand-curated reality check, kept next to the metadata so it's auditable.
const READINESS: Record<BackendId, { readiness: Readiness; note: string }> = {
  "squads-plain": { readiness: "live", note: "Public transfer — no privacy. The safe default." },
  "light-compressed": { readiness: "partial", note: "Compresses SPL tokens; native SOL falls back to a public transfer (no privacy)." },
};

const QUANTUM_LABEL: Record<QuantumClass, string> = {
  "post-quantum": "Post-quantum",
  classical: "Classical (quantum-vulnerable)",
  hardware: "Hardware (TEE)",
  hybrid: "Hybrid / unverified",
};
const QUANTUM_COLOR: Record<QuantumClass, string> = {
  "post-quantum": "#22c55e", // green
  classical: "#f59e0b", // amber — fine today, not future-proof
  hardware: "#3b82f6", // blue
  hybrid: "#a855f7", // purple
};
const READINESS_LABEL: Record<Readiness, string> = {
  live: "Live",
  partial: "Partial",
  "in-development": "In development",
  devnet: "Devnet",
  "voting-only": "Voting only",
};
const HIDES_LABEL: Record<PrivacyDimension, string> = {
  amount: "Amount",
  balance: "Balance",
  sender: "Sender",
  receiver: "Receiver",
  graph: "Tx graph",
  compute: "Computation",
};

export type ProtocolView = {
  id: BackendId;
  name: string;
  privacyScore: number;
  quantum: QuantumClass;
  quantumLabel: string;
  quantumColor: string;
  hides: PrivacyDimension[];
  hidesLabels: string[];
  trustModel: string;
  auditStatus: string;
  network: string;
  costLamports: number;
  latencyMs: number;
  trustNotes: string[];
  readiness: Readiness;
  readinessLabel: string;
  readinessNote: string;
  /** True only when this backend can actually shield an asset transfer today. */
  shieldable: boolean;
};

function toView(id: BackendId): ProtocolView {
  const m = REGISTRY.find((b) => b.id === id)!;
  const r = READINESS[id];
  const supportsShield = m.supportedIntents.includes("vault_transfer") || m.supportedIntents.includes("transfer");
  return {
    id: m.id, name: m.displayName, privacyScore: m.privacyScore,
    quantum: m.quantumResistance, quantumLabel: QUANTUM_LABEL[m.quantumResistance], quantumColor: QUANTUM_COLOR[m.quantumResistance],
    hides: m.hides, hidesLabels: m.hides.map((h) => HIDES_LABEL[h]),
    trustModel: m.trustModel, auditStatus: m.auditStatus, network: m.network,
    costLamports: m.baselineCostLamports, latencyMs: m.baselineLatencyMs, trustNotes: m.trustNotes,
    readiness: r.readiness, readinessLabel: READINESS_LABEL[r.readiness], readinessNote: r.note,
    shieldable: r.readiness === "live" && supportsShield && m.privacyScore > 0,
  };
}

/** All protocols, ordered by privacy strength (for Settings + the picker). */
export const PROTOCOLS: ProtocolView[] = REGISTRY.map((b) => toView(b.id)).sort((a, b) => b.privacyScore - a.privacyScore);

export const getProtocol = (id: string): ProtocolView | undefined => PROTOCOLS.find((p) => p.id === id);

/** Protocols offered for shielding an asset (privacy backends only; excludes the public route). */
export const shieldingProtocols = (): ProtocolView[] => PROTOCOLS.filter((p) => p.privacyScore > 0);

/** Any shield path actually usable on mainnet today? Drives the toggle's enabled state. */
export const hasLiveShield = (): boolean => PROTOCOLS.some((p) => p.shieldable);
