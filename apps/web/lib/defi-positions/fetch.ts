import { PublicKey } from '@solana/web3.js';
import { DeFiPosition } from './types';
import { fetchKaminoPositions } from './protocols/kamino';
import { fetchDriftPositions } from './protocols/drift';
import { fetchSavePositions } from './protocols/save';
// import { fetchMarginfiPositions } from './protocols/marginfi'; // TODO

/**
 * Fetches real-time DeFi positions for a Squads vault across supported protocols.
 * 
 * Currently implemented:
 *  - Kamino (LP + Lending) — live via public API
 * 
 * Others will be added incrementally.
 */
export async function fetchDeFiPositions(vault: PublicKey): Promise<DeFiPosition[]> {
  if (!vault) return [];

  // Run all available real fetchers in parallel
  const results = await Promise.allSettled([
    fetchKaminoPositions(vault),
    fetchDriftPositions(vault),
    fetchSavePositions(vault),
    // add more protocols here as they are implemented
  ]);

  const allPositions: DeFiPosition[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allPositions.push(...result.value);
    } else {
      console.warn('DeFi position fetcher failed:', result.reason);
    }
  }

  return allPositions;
}
