import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";

// NOTE: We intentionally do NOT import @sqds/multisig at the top level here.
// It is a heavy dependency with potential side effects / conditional exports
// that can break Next.js server rendering when any file in the web app
// imports from the aggregator (even just detectNetwork for UI display).
// The squads import is only needed for the vault creation error helper,
// so we load it lazily inside that function only.

/**
 * Simple network detection for mainnet readiness.
 * Used to apply smarter defaults (priority fees, warnings, etc.) when running on mainnet.
 */
export type SolanaNetwork = "mainnet" | "devnet" | "testnet" | "localnet" | "unknown";

export function detectNetwork(conn: Connection): SolanaNetwork {
  // Best effort detection from the RPC endpoint
  const endpoint = (conn as any).rpcEndpoint || (conn as any)._rpcEndpoint || "";

  if (endpoint.includes("mainnet-beta") || endpoint.includes("mainnet")) return "mainnet";
  if (endpoint.includes("devnet")) return "devnet";
  if (endpoint.includes("testnet")) return "testnet";
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1") || endpoint.includes(":8899")) {
    return "localnet";
  }

  // Fallback: try to inspect genesis hash (expensive, only do if needed)
  return "unknown";
}

export function isMainnet(conn: Connection): boolean {
  return detectNetwork(conn) === "mainnet";
}

export function getRecommendedPriorityFee(network: SolanaNetwork): number {
  switch (network) {
    case "mainnet":
      return 50_000; // 0.00005 SOL per CU — reasonable starting point for mainnet in 2026
    case "devnet":
    case "testnet":
    case "localnet":
      return 0;
    default:
      return 10_000;
  }
}

// The canonical Squads v4 mainnet program. Used for all vault creation flows.
export const DEFAULT_SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"
);

/**
 * Load the Squads ProgramConfig account with a clear, actionable error if it fails.
 * This is the #1 cause of "vault creation transaction did not go through" errors:
 * the RPC is not mainnet (or a mainnet RPC that cannot serve the account),
 * but the SDK + our builders always target the real mainnet Squads deployment.
 */
export async function loadSquadsProgramConfig(
  conn: Connection,
  squadsProgramId = DEFAULT_SQUADS_PROGRAM_ID,
): Promise<any> {
  // Lazy import so that just pulling detectNetwork / isMainnet from the aggregator
  // package does not force @sqds/multisig into the Next.js server module graph.
  const squads = await import("@sqds/multisig");

  const pda = squads.getProgramConfigPda({ programId: squadsProgramId })[0];
  try {
    return await squads.accounts.ProgramConfig.fromAccountAddress(conn, pda);
  } catch (e) {
    const net = detectNetwork(conn);
    const ep = (conn as any).rpcEndpoint || (conn as any)._rpcEndpoint || "unknown";
    const msg =
      `Failed to load Squads ProgramConfig PDA for program ${squadsProgramId.toBase58()}.\n` +
      `Detected network: ${net} (from RPC endpoint).\n` +
      `RPC endpoint: ${ep}\n\n` +
      `This is the most common cause of "create vault" failures.\n` +
      `Fix: ensure NEXT_PUBLIC_RPC_URL points at a working MAINNET RPC (Helius/QuickNode/etc).\n` +
      `You cannot create (or use) mainnet Squads vaults while connected to devnet or localhost.\n` +
      `Original error: ${e instanceof Error ? e.message : String(e)}`;
    throw new Error(msg);
  }
}
