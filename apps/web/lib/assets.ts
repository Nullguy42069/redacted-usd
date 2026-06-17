import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { fetchPrices, getTokenInfo, type TokenInfo } from "./jupiter";
import { HELIUS_API_KEY } from "./env";
import {
  cachedGetBalance,
  cachedGetParsedTokenAccountsByOwner,
  cachedGetTokenMetadata,
} from "./rpc-cache";

const SOL_PSEUDO_MINT = "So11111111111111111111111111111111111111112";

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export type AssetRow = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  amount: number; // human-scaled (for display only — never for transfer math)
  amountBaseUnits: string; // exact raw base units from chain (lossless; use this for shield/transfer)
  priceUsd: number | null;
  valueUsd: number | null;
  priceChange24h?: number | null; // percentage, e.g. -14.49 for -14.49%
};

export async function loadAssets(conn: Connection, vault: PublicKey): Promise<AssetRow[]> {
  const [solLamports, tokenAccounts2022, tokenAccountsLegacy] = await Promise.all([
    cachedGetBalance(conn, vault),
    cachedGetParsedTokenAccountsByOwner(conn, vault, { programId: TOKEN_2022_PROGRAM_ID }),
    cachedGetParsedTokenAccountsByOwner(conn, vault, { programId: TOKEN_PROGRAM_ID }),
  ]);

  type ParsedTokenAccount = {
    account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; uiAmountString: string; decimals: number } } } } };
  };
  const tokens: { mint: string; amount: number; amountBaseUnits: string; decimals: number }[] = [];
  for (const acc of [...tokenAccountsLegacy.value, ...tokenAccounts2022.value] as unknown as ParsedTokenAccount[]) {
    const info = acc.account.data.parsed.info;
    // `amount` is the exact on-chain base-unit string; uiAmountString is a lossy
    // float we keep only for display. Use the raw string for any transfer math.
    const raw = info.tokenAmount.amount ?? "0";
    const ui = Number(info.tokenAmount.uiAmountString ?? "0");
    if (ui > 0) {
      tokens.push({
        mint: info.mint,
        amount: ui,
        amountBaseUnits: raw,
        decimals: info.tokenAmount.decimals,
      });
    }
  }

  const mints = [SOL_PSEUDO_MINT, ...tokens.map((t) => t.mint)];
  const [prices, ...jupiterMetas] = await Promise.all([
    fetchPrices(mints),
    ...mints.map((m) => getTokenInfo(m)),
  ]);

  // Helius DAS (getAsset) is a paid-RPC call — use it ONLY as a fallback for
  // mints Jupiter couldn't fully describe (missing name or logo), not for every
  // asset on every load. Well-known tokens (the common case) never hit Helius.
  const mintsNeedingHelius = mints.filter((m, i) => {
    const j = jupiterMetas[i];
    return !j || !j.name || j.name === "Unknown" || !j.logoURI;
  });
  const heliusMetas = mintsNeedingHelius.length
    ? await getHeliusTokenMetas(mintsNeedingHelius)
    : {};

  const rows: AssetRow[] = [];

  const solJupiterMeta = jupiterMetas[0] ?? wrappedSolMeta();
  const solHelius = heliusMetas[SOL_PSEUDO_MINT] || {};
  const solMeta = {
    symbol: (solHelius.symbol || solJupiterMeta.symbol || "SOL").replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim(),
    name: (solHelius.name || solJupiterMeta.name || "Solana").replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim(),
    logoURI: solHelius.logoURI || solJupiterMeta.logoURI,
  };
  const solAmount = solLamports / LAMPORTS_PER_SOL;
  const solPriceEntry = prices[SOL_PSEUDO_MINT];
  const solPrice = solPriceEntry?.price ?? null;
  rows.push({
    mint: SOL_PSEUDO_MINT,
    symbol: solMeta.symbol,
    name: solMeta.name,
    decimals: 9,
    logoURI: solMeta.logoURI,
    amount: solAmount,
    amountBaseUnits: solLamports.toString(),
    priceUsd: solPrice,
    valueUsd: solPrice != null ? solAmount * solPrice : null,
    priceChange24h: solPriceEntry?.priceChange24h ?? null,
  });

  const tokenMetas = await Promise.all(
    tokens.map(async (t, i) => {
      const jMeta = jupiterMetas[i + 1];
      const hMeta = heliusMetas[t.mint] || {};
      let name = (hMeta.name || jMeta?.name || "Unknown").replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
      let symbol = (hMeta.symbol || jMeta?.symbol || t.mint.slice(0, 4)).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
      let logoURI = hMeta.logoURI || jMeta?.logoURI;

      if (name === "Unknown" || !logoURI) {
        const onChain = await getOnChainTokenMeta(conn, new PublicKey(t.mint));
        name = onChain.name || name;
        symbol = onChain.symbol || symbol;
        logoURI = onChain.logoURI || logoURI;
      }

      const priceEntry = prices[t.mint];
      const price = priceEntry?.price ?? null;
      return {
        mint: t.mint,
        symbol,
        name,
        decimals: t.decimals,
        logoURI,
        amount: t.amount,
        amountBaseUnits: t.amountBaseUnits,
        priceUsd: price,
        valueUsd: price != null ? t.amount * price : null,
        priceChange24h: priceEntry?.priceChange24h ?? null,
      };
    })
  );

  tokenMetas.forEach((meta) => rows.push(meta));

  // Sort by USD value desc, unknowns last.
  rows.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  return rows;
}

function wrappedSolMeta(): TokenInfo {
  return {
    address: SOL_PSEUDO_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  };
}

function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  return pda;
}

async function getOnChainTokenMeta(conn: Connection, mint: PublicKey): Promise<{ name?: string; symbol?: string; logoURI?: string }> {
  try {
    const pda = getMetadataPDA(mint);
    // Token metadata is immutable per mint — long TTL is safe and saves repeated lookups
    const account = await cachedGetTokenMetadata(conn, pda);
    if (!account?.data) return {};

    const data: Uint8Array = account.data instanceof Uint8Array ? account.data : new Uint8Array(account.data);
    let offset = 1; // key
    offset += 32; // updateAuthority
    offset += 32; // mint

    // Helper: read little-endian u32 from Uint8Array (browser safe)
    const readU32LE = (arr: Uint8Array, off: number): number => {
      const a = arr[off] ?? 0;
      const b = arr[off + 1] ?? 0;
      const c = arr[off + 2] ?? 0;
      const d = arr[off + 3] ?? 0;
      return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0;
    };

    // name
    const nameLen = readU32LE(data, offset);
    offset += 4;
    let name = new TextDecoder("utf-8", { fatal: false }).decode(data.slice(offset, offset + nameLen)).replace(/\0/g, "").trim();
    offset += nameLen;

    // symbol
    const symbolLen = readU32LE(data, offset);
    offset += 4;
    let symbol = new TextDecoder("utf-8", { fatal: false }).decode(data.slice(offset, offset + symbolLen)).replace(/\0/g, "").trim();
    offset += symbolLen;

    // Clean control chars / padding that some tokens have in on-chain metadata
    name = name.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    symbol = symbol.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

    // uri
    const uriLen = readU32LE(data, offset);
    offset += 4;
    let uri = new TextDecoder("utf-8", { fatal: false }).decode(data.slice(offset, offset + uriLen)).replace(/\0/g, "").trim();

    let logoURI: string | undefined;
    if (uri) {
      try {
        let fetchUri = uri;
        if (uri.startsWith("ipfs://")) fetchUri = uri.replace("ipfs://", "https://ipfs.io/ipfs/");
        else if (uri.startsWith("ar://")) fetchUri = uri.replace("ar://", "https://arweave.net/");
        const metaRes = await fetch(fetchUri);
        if (metaRes.ok) {
          const json = await metaRes.json();
          let img = json.image || json.logoURI || json.icon || json.properties?.image ||
                    (Array.isArray(json.files) && json.files.find((f: any) => (f.type || f.mime || '').startsWith('image'))?.uri) ||
                    (Array.isArray(json.files) && json.files[0]?.uri);
          if (img && typeof img === "string") {
            if (img.startsWith("ipfs://")) img = img.replace("ipfs://", "https://ipfs.io/ipfs/");
            else if (img.startsWith("ar://")) img = img.replace("ar://", "https://arweave.net/");
            logoURI = img;
          }
        }
      } catch {}
    }

    return {
      name: name || undefined,
      symbol: symbol || undefined,
      logoURI,
    };
  } catch {
    return {};
  }
}

/**
 * Fetch rich token metadata from Helius DAS (getAsset) - much better for newer tokens and proper PFPs/images.
 * DAS surfaces on-chain Metaplex metadata + enriched off-chain data for most tokens, including fresh meme coins.
 * Falls back gracefully if no key or errors.
 */
export async function getHeliusTokenMetas(mints: string[]): Promise<Record<string, { name?: string; symbol?: string; logoURI?: string; priceUsd?: number | null }>> {
  if (!HELIUS_API_KEY || mints.length === 0) return {};
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const out: Record<string, { name?: string; symbol?: string; logoURI?: string; priceUsd?: number | null }> = {};

  // Fetch in parallel - small number of tokens per wallet, Helius handles it well
  await Promise.all(mints.map(async (mint) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "getAsset",
          params: { id: mint }
        })
      });
      if (!res.ok) return;
      const json = await res.json();
      const asset = json?.result;
      if (!asset || asset.interface !== "FungibleToken") return;

      const content = asset.content || {};
      const meta = content.metadata || {};
      let image = content.links?.image || content.files?.[0]?.uri || meta.image ||
                  (Array.isArray(content.files) && content.files.find((f: any) => (f.mime || '').startsWith('image'))?.uri);

      if (image && typeof image === "string") {
        // Resolve common decentralized URIs
        if (image.startsWith("ipfs://")) image = image.replace("ipfs://", "https://ipfs.io/ipfs/");
        else if (image.startsWith("ar://")) image = image.replace("ar://", "https://arweave.net/");
        else if (image.startsWith("https://arweave.net/")) { /* already good */ }
      }

      // Clean
      const cleanName = meta.name ? String(meta.name).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() : undefined;
      const cleanSymbol = meta.symbol ? String(meta.symbol).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() : undefined;

      const priceInfo = (asset as any).token_info?.price_info;
      const priceUsd = priceInfo?.price_per_token != null ? Number(priceInfo.price_per_token) : null;

      out[mint] = {
        name: cleanName,
        symbol: cleanSymbol,
        logoURI: image ? String(image) : undefined,
        priceUsd,
      };
    } catch {
      // ignore individual failures
    }
  }));

  return out;
}

export function totalUsd(rows: AssetRow[]): number {
  return rows.reduce((acc, r) => acc + (r.valueUsd ?? 0), 0);
}
