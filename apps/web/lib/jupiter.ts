// Jupiter Price API v3 — returns usdPrice + priceChange24h (as %).
// https://api.jup.ag/price/v3  (free tier, may benefit from x-api-key for rate limits)

export type PriceMap = Record<string, { price: number; priceChange24h?: number } | undefined>;

export async function fetchPrices(mints: string[]): Promise<PriceMap> {
  if (mints.length === 0) return {};
  const ids = mints.join(",");
  // Try v3 first for 24h change; fallback to v2 lite if needed
  let res = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`);
  if (!res.ok) {
    res = await fetch(`https://lite-api.jup.ag/price/v2?ids=${ids}`);
  }
  if (!res.ok) return {};
  const json = (await res.json()) as any;
  const out: PriceMap = {};
  // v3 shape: { [mint]: { usdPrice, priceChange24h?, ... } }
  const data = json.data ?? json;
  for (const [mint, entry] of Object.entries(data ?? {})) {
    if (entry) {
      const price = Number((entry as any).usdPrice ?? (entry as any).price);
      const ch = (entry as any).priceChange24h != null ? Number((entry as any).priceChange24h) : undefined;
      if (price) out[mint] = { price, priceChange24h: ch };
    }
  }
  return out;
}

// Jupiter strict token list — symbol/name/decimals/logo for verified mints.
export type TokenInfo = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
};

let TOKEN_CACHE: Map<string, TokenInfo> | null = null;
export async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  if (!TOKEN_CACHE) {
    const res = await fetch("https://lite-api.jup.ag/tokens/v1/tagged/verified");
    if (!res.ok) return null;
    const list = (await res.json()) as TokenInfo[];
    TOKEN_CACHE = new Map(list.map((t) => [t.address, t]));
  }
  return TOKEN_CACHE.get(mint) ?? null;
}
