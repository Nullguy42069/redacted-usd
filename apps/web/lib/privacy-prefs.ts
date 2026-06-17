"use client";
// Per-vault privacy preferences. Users pick which privacy backend they want
// the router to prefer for each activity category. Saved in localStorage
// for v1; once the privacy layer ships, the router consumes these.

import { REGISTRY } from "@redacted-usd/aggregator";

export type ActivityKey = "transfers" | "swap";

export type ActivityDef = {
  key: ActivityKey;
  title: string;
  blurb: string;
  // Which registry IntentType(s) a backend must support to be a candidate
  // for this activity category. ANY-of: a backend qualifies if it supports
  // at least one of the listed intents.
  intents: string[];
  // Recommended default backend id when no preference is set.
  defaultBackendId: string;
  // Short hint about the typical trade-off priority for this category.
  priority: "Privacy" | "Speed" | "Balanced";
};

// Defaults pinned to squads-plain (Public vault, no privacy) across the board.
// Umbra (Arcium shielded balances) is the privacy backend for transfers; the
// public route stays the safe default until Umbra's shield/unshield path is
// verified end-to-end. Privacy is chosen per-asset via the Private/Public toggle.
export const ACTIVITIES: ActivityDef[] = [
  {
    key: "transfers",
    title: "Token transfers (Send)",
    blurb: "Moving tokens out of the vault — payments, payroll, vendor invoices. Hiding amounts and counterparties usually matters most here.",
    intents: ["transfer", "vault_transfer"],
    defaultBackendId: "squads-plain",
    priority: "Privacy",
  },
  {
    key: "swap",
    title: "Shielded swaps",
    blurb: "Swapping one token for another while hiding the amounts. Shield-swap = swap + confidential settlement in one flow.",
    intents: ["transfer", "vault_transfer"],
    defaultBackendId: "squads-plain",
    priority: "Balanced",
  },
];

// Public meta we expose to the UI. Mirrors registry shape but only the fields
// the picker needs, so changes in the registry don't ripple.
export type BackendOption = {
  id: string;
  displayName: string;
  privacyScore: number;        // 0-100
  baselineLatencyMs: number;
  baselineCostLamports: number;
  trustModel: string;
  auditStatus: string;
  network: string;
  selectionStatus: string;     // "active" | "monitor" | "deprecated"
  trustNotes: string[];
};

export function backendsForActivity(activity: ActivityDef): BackendOption[] {
  return REGISTRY
    .filter((b) => activity.intents.some((i) => b.supportedIntents.includes(i as any)))
    .map((b) => ({
      id: b.id,
      displayName: b.displayName,
      privacyScore: b.privacyScore,
      baselineLatencyMs: b.baselineLatencyMs,
      baselineCostLamports: b.baselineCostLamports,
      trustModel: b.trustModel,
      auditStatus: b.auditStatus,
      network: b.network,
      selectionStatus: b.selectionStatus,
      trustNotes: b.trustNotes,
    }))
    // Sort: active ones first, then by privacy score descending.
    .sort((a, b) => {
      const sa = a.selectionStatus === "active" ? 0 : 1;
      const sb = b.selectionStatus === "active" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return b.privacyScore - a.privacyScore;
    });
}

// ─── Storage ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "redacted-privacy-prefs-v1";

type StoredShape = {
  vaults: Record<string, Partial<Record<ActivityKey, string>>>;
};

function read(): StoredShape {
  if (typeof window === "undefined") return { vaults: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { vaults: {} };
    const p = JSON.parse(raw);
    if (p && p.vaults && typeof p.vaults === "object") return p;
  } catch {}
  return { vaults: {} };
}

function write(p: StoredShape) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

// Special "vault" key for the user's global default preference, applied when
// no per-vault preference exists yet (e.g. during Create Vault, before the
// new vault PDA is known).
const DEFAULT_VAULT_KEY = "__default__";

export function getBackendIdFor(vault: string, key: ActivityKey): string {
  const p = read();
  const stored = p.vaults[vault]?.[key];
  if (stored) return stored;
  const fallback = p.vaults[DEFAULT_VAULT_KEY]?.[key];
  if (fallback) return fallback;
  return ACTIVITIES.find((a) => a.key === key)!.defaultBackendId;
}

export function setBackendIdFor(vault: string, key: ActivityKey, backendId: string) {
  const p = read();
  if (!p.vaults[vault]) p.vaults[vault] = {};
  p.vaults[vault][key] = backendId;
  // Mirror the per-vault change to the user's account-wide default so the
  // next vault they create inherits this preference too.
  if (vault !== DEFAULT_VAULT_KEY) {
    if (!p.vaults[DEFAULT_VAULT_KEY]) p.vaults[DEFAULT_VAULT_KEY] = {};
    p.vaults[DEFAULT_VAULT_KEY][key] = backendId;
  }
  write(p);
}

// Read/write the user's account-wide default for an activity. Read by
// CreateVaultDialog (before the new vault PDA exists) so the user's pref
// flows into the brand-new vault.
export function getDefaultBackendId(key: ActivityKey): string {
  return getBackendIdFor(DEFAULT_VAULT_KEY, key);
}

export function setDefaultBackendId(key: ActivityKey, backendId: string) {
  setBackendIdFor(DEFAULT_VAULT_KEY, key, backendId);
}

export function resetVault(vault: string) {
  const p = read();
  delete p.vaults[vault];
  write(p);
}

// Humanize latency for the picker UI.
export function humanizeLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `~${Math.round(ms / 100) / 10}s`;
  return `~${Math.round(ms / 1000)}s`;
}

export function humanizeCost(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol < 0.0001) return `${lamports.toLocaleString()} lamports`;
  return `~${sol.toFixed(4)} SOL`;
}
