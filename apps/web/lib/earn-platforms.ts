// Earn registry: yield platforms we route deposits to, per asset.
//
// Active picks are updated weekly (manually edited here). v2 will add a
// scanner that queries each platform's API and proposes the highest after
// risk filters; the human still confirms before flipping `active: true`.

export type AssetKey = "USDC" | "SOL" | "PERPS";

export type RiskTier = "low" | "medium" | "high";

export type EarnPlatform = {
  id: string;
  name: string;
  asset: AssetKey;
  // APY as a number — e.g. 8.4 means 8.4%. Manually updated each week.
  // Set to null when temporarily unavailable.
  apy: number | null;
  // True if this is the current best pick for the asset.
  active: boolean;
  // For SOL LSTs: the SPL mint of the receipt token. The deposit flow swaps
  // SOL → this mint via Jupiter (which routes through the underlying stake
  // pool or a DEX, whichever is cheaper at fill time).
  receiptMint?: string;
  // Decimals of the receipt token, needed for amount formatting.
  receiptDecimals?: number;
  // External UI URL for USDC lending platforms (deep-linked when active).
  externalUrl?: string;
  // Risk classification — surfaced as a badge in the UI so users see what
  // they're walking into. "low" = audited, mature, top-3-TVL. "medium" =
  // audited but younger or thinner. "high" = unaudited or known incident.
  risk: RiskTier;
  // One-line summary used in the UI to explain why this yield exists.
  blurb: string;
};

export const EARN_PLATFORMS: EarnPlatform[] = [
  // ── USDC lending (external deep-links — lending UX is too rich to rebuild) ──
  {
    id: "kamino-usdc",
    name: "Kamino Lend",
    asset: "USDC",
    apy: 8.4,
    active: true,                                  // ← weekly pick (USDC)
    externalUrl: "https://app.kamino.finance/lending/markets",
    risk: "low",
    blurb: "Borrowers pay variable rates; you collect the spread. Largest USDC lending pool on Solana.",
  },
  {
    id: "marginfi-usdc",
    name: "MarginFi",
    asset: "USDC",
    apy: 6.9,
    active: false,
    externalUrl: "https://app.marginfi.com/",
    risk: "low",
    blurb: "Margin-trading collateral pool — yield from borrowers leveraging into perps.",
  },
  {
    id: "drift-usdc",
    name: "Drift Spot",
    asset: "USDC",
    apy: 5.2,
    active: false,
    externalUrl: "https://app.drift.trade/earn/lend-borrow",
    risk: "low",
    blurb: "Perp DEX borrowers fund this; rates spike during high open interest.",
  },
  {
    id: "save-usdc",
    name: "Save (was Solend)",
    asset: "USDC",
    apy: 7.1,
    active: false,
    externalUrl: "https://save.finance/",
    risk: "medium",
    blurb: "Rebranded Solend main pool — historical exploit precedent, treat with care.",
  },

  // ── SOL LSTs (in-app deposit via SOL → LST swap) ──────────────────────────
  {
    id: "jito-sol",
    name: "Jito jitoSOL",
    asset: "SOL",
    apy: 7.9,
    active: true,                                  // ← weekly pick (SOL)
    receiptMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    receiptDecimals: 9,
    risk: "low",
    blurb: "Liquid staking + MEV redistribution. Standard validator yield plus block-builder tips.",
  },
  {
    id: "marinade-msol",
    name: "Marinade mSOL",
    asset: "SOL",
    apy: 7.2,
    active: false,
    receiptMint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    receiptDecimals: 9,
    risk: "low",
    blurb: "Largest Solana LST. Delegated stake across 100+ validators, diversified.",
  },
  {
    id: "sanctum-inf",
    name: "Sanctum INF",
    asset: "SOL",
    apy: 8.3,
    active: false,
    receiptMint: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
    receiptDecimals: 9,
    risk: "medium",
    blurb: "Aggregates many LSTs into one infinity pool — rebalances toward higher yield.",
  },
  {
    id: "kamino-sol",
    name: "Kamino SOL Lend",
    asset: "SOL",
    apy: 3.4,
    active: false,
    externalUrl: "https://app.kamino.finance/lending/markets",
    risk: "low",
    blurb: "Lend SOL to leveraged longs — lower base yield, no LST exit lock.",
  },

  // ── PERPS — provide liquidity to perp DEXes, earn fees + trader-loss share ──
  // These are LP tokens whose value tracks an underlying basket. Yield can be
  // dramatic but volatile — when traders win, LP loses. Always "Caution" tier.
  {
    id: "jlp",
    name: "JLP (Jupiter Perp LP)",
    asset: "PERPS",
    apy: 42.0,
    active: true,                                  // ← weekly pick (PERPS)
    receiptMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
    receiptDecimals: 6,
    risk: "medium",
    blurb: "Provide liquidity to Jupiter's perp market. Earn ~75% of trader fees + losses. Token value tracks a SOL/ETH/BTC/USDC/USDT basket.",
  },
  {
    id: "flash-sol",
    name: "Flash Perps LP (SOL)",
    asset: "PERPS",
    apy: 38.5,
    active: false,
    externalUrl: "https://beta.flash.trade/earn",
    risk: "medium",
    blurb: "Newer competitor to JLP. Single-asset deposit (SOL or USDC), separate LP tokens per asset.",
  },
  {
    id: "adrastea-jlp",
    name: "Adrastea (Leveraged JLP)",
    asset: "PERPS",
    apy: 78.0,
    active: false,
    externalUrl: "https://adrastea.fi/",
    risk: "high",
    blurb: "Levered JLP exposure via Kamino borrow. Liquidation risk on adverse JLP moves.",
  },
  {
    id: "drift-if",
    name: "Drift Insurance Fund",
    asset: "PERPS",
    apy: 18.4,
    active: false,
    externalUrl: "https://app.drift.trade/earn/insurance-fund",
    risk: "medium",
    blurb: "Stake USDC into Drift's IF, backstop bad-debt events. Cooldown applies on withdraw.",
  },
];

export function platformsFor(asset: AssetKey): EarnPlatform[] {
  return EARN_PLATFORMS
    .filter((p) => p.asset === asset)
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
}

export function activeFor(asset: AssetKey): EarnPlatform | null {
  return EARN_PLATFORMS.find((p) => p.asset === asset && p.active) ?? null;
}

// SPL mint addresses for the deposit assets themselves.
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_MINT  = "So11111111111111111111111111111111111111112";

// Week-of-year metadata for the UI footer — purely cosmetic so users see
// when the active pick last refreshed.
export function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
