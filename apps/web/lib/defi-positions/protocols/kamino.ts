import { PublicKey } from '@solana/web3.js';
import { DeFiPosition } from '../types';

/**
 * Fetches Kamino positions (LP + Lending) for a vault address.
 * Uses Kamino's public portfolio API.
 */
export async function fetchKaminoPositions(vault: PublicKey): Promise<DeFiPosition[]> {
  const wallet = vault.toBase58();

  try {
    // Kamino public API for user positions (works for any wallet / multisig vault)
    const res = await fetch(
      `https://api.kamino.finance/v2/strategies/user-positions?wallet=${wallet}`,
      { next: { revalidate: 30 } } // cache for 30s
    );

    if (!res.ok) {
      console.warn('[Kamino] API returned', res.status);
      return [];
    }

    const data = await res.json();

    const positions: DeFiPosition[] = [];

    // Kamino returns both strategy (LP) positions and lending positions
    if (data?.strategies) {
      for (const strat of data.strategies) {
        const value = Number(strat?.position?.valueUsd ?? 0);
        if (value <= 0) continue;

        positions.push({
          id: `kamino-${strat.strategyId || strat.id}`,
          protocol: 'Kamino',
          type: 'LP',
          position: strat.strategyName || strat.tokenPair || 'Kamino Position',
          valueUsd: value,
          pnlUsd: strat?.position?.pnlUsd ? Number(strat.position.pnlUsd) : undefined,
          apy: strat?.apy ? Number(strat.apy) : undefined,
        });
      }
    }

    if (data?.lendingPositions) {
      for (const lend of data.lendingPositions) {
        const value = Number(lend?.valueUsd ?? 0);
        if (value <= 0) continue;

        positions.push({
          id: `kamino-lend-${lend.reserveId || lend.symbol}`,
          protocol: 'Kamino',
          type: 'Lending',
          position: `${lend.symbol || 'Asset'} Supply`,
          valueUsd: value,
          apy: lend?.supplyApy ? Number(lend.supplyApy) : undefined,
        });
      }
    }

    return positions;
  } catch (err) {
    console.error('[Kamino] Failed to fetch positions:', err);
    return [];
  }
}
