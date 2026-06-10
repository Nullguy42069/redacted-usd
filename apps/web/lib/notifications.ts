"use client";
// Redacted notifications v2.
//
// Builds on v1's per-vault opt-in but:
//   • Registers a Service Worker so notifications survive the tab going to
//     the background. (True push-without-tab requires a backend; we ship the
//     SW now so the wiring is in place when that lands.)
//   • Uses vault + signer customizations (name, avatar) when displaying so
//     "Add signer proposal on Treasury" reads better than "Add signer
//     proposal on solana:9sFh…zTcQ".
//   • Adds per-event-type preferences (new proposal, ready to execute,
//     executed) on top of the per-vault on/off switch.

import { loadVaults } from "./vault-store";
import { getSigner } from "./signer-store";
import { shortAddress } from "./squads";

const STORAGE_KEY = "redacted-notif-prefs-v2";
const SW_PATH = "/sw.js";

export type EventType = "proposal_created" | "threshold_reached" | "executed";

const ALL_EVENTS: EventType[] = ["proposal_created", "threshold_reached", "executed"];

export const EVENT_LABEL: Record<EventType, string> = {
  proposal_created: "New proposal created",
  threshold_reached: "Proposal ready to execute",
  executed: "Proposal executed",
};

type V2Prefs = {
  // Master on/off — when off, every notification is silenced regardless of
  // per-vault / per-event prefs. Makes it cheap to mute everything before bed.
  enabled: boolean;
  // Global per-event-type opt-in. Default all true.
  events: Record<EventType, boolean>;
  // Per-vault on/off.
  vaults: Record<string, boolean>;
};

const DEFAULT_PREFS: V2Prefs = {
  enabled: true,
  events: { proposal_created: true, threshold_reached: true, executed: true },
  vaults: {},
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read(): V2Prefs {
  if (!isBrowser()) return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw);
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : true,
      events: { ...DEFAULT_PREFS.events, ...(p.events || {}) },
      vaults: typeof p.vaults === "object" && p.vaults !== null ? p.vaults : {},
    };
  } catch {}
  return DEFAULT_PREFS;
}

function write(p: V2Prefs) {
  if (!isBrowser()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

// ─── Reads/writes ─────────────────────────────────────────────────────────────

export function loadPrefs(): V2Prefs { return read(); }
export function getMasterEnabled(): boolean { return read().enabled; }
export function setMasterEnabled(v: boolean) { const p = read(); p.enabled = v; write(p); }
export function getVaultEnabled(vault: string): boolean { return !!read().vaults[vault]; }
export function setVaultEnabled(vault: string, v: boolean) {
  const p = read();
  if (v) p.vaults[vault] = true; else delete p.vaults[vault];
  write(p);
}
export function getEventEnabled(e: EventType): boolean { return !!read().events[e]; }
export function setEventEnabled(e: EventType, v: boolean) {
  const p = read(); p.events[e] = v; write(p);
}
export function vaultsWithNotifications(): string[] {
  return Object.entries(read().vaults).filter(([, v]) => v).map(([k]) => k);
}

// ─── Permission ──────────────────────────────────────────────────────────────

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

// ─── Service Worker registration ──────────────────────────────────────────────

let _swRegistration: ServiceWorkerRegistration | null = null;
let _swRegisterPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (_swRegistration) return _swRegistration;
  if (_swRegisterPromise) return _swRegisterPromise;
  _swRegisterPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
      _swRegistration = reg;
      return reg;
    } catch (e) {
      console.warn("[notifications] SW register failed:", e);
      return null;
    }
  })();
  return _swRegisterPromise;
}

export function serviceWorkerStatus(): "active" | "registering" | "unsupported" | "failed" {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  if (_swRegistration?.active) return "active";
  if (_swRegisterPromise) return "registering";
  return "failed";
}

// ─── Customization-aware display helpers ──────────────────────────────────────

export type FireOpts = {
  event: EventType;
  vault: string;             // multisig PDA
  // Optional details we can fold into the body:
  signerPubkey?: string;     // who proposed it / who voted
  proposalSummary?: string;  // e.g. "Add signer 4CVA…wyGoc"
  href?: string;             // where to take the user on click
  tag?: string;              // dedup key
};

export function vaultDisplayName(vault: string): string {
  const saved = loadVaults().find((v) => v.address === vault);
  return saved?.name || `solana:${shortAddress(vault)}`;
}

export function vaultAvatarUrl(vault: string): string | undefined {
  const saved = loadVaults().find((v) => v.address === vault);
  return saved?.avatar || undefined;
}

export function signerDisplayName(pubkey: string): string {
  const info = getSigner(pubkey);
  return info?.name || shortAddress(pubkey, 6, 6);
}

function buildNotification(opts: FireOpts): { title: string; body: string; icon: string } {
  const vname = vaultDisplayName(opts.vault);
  const title = `${vname}: ${EVENT_LABEL[opts.event]}`;
  const parts: string[] = [];
  if (opts.proposalSummary) parts.push(opts.proposalSummary);
  if (opts.signerPubkey) {
    const sname = signerDisplayName(opts.signerPubkey);
    parts.push(`Signer: ${sname}`);
  }
  const body = parts.length ? parts.join("\n") : `Tap to open in Redacted.`;
  // Vault-specific avatar in the notification beats the generic favicon —
  // helps the user disambiguate when they have multiple vaults.
  const icon = vaultAvatarUrl(opts.vault) || "/icon-128.png";
  return { title, body, icon };
}

// Decide whether this notification should fire based on the master / vault /
// event-type prefs. Centralized so callers don't have to rebuild the logic.
function shouldFire(opts: FireOpts): boolean {
  const p = read();
  if (!p.enabled) return false;
  if (!p.vaults[opts.vault]) return false;
  if (!p.events[opts.event]) return false;
  return true;
}

export async function fireNotification(opts: FireOpts): Promise<boolean> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  if (!shouldFire(opts)) return false;
  const { title, body, icon } = buildNotification(opts);
  // Prefer the Service Worker registration — those notifications survive when
  // the tab loses focus or is closed-to-background. Fall back to the bare
  // Notification constructor if SW isn't ready yet.
  try {
    const reg = _swRegistration || (await registerServiceWorker());
    if (reg) {
      await reg.showNotification(title, {
        body, icon, tag: opts.tag,
        badge: "/favicon-16.png",
        data: { href: opts.href || `/` },
      });
      return true;
    }
  } catch (e) {
    console.warn("[notifications] SW showNotification failed, falling back:", e);
  }
  try {
    const n = new Notification(title, { body, tag: opts.tag, icon });
    if (opts.href) n.onclick = () => { window.focus(); window.location.href = opts.href!; };
    return true;
  } catch (e) {
    console.warn("[notifications] Notification fallback failed:", e);
    return false;
  }
}

// One-shot test fire — bypasses preferences (the user is explicitly testing).
export async function fireTestNotification(vault: string): Promise<boolean> {
  if (Notification.permission !== "granted") return false;
  const vname = vaultDisplayName(vault);
  try {
    const reg = _swRegistration || (await registerServiceWorker());
    if (reg) {
      await reg.showNotification(`Test from ${vname}`, {
        body: "If you can see this, Redacted notifications are working on this device.",
        icon: vaultAvatarUrl(vault) || "/icon-128.png",
        badge: "/favicon-16.png",
        tag: `test-${vault}`,
        data: { href: "/settings" },
      });
      return true;
    }
  } catch {}
  try {
    new Notification(`Test from ${vname}`, {
      body: "If you can see this, Redacted notifications are working on this device.",
      icon: vaultAvatarUrl(vault) || "/icon-128.png",
      tag: `test-${vault}`,
    });
    return true;
  } catch { return false; }
}
