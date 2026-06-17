// Singleton aggregator + standard backend lineup for the web app.
// Routing decisions for every vote flow through this.
//
// IMPORTANT: We use a dynamic import here so that the heavy Solana privacy
// backends (and their transitive dependencies like @sqds/multisig) are never
// evaluated during Next.js server rendering. All calls to getAggregator()
// happen from "use client" components (CreateVaultDialog, transaction flows, etc.).

import type { Connection } from "@solana/web3.js";
import type { PrivacyAggregator } from "@redacted-usd/aggregator";

let cached: PrivacyAggregator | null = null;
let cachedConn: Connection | null = null;

export async function getAggregator(conn: Connection): Promise<PrivacyAggregator> {
  if (cached && cachedConn === conn) return cached;

  // Dynamic import keeps @sqds/multisig out of the server bundle.
  const mod = await import("@redacted-usd/aggregator");

  cached = new mod.PrivacyAggregator({
    conn,
    backends: [
      // Public vault routing via Squads. Asset shielding (Umbra) is handled
      // separately in lib/umbra-shield.ts, not as an aggregator backend.
      new mod.SquadsPlainBackend(),
    ],
  });

  // The PrivacyAggregator now automatically applies reasonable priority fees
  // and attaches mainnet warnings when the connection points to mainnet-beta.
  // See packages/aggregator/src/utils/network.ts and aggregator.ts for details.

  cachedConn = conn;
  return cached;
}
