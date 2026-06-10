// Local persistence for the user's "trusted vaults" list — mirrors Safe's
// per-browser address book. Lives in localStorage; we never sync to a server
// (private by default).

const STORAGE_KEY = "redacted-vaults";

export type SavedVault = {
  address: string; // base58 multisig PDA
  name?: string;
  bookmarked: boolean;
  readOnly: boolean;
  addedAt: string; // ISO
  // Optional UI cache so the list can render balances before the network call
  // resolves on each load.
  lastBalanceLamports?: number;
  lastBalanceUsd?: number;
  lastSeenAt?: string; // ISO
  avatar?: string; // data URL for custom PFP
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadVaults(): SavedVault[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedVault[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveVaults(list: SavedVault[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addVault(v: Omit<SavedVault, "addedAt"> & { addedAt?: string }): SavedVault[] {
  const list = loadVaults();
  const existing = list.findIndex((x) => x.address === v.address);
  const next: SavedVault = {
    ...v,
    addedAt: v.addedAt ?? new Date().toISOString(),
  };
  if (existing >= 0) list[existing] = { ...list[existing], ...next };
  else list.unshift(next);
  saveVaults(list);
  return list;
}

export function removeVault(address: string): SavedVault[] {
  const list = loadVaults().filter((v) => v.address !== address);
  saveVaults(list);
  return list;
}

export function updateVault(address: string, patch: Partial<SavedVault>): SavedVault[] {
  const list = loadVaults().map((v) => (v.address === address ? { ...v, ...patch } : v));
  saveVaults(list);
  return list;
}

export function exportVaults(): string {
  return JSON.stringify({ version: 1, vaults: loadVaults() }, null, 2);
}

export function importVaults(json: string, mode: "merge" | "replace" = "merge"): SavedVault[] {
  const parsed = JSON.parse(json) as { version?: number; vaults?: SavedVault[] };
  if (!Array.isArray(parsed.vaults)) throw new Error("invalid export file");
  const incoming = parsed.vaults;
  if (mode === "replace") {
    saveVaults(incoming);
    return incoming;
  }
  const map = new Map<string, SavedVault>();
  for (const v of loadVaults()) map.set(v.address, v);
  for (const v of incoming) map.set(v.address, { ...map.get(v.address), ...v });
  const merged = [...map.values()];
  saveVaults(merged);
  return merged;
}

// --- Last selected vault persistence (per wallet) ---

const LAST_SELECTED_PREFIX = "redacted-last-selected-vault";

export function getLastSelectedVault(walletAddress: string | null): string | null {
  if (!isBrowser() || !walletAddress) return null;
  try {
    return window.localStorage.getItem(`${LAST_SELECTED_PREFIX}:${walletAddress}`);
  } catch {
    return null;
  }
}

export function setLastSelectedVault(walletAddress: string, vaultAddress: string): void {
  if (!isBrowser() || !walletAddress) return;
  window.localStorage.setItem(`${LAST_SELECTED_PREFIX}:${walletAddress}`, vaultAddress);
}

// --- Last used mode (personal wallet vs vault) persistence per connected wallet ---

const LAST_MODE_PREFIX = "redacted-last-mode";

export function getLastMode(walletAddress: string | null): 'personal' | 'vault' | null {
  if (!isBrowser() || !walletAddress) return null;
  try {
    const val = window.localStorage.getItem(`${LAST_MODE_PREFIX}:${walletAddress}`);
    return (val === 'personal' || val === 'vault') ? val : null;
  } catch {
    return null;
  }
}

export function setLastMode(walletAddress: string, mode: 'personal' | 'vault'): void {
  if (!isBrowser() || !walletAddress) return;
  window.localStorage.setItem(`${LAST_MODE_PREFIX}:${walletAddress}`, mode);
}

// --- Watchlist layout (draggable order + stretch heights) and favorites, per owner (wallet or vault) ---

const WATCHLIST_LAYOUT_PREFIX = "redacted-watchlist-layout";
const WATCHLIST_FAVS_PREFIX = "redacted-watchlist-favs";
const FAVS_KEY = "redacted-watchlist-favorites"; // legacy global for migration

export type WatchlistLayout = { order: string[]; heights: number[] };

export interface WatchlistFav {
  id: string;
  name: string;
  symbol: string;
  ca?: string;
  type: "defi" | "tradfi";
}

export function getWatchlistLayout(owner: string | null): WatchlistLayout | null {
  if (!isBrowser() || !owner) return null;
  try {
    const raw = window.localStorage.getItem(`${WATCHLIST_LAYOUT_PREFIX}:${owner}`);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.order) && Array.isArray(p.heights)) return p as WatchlistLayout;
    }
    // one-time fallback from old global keys (pre per-wallet)
    const oh = window.localStorage.getItem("watchlist-heights");
    const oo = window.localStorage.getItem("watchlist-order");
    if (oh && oo) {
      const h = JSON.parse(oh);
      const o = JSON.parse(oo);
      if (Array.isArray(h) && Array.isArray(o)) return { order: o, heights: h };
    }
    return null;
  } catch {
    return null;
  }
}

export function setWatchlistLayout(owner: string, layout: WatchlistLayout): void {
  if (!isBrowser() || !owner) return;
  window.localStorage.setItem(`${WATCHLIST_LAYOUT_PREFIX}:${owner}`, JSON.stringify(layout));
}

export function getWatchlistFavs(owner: string | null): WatchlistFav[] {
  if (!isBrowser()) return [];
  try {
    const key = owner ? `${WATCHLIST_FAVS_PREFIX}:${owner}` : FAVS_KEY;
    let raw = window.localStorage.getItem(key);
    if (!raw && owner) {
      // migrate from global
      raw = window.localStorage.getItem(FAVS_KEY);
    }
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as WatchlistFav[]) : [];
  } catch {
    return [];
  }
}

export function setWatchlistFavs(owner: string | null, favs: WatchlistFav[]): void {
  if (!isBrowser()) return;
  const key = owner ? `${WATCHLIST_FAVS_PREFIX}:${owner}` : FAVS_KEY;
  window.localStorage.setItem(key, JSON.stringify(favs));
}
