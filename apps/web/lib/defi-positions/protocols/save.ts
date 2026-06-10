import { PublicKey } from '@solana/web3.js';
import { DeFiPosition } from '../types';

/**
 * Fetches lending + borrow positions from Save (formerly Solend).
 * 
 * TODO: Real implementation using Solend SDK or direct reserve account queries.
 * Save has good on-chain data via their reserves.
 */
export async function fetchSavePositions(vault: PublicKey): Promise<DeFiPosition[]> {
  // Real implementation pending
  return [];
}
