export type DeFiPositionType = 'LP' | 'Perp' | 'Lending' | 'Borrow' | 'Staking' | 'Prediction';

export interface DeFiPosition {
  id: string;
  protocol: string;           // e.g. "Kamino", "Drift"
  type: DeFiPositionType;
  position: string;           // Human readable, e.g. "USDC-SOL LP" or "SOL-PERP Long"
  valueUsd: number;
  pnlUsd?: number;            // Realized + unrealized
  apy?: number;
  health?: number;            // For lending/borrow positions
  rawData?: any;              // Store original on-chain data for later
}
