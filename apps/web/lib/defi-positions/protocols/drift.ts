import { PublicKey } from '@solana/web3.js';
import { DeFiPosition } from '../types';

/**
 * Fetches Drift perpetual positions for a vault.
 * 
 * TODO: Full implementation.
 * Drift stores user data in a User account derived from the authority.
 * We can either:
 *   - Use Drift SDK to load user account
 *   - Or query via their public API / indexer
 * 
 * For now this returns empty until the proper integration is built.
 */
export async function fetchDriftPositions(vault: PublicKey): Promise<DeFiPosition[]> {
  // Placeholder - real implementation coming next
  // Example future shape:
  // const user = await driftClient.getUserAccountPublicKey(vault);
  // ... parse positions, get notional, unrealized PnL, etc.

  return [];
}
