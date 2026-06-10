// Thin wrapper around deBridge DLN (Liquidity Network) v1.0 API.
// Scope: outbound from Solana to any supported chain.
// Inbound (EVM → Solana) needs an EVM wallet stack; the Bridge page links
// users to deBridge's hosted UI with prefilled params for that direction.
//
// Docs: https://dln.debridge.finance/v1.0/

import { Connection, VersionedTransaction } from "@solana/web3.js";

const DLN_BASE = "https://dln.debridge.finance/v1.0";

export const SOLANA_CHAIN_ID = 7565164;

export type DebridgeChain = {
  id: number;
  name: string;
  shortName: string;
  // The USDC ERC20 / SPL address on this chain — the safest cross-chain stable
  // anchor. Native gas tokens can be added later per-chain.
  usdc: string;
  // Native token "address" placeholder (per DLN convention).
  nativeAddress: string;
  nativeSymbol: string;
  // Brand color for the chain pill in the token selector (used as a fallback
  // background while the logo image loads, and as the colored-initial fallback
  // if the logo fails to load entirely).
  color: string;
  // Brand logo URL. DefiLlama's icon CDN gives us consistent square icons
  // for every chain at one stable URL pattern.
  logoURI: string;
  // Whether we can drive this chain from on-page UI today. SVM works (Solana
  // wallet adapter). EVM chains need wagmi/RainbowKit wiring — until then we
  // surface a "Connect EVM wallet" hand-off for those.
  vmKind: "SVM" | "EVM";
};

// Curated destination chains. USDC addresses verified 2026-06-03 from Circle's
// official mainnet contract list. The SVM entry (Solana) is the only one we
// can drive directly today — EVM chains are surfaced for visual parity but
// the actual sign/send flow needs an EVM wallet stack (v2).
// Chain icon URLs from DefiLlama's icon CDN — stable, free, no rate limits.
const LL = (slug: string) => `https://icons.llamao.fi/icons/chains/rsz_${slug}?w=48&h=48`;

export const SOLANA_CHAIN: DebridgeChain = {
  id: SOLANA_CHAIN_ID, name: "Solana", shortName: "SOL",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  nativeAddress: "11111111111111111111111111111111", nativeSymbol: "SOL",
  color: "#9945FF", logoURI: LL("solana"), vmKind: "SVM",
};

export const BRIDGE_DESTINATIONS: DebridgeChain[] = [
  SOLANA_CHAIN,
  { id: 1,     name: "Ethereum",  shortName: "ETH",  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "ETH",  color: "#627EEA", logoURI: LL("ethereum"),  vmKind: "EVM" },
  { id: 8453,  name: "Base",      shortName: "Base", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "ETH",  color: "#0052FF", logoURI: LL("base"),      vmKind: "EVM" },
  { id: 42161, name: "Arbitrum",  shortName: "ARB",  usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "ETH",  color: "#28A0F0", logoURI: LL("arbitrum"),  vmKind: "EVM" },
  { id: 10,    name: "Optimism",  shortName: "OP",   usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "ETH",  color: "#FF0420", logoURI: LL("optimism"),  vmKind: "EVM" },
  { id: 137,   name: "Polygon",   shortName: "POL",  usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "POL",  color: "#8247E5", logoURI: LL("polygon"),   vmKind: "EVM" },
  { id: 56,    name: "BSC",       shortName: "BSC",  usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "BNB",  color: "#F3BA2F", logoURI: LL("bsc"),       vmKind: "EVM" },
  { id: 43114, name: "Avalanche", shortName: "AVAX", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", nativeAddress: "0x0000000000000000000000000000000000000000", nativeSymbol: "AVAX", color: "#E84142", logoURI: LL("avalanche"), vmKind: "EVM" },
];

// Common token presets per chain — surfaced in the token-pay selector.
export type TokenPreset = {
  address: string;          // SPL mint OR ERC20 address OR nativeAddress
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
  // Optional brand logo URL. Most popular tokens have stable CoinGecko URLs;
  // unknown tokens fall back to a deterministic gradient initial.
  logoURI?: string;
};

// Common token logos hosted by CoinGecko's CDN (stable URLs).
const TOKEN_LOGOS: Record<string, string> = {
  SOL:  "https://assets.coingecko.com/coins/images/4128/standard/solana.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
  USDT: "https://assets.coingecko.com/coins/images/325/standard/Tether.png",
  JUP:  "https://assets.coingecko.com/coins/images/34188/standard/jup.png",
  ETH:  "https://assets.coingecko.com/coins/images/279/standard/ethereum.png",
  BNB:  "https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png",
  POL:  "https://assets.coingecko.com/coins/images/4713/standard/polygon.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/standard/polygon.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png",
};

export function tokenLogo(symbol: string): string | undefined {
  return TOKEN_LOGOS[symbol.toUpperCase()];
}

// Builder so we apply the logo lookup to every entry without repeating ourselves.
const T = (
  address: string, symbol: string, name: string, decimals: number,
  opts?: { isNative?: boolean },
): TokenPreset => ({
  address, symbol, name, decimals, isNative: opts?.isNative,
  logoURI: tokenLogo(symbol),
});

export const TOKENS_BY_CHAIN: Record<number, TokenPreset[]> = {
  [SOLANA_CHAIN_ID]: [
    T("So11111111111111111111111111111111111111112", "SOL",  "Solana",   9, { isNative: true }),
    T("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC", "USD Coin", 6),
    T("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USDT", "Tether",   6),
    T("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "JUP",  "Jupiter",   6),
  ],
  1: [
    T("0x0000000000000000000000000000000000000000", "ETH",  "Ethereum",  18, { isNative: true }),
    T("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USDC", "USD Coin",  6),
    T("0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", "Tether",    6),
  ],
  8453: [
    T("0x0000000000000000000000000000000000000000", "ETH",  "Ethereum",  18, { isNative: true }),
    T("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", "USD Coin",  6),
  ],
  42161: [
    T("0x0000000000000000000000000000000000000000", "ETH",  "Ethereum",  18, { isNative: true }),
    T("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", "USD Coin",  6),
  ],
  10: [
    T("0x0000000000000000000000000000000000000000", "ETH",  "Ethereum",  18, { isNative: true }),
    T("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", "USD Coin",  6),
  ],
  137: [
    T("0x0000000000000000000000000000000000000000", "POL",  "Polygon",   18, { isNative: true }),
    T("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "USDC", "USD Coin",  6),
  ],
  56: [
    T("0x0000000000000000000000000000000000000000", "BNB",  "BNB",       18, { isNative: true }),
    T("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", "USD Coin",  18),
  ],
  43114: [
    T("0x0000000000000000000000000000000000000000", "AVAX", "Avalanche", 18, { isNative: true }),
    T("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", "USDC", "USD Coin",  6),
  ],
};

export function getChain(id: number): DebridgeChain | null {
  return BRIDGE_DESTINATIONS.find((c) => c.id === id) ?? null;
}

export function getTokens(chainId: number): TokenPreset[] {
  return TOKENS_BY_CHAIN[chainId] ?? [];
}

// Solana-side source tokens we expose by default.
export const SOLANA_SOURCE_TOKENS = [
  { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT", name: "Tether",   mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  { symbol: "SOL",  name: "Wrapped SOL (will auto-wrap)", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
] as const;

export type DebridgeQuote = {
  estimation: {
    srcChainTokenIn: {
      address: string;
      amount: string;
      decimals?: number;
      symbol?: string;
    };
    dstChainTokenOut: {
      address: string;
      amount: string;
      decimals?: number;
      symbol?: string;
    };
    costsDetails: any[];
    recommendedSlippage?: number;
  };
  tx?: {
    allowanceTarget?: string;
    value?: string;
    data?: string;
  };
  order?: {
    approximateFulfillmentDelay?: number;
  };
  fixFee?: string;
  orderId?: string;
};

export type QuoteParams = {
  srcChainTokenIn: string;
  srcChainTokenInAmount: bigint;   // base units
  dstChainId: number;
  dstChainTokenOut: string;
  // Optional fee bps (we always use 0 — Redacted takes no bridge fee).
  affiliateFeePercent?: number;
};

export async function quoteBridge(p: QuoteParams): Promise<DebridgeQuote> {
  const params = new URLSearchParams({
    srcChainId: String(SOLANA_CHAIN_ID),
    srcChainTokenIn: p.srcChainTokenIn,
    srcChainTokenInAmount: p.srcChainTokenInAmount.toString(),
    dstChainId: String(p.dstChainId),
    dstChainTokenOut: p.dstChainTokenOut,
    dstChainTokenOutAmount: "auto",
    prependOperatingExpenses: "true",
    affiliateFeePercent: String(p.affiliateFeePercent ?? 0),
  });
  const r = await fetch(`${DLN_BASE}/dln/order/quote?${params.toString()}`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`deBridge quote failed (${r.status}): ${t.slice(0, 240)}`);
  }
  return (await r.json()) as DebridgeQuote;
}

export type CreateTxParams = QuoteParams & {
  // Where the bridge IS authorized on the source chain (Solana addr, e.g.
  // your wallet pubkey for personal mode or the vault PDA for vault mode).
  srcChainOrderAuthorityAddress: string;
  // Where the bridged tokens land on the destination chain.
  dstChainTokenOutRecipient: string;
  // Who can cancel/refund on the destination chain. Same as recipient is fine.
  dstChainOrderAuthorityAddress: string;
};

export type DebridgeCreateTxResult = {
  // Base64-encoded VersionedTransaction for Solana source.
  txData?: string;
  // Mirror fields some DLN versions return; some versions return a tx object.
  tx?: {
    data?: string;        // base64 for Solana, hex for EVM
    value?: string;
    to?: string;
  };
  estimation: DebridgeQuote["estimation"];
  orderId?: string;
};

export async function createBridgeTx(p: CreateTxParams): Promise<DebridgeCreateTxResult> {
  const params = new URLSearchParams({
    srcChainId: String(SOLANA_CHAIN_ID),
    srcChainTokenIn: p.srcChainTokenIn,
    srcChainTokenInAmount: p.srcChainTokenInAmount.toString(),
    dstChainId: String(p.dstChainId),
    dstChainTokenOut: p.dstChainTokenOut,
    dstChainTokenOutAmount: "auto",
    srcChainOrderAuthorityAddress: p.srcChainOrderAuthorityAddress,
    dstChainTokenOutRecipient: p.dstChainTokenOutRecipient,
    dstChainOrderAuthorityAddress: p.dstChainOrderAuthorityAddress,
    prependOperatingExpenses: "true",
    affiliateFeePercent: String(p.affiliateFeePercent ?? 0),
  });
  const r = await fetch(`${DLN_BASE}/dln/order/create-tx?${params.toString()}`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`deBridge create-tx failed (${r.status}): ${t.slice(0, 240)}`);
  }
  return (await r.json()) as DebridgeCreateTxResult;
}

// Decode the base64 Solana VersionedTransaction returned by deBridge.
export function decodeSolanaTx(result: DebridgeCreateTxResult): VersionedTransaction {
  // DLN currently returns it under tx.data (with encoding "base64") for Solana
  // source chains. Some older builds used txData. Support both.
  const b64 = result.tx?.data ?? result.txData;
  if (!b64) throw new Error("deBridge response missing Solana transaction data.");
  const buf = Buffer.from(b64, "base64");
  return VersionedTransaction.deserialize(buf);
}

// Build the deBridge web URL for inbound (EVM → Solana) bridging, prefilled
// with the user's Solana recipient address + a default USDC route. We can't
// drive the inbound flow on-chain without an EVM wallet stack, so we hand
// off to deBridge's hosted UI for those cases.
export function inboundLink(opts: {
  recipient: string;
  fromChain?: DebridgeChain;
  toToken?: string;   // SPL mint, default USDC
}): string {
  const from = opts.fromChain ?? BRIDGE_DESTINATIONS[1]; // default Base
  const toToken = opts.toToken ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const params = new URLSearchParams({
    inputChain: String(from.id),
    outputChain: String(SOLANA_CHAIN_ID),
    inputCurrency: from.usdc,
    outputCurrency: toToken,
    recipient: opts.recipient,
    dlnMode: "simple",
  });
  return `https://app.debridge.finance/?${params.toString()}`;
}

// Human-friendly amount → base units. Returns null on bad input.
export function toBaseUnits(amount: string, decimals: number): bigint | null {
  if (!amount) return null;
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try { return BigInt(whole + fracPadded); } catch { return null; }
}

export function fromBaseUnits(amount: bigint | string, decimals: number): string {
  const n = typeof amount === "bigint" ? amount : BigInt(amount);
  const s = n.toString().padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return `${s.slice(0, cut)}.${s.slice(cut)}`.replace(/\.?0+$/, "");
}
