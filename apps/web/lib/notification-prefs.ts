"use client";
// Tiny per-vault notification preferences store. Keeps things in localStorage
// so the toggle in /settings sticks across reloads. The actual firing of
// notifications happens elsewhere (transactions watcher etc.) — those callers
// gate on `isEnabled(vault)` and the browser Notification permission.

const STORAGE_KEY = "redacted-notif-prefs";

type Prefs = {
  // Vault address → enabled
  vaults: Record<string, boolean>;
};

function read(): Prefs {
  if (typeof window === "undefined") return { vaults: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { vaults: {} };
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && p.vaults && typeof p.vaults === "object") return p;
  } catch {}
  return { vaults: {} };
}

function write(p: Prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

export function isEnabled(vault: string): boolean {
  return !!read().vaults[vault];
}

export function setEnabled(vault: string, enabled: boolean) {
  const p = read();
  if (enabled) p.vaults[vault] = true;
  else delete p.vaults[vault];
  write(p);
}

export function allEnabled(): string[] {
  return Object.entries(read().vaults).filter(([, v]) => v).map(([k]) => k);
}

// Returns 'granted' | 'denied' | 'default' — wraps the platform API and
// gracefully degrades when the API isn't there.
export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch { return "denied"; }
}

// Fire a notification if enabled for the vault AND browser permission is granted.
// Safe to call from anywhere; no-op if anything is off.
export function fireVaultNotification(vault: string, title: string, body: string, opts?: { tag?: string; href?: string }) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!isEnabled(vault)) return;
  try {
    const n = new Notification(title, { body, tag: opts?.tag, icon: "/favicon.ico" });
    if (opts?.href) n.onclick = () => { window.focus(); window.location.href = opts.href!; };
  } catch {}
}
