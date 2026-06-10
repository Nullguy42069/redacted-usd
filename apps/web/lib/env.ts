// Environment configuration. Each value is resolved in this order:
//   1. localStorage override (set via Settings → Environment) — highest priority
//   2. NEXT_PUBLIC_* env var (compile-time / .env.local)
//   3. Hard-coded default
//
// localStorage overrides only apply after a page refresh — module-scope
// resolution happens once at first import. The UI surfaces this constraint
// in the Environment tab.

// Storage key constants exported so the UI can read/write directly.
export const ENV_OVERRIDE_KEYS = {
  rpcUrl:                  "redacted-env-rpc-url",
  magicRouterEndpoint:     "redacted-env-magic-router",
  squadsProgramId:         "redacted-env-squads-program",
  privateVoteProgramId:    "redacted-env-private-vote-program",
  privateVoteTeeProgramId: "redacted-env-private-vote-tee-program",
} as const;

export type EnvOverrideKey = keyof typeof ENV_OVERRIDE_KEYS;

function fromLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

// Allowlist for RPC overrides. Without this, a one-time XSS that writes
// localStorage.redacted-env-rpc-url='https://attacker.tld' becomes a permanent
// MITM that survives every reload and exfiltrates the embedded Helius key.
// Caught by Fable 5 audit 2026-06-10.
const ALLOWED_RPC_HOST_SUFFIXES = [
  "helius-rpc.com",
  "mainnet-beta.solana.com",
  "api.mainnet-beta.solana.com",
  "api.devnet.solana.com",
];
// Solana program IDs are base58 strings, never URLs — restrict to a permissive
// base58 charset + length cap.
const SOLANA_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isAllowedRpcOverride(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_RPC_HOST_SUFFIXES.some((suffix) =>
      u.hostname === suffix || u.hostname.endsWith("." + suffix)
    );
  } catch {
    return false;
  }
}

function isAllowedProgramIdOverride(value: string | null): boolean {
  if (!value) return false;
  return SOLANA_PUBKEY_RE.test(value);
}

// Override accepted only if it passes the validator for its key class.
function resolveValidated(
  localKey: string,
  envVal: string | undefined,
  fallback: string,
  validate: (v: string | null) => boolean,
): string {
  const override = fromLocalStorage(localKey);
  if (override && override.length > 0 && validate(override)) return override;
  if (envVal && envVal.length > 0) return envVal;
  return fallback;
}

function resolve(localKey: string, envVal: string | undefined, fallback: string): string {
  // Generic resolver kept for ephemeral non-security overrides (theme etc.)
  const override = fromLocalStorage(localKey);
  if (override && override.length > 0) return override;
  if (envVal && envVal.length > 0) return envVal;
  return fallback;
}

export const RPC_URL = resolveValidated(
  ENV_OVERRIDE_KEYS.rpcUrl,
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://api.mainnet-beta.solana.com",
  isAllowedRpcOverride,
);

export const HELIUS_API_KEY: string | null = (() => {
  const match = RPC_URL.match(/[?&]api-key=([^&]+)/i);
  return match ? match[1] : null;
})();

export const DEFAULT_MULTISIG = process.env.NEXT_PUBLIC_DEFAULT_MULTISIG ?? "";

// === Private Vote Program IDs ===
// These override the program IDs baked into the IDL files.
// The IDLs currently contain localnet addresses. For mainnet use, you must:
// 1. Deploy the programs to mainnet (see private_vote/ directory).
// 2. Set these env vars OR the matching localStorage overrides.
export const PRIVATE_VOTE_PROGRAM_ID_OVERRIDE = resolveValidated(
  ENV_OVERRIDE_KEYS.privateVoteProgramId,
  process.env.NEXT_PUBLIC_PRIVATE_VOTE_PROGRAM_ID,
  "",
  isAllowedProgramIdOverride,
);

export const PRIVATE_VOTE_TEE_PROGRAM_ID_OVERRIDE = resolveValidated(
  ENV_OVERRIDE_KEYS.privateVoteTeeProgramId,
  process.env.NEXT_PUBLIC_PRIVATE_VOTE_TEE_PROGRAM_ID,
  "",
  isAllowedProgramIdOverride,
);

// === MagicBlock TEE Router ===
// Used for routing vote transactions into MagicBlock Ephemeral Rollups (for the TEE privacy backend).
//
// Devnet:  https://devnet.magicblock.app
// Mainnet: Check current MagicBlock docs — mainnet routers may require registration.
export const MAGIC_ROUTER_ENDPOINT = resolveValidated(
  ENV_OVERRIDE_KEYS.magicRouterEndpoint,
  process.env.NEXT_PUBLIC_MAGIC_ROUTER_ENDPOINT,
  "https://devnet.magicblock.app",
  (v) => {
    if (!v) return false;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname.endsWith(".magicblock.app");
    } catch { return false; }
  },
);

// === Squads Multisig Program ===
// Almost always the mainnet v4 program. Override should be base58 pubkey only —
// an attacker repointing this is a drain primitive. (Fable 5 audit 2026-06-10.)
export const SQUADS_PROGRAM_ID = resolveValidated(
  ENV_OVERRIDE_KEYS.squadsProgramId,
  process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID,
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
  isAllowedProgramIdOverride,
);

// Defaults exported so the UI can show "current default" inline.
export const ENV_DEFAULTS = {
  rpcUrl:                  process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com",
  magicRouterEndpoint:     process.env.NEXT_PUBLIC_MAGIC_ROUTER_ENDPOINT || "https://devnet.magicblock.app",
  squadsProgramId:         process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID || "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
  privateVoteProgramId:    process.env.NEXT_PUBLIC_PRIVATE_VOTE_PROGRAM_ID || "",
  privateVoteTeeProgramId: process.env.NEXT_PUBLIC_PRIVATE_VOTE_TEE_PROGRAM_ID || "",
} as const;
