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

function resolve(localKey: string, envVal: string | undefined, fallback: string): string {
  const override = fromLocalStorage(localKey);
  if (override && override.length > 0) return override;
  if (envVal && envVal.length > 0) return envVal;
  return fallback;
}

export const RPC_URL = resolve(
  ENV_OVERRIDE_KEYS.rpcUrl,
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://api.mainnet-beta.solana.com",
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
export const PRIVATE_VOTE_PROGRAM_ID_OVERRIDE = resolve(
  ENV_OVERRIDE_KEYS.privateVoteProgramId,
  process.env.NEXT_PUBLIC_PRIVATE_VOTE_PROGRAM_ID,
  "",
);

export const PRIVATE_VOTE_TEE_PROGRAM_ID_OVERRIDE = resolve(
  ENV_OVERRIDE_KEYS.privateVoteTeeProgramId,
  process.env.NEXT_PUBLIC_PRIVATE_VOTE_TEE_PROGRAM_ID,
  "",
);

// === MagicBlock TEE Router ===
// Used for routing vote transactions into MagicBlock Ephemeral Rollups (for the TEE privacy backend).
//
// Devnet:  https://devnet.magicblock.app
// Mainnet: Check current MagicBlock docs — mainnet routers may require registration.
export const MAGIC_ROUTER_ENDPOINT = resolve(
  ENV_OVERRIDE_KEYS.magicRouterEndpoint,
  process.env.NEXT_PUBLIC_MAGIC_ROUTER_ENDPOINT,
  "https://devnet.magicblock.app",
);

// === Squads Multisig Program ===
// Almost always the mainnet v4 program. Only override if you are testing against
// a private/custom deployment of Squads (rare).
export const SQUADS_PROGRAM_ID = resolve(
  ENV_OVERRIDE_KEYS.squadsProgramId,
  process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID,
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);

// Defaults exported so the UI can show "current default" inline.
export const ENV_DEFAULTS = {
  rpcUrl:                  process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com",
  magicRouterEndpoint:     process.env.NEXT_PUBLIC_MAGIC_ROUTER_ENDPOINT || "https://devnet.magicblock.app",
  squadsProgramId:         process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID || "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
  privateVoteProgramId:    process.env.NEXT_PUBLIC_PRIVATE_VOTE_PROGRAM_ID || "",
  privateVoteTeeProgramId: process.env.NEXT_PUBLIC_PRIVATE_VOTE_TEE_PROGRAM_ID || "",
} as const;
