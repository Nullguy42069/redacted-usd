// Per-signer customization (display name + avatar). Keyed by base58 pubkey
// so a nickname follows that wallet across every vault you add it to.
// Local-only — never leaves the browser.

const STORAGE_KEY = "redacted-signers";

export type SignerInfo = {
  name?: string;
  avatar?: string; // data URL
};

type StoredShape = { signers: Record<string, SignerInfo> };

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read(): StoredShape {
  if (!isBrowser()) return { signers: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { signers: {} };
    const p = JSON.parse(raw);
    if (p && p.signers && typeof p.signers === "object") return p;
  } catch {}
  return { signers: {} };
}

function write(p: StoredShape) {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

export function getSigner(pubkey: string): SignerInfo {
  return read().signers[pubkey] || {};
}

export function updateSigner(pubkey: string, patch: SignerInfo): SignerInfo {
  const p = read();
  const cur = p.signers[pubkey] || {};
  p.signers[pubkey] = { ...cur, ...patch };
  // Remove fields explicitly cleared
  if (patch.name === "" || patch.name === undefined && Object.prototype.hasOwnProperty.call(patch, "name")) {
    delete p.signers[pubkey].name;
  }
  if (patch.avatar === "" || patch.avatar === undefined && Object.prototype.hasOwnProperty.call(patch, "avatar")) {
    delete p.signers[pubkey].avatar;
  }
  if (!p.signers[pubkey].name && !p.signers[pubkey].avatar) {
    delete p.signers[pubkey];
  }
  write(p);
  return p.signers[pubkey] || {};
}

export function loadSigners(): Record<string, SignerInfo> {
  return read().signers;
}
