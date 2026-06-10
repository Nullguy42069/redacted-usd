"use client";
// Local-data export / import for the Settings → Data tab.
//
// What we export: every localStorage key Redacted writes to — saved vaults,
// per-wallet vault selections + modes, watchlist customizations, theme mode,
// notification prefs, privacy prefs, custom dApps, sidebar state, autosync
// flags, and the legacy global watchlist keys (so people on older browsers
// don't lose data).
//
// What we explicitly DO NOT export: nothing sensitive. There are no keys,
// signatures, or session tokens in any of these. The export is just user
// preferences + their personal address book of vaults.

const SCHEMA = "redacted-export";
const SCHEMA_VERSION = 1;

// Single-value keys (one key, one JSON-encoded value).
const SINGLETON_KEYS = [
  "redacted-vaults",                  // saved vaults list (the "address book")
  "redacted-address-book",            // recipient address book
  "redacted-user-apps",               // custom dApps + hidden defaults
  "redacted-notif-prefs",             // per-vault notification toggles
  "redacted-privacy-prefs-v1",        // per-vault per-activity privacy backend picks
  "redacted-theme-mode",              // "light" | "dark"
  "redacted-sidebar-collapsed",       // "true" | "false"
  // Legacy globals — kept for compatibility with pre-per-wallet builds.
  "watchlist-heights",
  "watchlist-order",
  "redacted-watchlist-favorites",
] as const;

// Prefixed keys: `<prefix>:<scope>`. We scan localStorage for any key starting
// with the prefix + ":" and export the lot.
const PREFIXED_KEYS = [
  "redacted-last-selected-vault",   // : <walletAddr>
  "redacted-last-mode",              // : <walletAddr>
  "redacted-watchlist-layout",       // : <ownerAddr>
  "redacted-watchlist-favs",         // : <ownerAddr>
  "redacted-autosynced",             // : <walletAddr>
] as const;

export type RedactedExport = {
  schema: typeof SCHEMA;
  schemaVersion: number;
  exportedAt: string;       // ISO timestamp
  origin?: string;          // window.location.origin at export time (for traceability)
  data: Record<string, string>;  // key -> raw JSON string (as stored in localStorage)
};

// Build a complete export object from the current localStorage. Values are
// stored as strings (matching localStorage format) so the import path is a
// trivial setItem round-trip with no JSON parse risk.
export function buildExport(): RedactedExport {
  const data: Record<string, string> = {};
  if (typeof window === "undefined") {
    return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
  }
  // Singletons
  for (const k of SINGLETON_KEYS) {
    const v = window.localStorage.getItem(k);
    if (v != null) data[k] = v;
  }
  // Prefixed: enumerate localStorage and pick anything that matches a prefix
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    for (const prefix of PREFIXED_KEYS) {
      if (key.startsWith(prefix + ":")) {
        const v = window.localStorage.getItem(key);
        if (v != null) data[key] = v;
        break;
      }
    }
  }
  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    data,
  };
}

export type ExportSummary = {
  vaultCount: number;
  addressBookCount: number;
  customAppsCount: number;
  perWalletSelections: number;
  watchlistCustomizations: number;
  totalKeys: number;
};

// Cheap stats for the Data tab UI so the user can see what'll be in the export
// before they download it. All counts are best-effort and don't fail on
// malformed JSON.
export function summarize(exp: RedactedExport): ExportSummary {
  const safe = <T,>(s: string | undefined, fallback: T): T => {
    try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
  };
  const vaults = safe<any[]>(exp.data["redacted-vaults"], []);
  const ab = safe<any[]>(exp.data["redacted-address-book"], []);
  const apps = safe<Record<string, any>>(exp.data["redacted-user-apps"], {});
  const perWallet = Object.keys(exp.data).filter(
    (k) => k.startsWith("redacted-last-selected-vault:") || k.startsWith("redacted-last-mode:"),
  ).length;
  const watch = Object.keys(exp.data).filter(
    (k) => k.startsWith("redacted-watchlist-favs:") || k.startsWith("redacted-watchlist-layout:"),
  ).length;
  return {
    vaultCount: Array.isArray(vaults) ? vaults.length : 0,
    addressBookCount: Array.isArray(ab) ? ab.length : 0,
    customAppsCount: Object.keys(apps).length,
    perWalletSelections: perWallet,
    watchlistCustomizations: watch,
    totalKeys: Object.keys(exp.data).length,
  };
}

export type ImportMode = "merge" | "replace";

export type ImportResult = {
  applied: number;       // keys written
  skipped: number;       // keys ignored (mode=merge + existing)
  removed: number;       // keys cleared (mode=replace before write)
  errors: string[];
};

// Validate then write. Default mode is "merge" — incoming keys overwrite
// existing values, but anything already in localStorage that's NOT in the
// import file stays. "replace" clears all Redacted keys first.
export function applyImport(input: unknown, mode: ImportMode = "merge"): ImportResult {
  const out: ImportResult = { applied: 0, skipped: 0, removed: 0, errors: [] };
  if (typeof window === "undefined") {
    out.errors.push("Import only runs in a browser.");
    return out;
  }
  if (!input || typeof input !== "object") {
    out.errors.push("File is not a JSON object.");
    return out;
  }
  const exp = input as Partial<RedactedExport>;
  if (exp.schema !== SCHEMA) {
    out.errors.push(`Unrecognized file schema: expected "${SCHEMA}".`);
    return out;
  }
  if (typeof exp.schemaVersion !== "number" || exp.schemaVersion > SCHEMA_VERSION) {
    out.errors.push(`Export file schema version ${exp.schemaVersion} is newer than this build supports.`);
    return out;
  }
  if (!exp.data || typeof exp.data !== "object") {
    out.errors.push("Missing data block.");
    return out;
  }

  // Whitelist: never write a key the export schema doesn't own (defense against
  // a maliciously-crafted file dropping arbitrary localStorage entries).
  const isOwned = (k: string) =>
    (SINGLETON_KEYS as readonly string[]).includes(k) ||
    PREFIXED_KEYS.some((p) => k.startsWith(p + ":"));

  if (mode === "replace") {
    // Walk current localStorage and remove every owned key.
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && isOwned(k)) toRemove.push(k);
    }
    for (const k of toRemove) {
      window.localStorage.removeItem(k);
      out.removed++;
    }
  }

  for (const [k, v] of Object.entries(exp.data as Record<string, string>)) {
    if (!isOwned(k)) {
      out.skipped++;
      continue;
    }
    if (typeof v !== "string") {
      out.errors.push(`Skipped non-string value for key "${k}".`);
      continue;
    }
    if (mode === "merge" && window.localStorage.getItem(k) != null) {
      // Skip if already present — merge respects existing data.
      out.skipped++;
      continue;
    }
    try {
      window.localStorage.setItem(k, v);
      out.applied++;
    } catch (e) {
      out.errors.push(`Failed to write "${k}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

// Pretty filename: redacted-2026-06-03.json
export function defaultExportFilename(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `redacted-${y}-${m}-${d}.json`;
}
