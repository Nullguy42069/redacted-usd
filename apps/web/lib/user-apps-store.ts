// Per-vault user apps / bookmarks for the in-app browser.
// Stored in localStorage, following the same pattern as vault-store and address-book-store.
// Enhanced with optional manifest data (name, icon, description) modeled on Safe's Custom Apps / fetchSafeAppFromManifest.

const STORAGE_KEY = "redacted-user-apps";

export type UserApp = {
  url: string;
  name?: string;
  iconUrl?: string;
  description?: string;
  addedAt: string;
};

export type UserAppsData = {
  customApps: UserApp[];
  hiddenDefaults: string[]; // names of default apps the user has removed
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getKey(vaultAddress: string) {
  return `${STORAGE_KEY}:${vaultAddress}`;
}

export function loadUserApps(vaultAddress: string): UserAppsData {
  if (!isBrowser()) return { customApps: [], hiddenDefaults: [] };
  try {
    const raw = window.localStorage.getItem(getKey(vaultAddress));
    if (!raw) return { customApps: [], hiddenDefaults: [] };
    const parsed = JSON.parse(raw) as Partial<UserAppsData>;
    return {
      customApps: Array.isArray(parsed.customApps) ? parsed.customApps : [],
      hiddenDefaults: Array.isArray(parsed.hiddenDefaults) ? parsed.hiddenDefaults : [],
    };
  } catch {
    return { customApps: [], hiddenDefaults: [] };
  }
}

export function saveUserApps(vaultAddress: string, data: UserAppsData): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(getKey(vaultAddress), JSON.stringify(data));
}

// Sync fallback (used by a few legacy paths / old imports). Prefer the async addCustomApp below (fetches manifest like Safe).
export function addCustomAppSync(vaultAddress: string, url: string, name?: string): UserAppsData {
  const data = loadUserApps(vaultAddress);
  const exists = data.customApps.some((app) => app.url === url);
  if (!exists) {
    data.customApps.unshift({
      url,
      name: name || new URL(url).hostname,
      addedAt: new Date().toISOString(),
    });
  }
  saveUserApps(vaultAddress, data);
  return data;
}

export function removeCustomApp(vaultAddress: string, url: string): UserAppsData {
  const data = loadUserApps(vaultAddress);
  data.customApps = data.customApps.filter((app) => app.url !== url);
  saveUserApps(vaultAddress, data);
  return data;
}

export function hideDefaultApp(vaultAddress: string, appName: string): UserAppsData {
  const data = loadUserApps(vaultAddress);
  if (!data.hiddenDefaults.includes(appName)) {
    data.hiddenDefaults.push(appName);
  }
  saveUserApps(vaultAddress, data);
  return data;
}

export function showDefaultApp(vaultAddress: string, appName: string): UserAppsData {
  const data = loadUserApps(vaultAddress);
  data.hiddenDefaults = data.hiddenDefaults.filter((name) => name !== appName);
  saveUserApps(vaultAddress, data);
  return data;
}

// --- Manifest support (Safe-style) for custom apps ---
// We fetch /manifest.json (web app manifest) from the target origin when user adds a custom URL.
// This gives nice name + icon (prefers SVG) without relying only on favicons.
// See Safe's apps/web/src/services/safe-apps/manifest.ts for the original pattern.

type AppManifestIcon = { src: string; sizes?: string; type?: string };

type AppManifest = {
  name?: string;
  short_name?: string;
  description?: string;
  icons?: AppManifestIcon[];
  iconPath?: string;
};

function stripUrlParams(u: string): string {
  try { return new URL(u).origin + new URL(u).pathname; } catch { return u; }
}

function trimTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

async function fetchAppManifest(appUrl: string, timeoutMs = 4000): Promise<AppManifest | null> {
  try {
    const base = trimTrailingSlash(stripUrlParams(appUrl));
    const manifestUrl = `${base}/manifest.json`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(manifestUrl, { signal: controller.signal, mode: 'cors' });
    clearTimeout(t);

    if (!res.ok) return null;
    const json = await res.json();
    return json as AppManifest;
  } catch {
    return null;
  }
}

function pickIcon(appUrl: string, manifest: AppManifest): string | undefined {
  const icons = manifest.icons || [];
  if (icons.length === 0 && manifest.iconPath) {
    const p = manifest.iconPath;
    return p.startsWith('http') ? p : `${trimTrailingSlash(appUrl)}/${p.replace(/^\//, '')}`;
  }
  // Prefer SVG or "any"
  const svg = icons.find(i => (i.type && i.type.includes('svg')) || (i.sizes && i.sizes.includes('any')));
  if (svg) {
    return svg.src.startsWith('http') ? svg.src : `${trimTrailingSlash(appUrl)}/${svg.src.replace(/^\//, '')}`;
  }
  // Largest reasonable
  const best = [...icons].sort((a, b) => {
    const sa = parseInt((a.sizes || '0').split('x')[0] || '0', 10);
    const sb = parseInt((b.sizes || '0').split('x')[0] || '0', 10);
    return sb - sa;
  })[0];
  if (best) {
    return best.src.startsWith('http') ? best.src : `${trimTrailingSlash(appUrl)}/${best.src.replace(/^\//, '')}`;
  }
  return undefined;
}

export async function fetchAndEnhanceApp(url: string): Promise<{ name?: string; iconUrl?: string; description?: string }> {
  const m = await fetchAppManifest(url);
  if (!m) return {};
  const origin = (() => { try { return new URL(url).origin; } catch { return url; } })();
  return {
    name: m.name || m.short_name,
    description: m.description,
    iconUrl: pickIcon(origin, m),
  };
}

/**
 * Async version of add that tries to fetch manifest for richer metadata (like Safe Custom Apps).
 */
export async function addCustomApp(vaultAddress: string, url: string, fallbackName?: string): Promise<UserAppsData> {
  const data = loadUserApps(vaultAddress);
  const exists = data.customApps.some((app) => app.url === url);
  if (exists) return data;

  const enhanced = await fetchAndEnhanceApp(url).catch(() => ({} as any));

  data.customApps.unshift({
    url,
    name: enhanced.name || fallbackName || new URL(url).hostname,
    iconUrl: enhanced.iconUrl,
    description: enhanced.description,
    addedAt: new Date().toISOString(),
  });
  saveUserApps(vaultAddress, data);
  return data;
}
