// Thin wrapper around Jupiter v6's lite-api endpoints.
// Two modes:
//   - getSwapTransaction(): returns a ready-to-sign VersionedTransaction
//     (for personal-wallet swaps).
//   - getSwapInstructions(): returns the raw instructions + LUTs so they can
//     be packaged inside a Squads vault transaction proposal.
//
// No in-route aggregator fee here; the Redacted fee is a separate SOL transfer (see lib/fees.ts).

import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

const JUP_BASE = "https://lite-api.jup.ag/swap/v1";

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;        // base units, string for big-int safety
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
};

export type QuoteInput = {
  inputMint: string;        // base58 mint
  outputMint: string;       // base58 mint
  amount: bigint;           // base units (input for ExactIn, output for ExactOut)
  slippageBps: number;      // 50 = 0.5%
  swapMode?: "ExactIn" | "ExactOut";
  onlyDirectRoutes?: boolean;
};

export async function getQuote(input: QuoteInput): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: input.amount.toString(),
    slippageBps: String(input.slippageBps),
    swapMode: input.swapMode ?? "ExactIn",
    onlyDirectRoutes: String(!!input.onlyDirectRoutes),
    restrictIntermediateTokens: "true",
  });
  const r = await fetch(`${JUP_BASE}/quote?${params.toString()}`, { method: "GET" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Jupiter quote failed (${r.status}): ${t.slice(0, 200)}`);
  }
  return (await r.json()) as JupiterQuote;
}

// Ready-to-sign tx. Used for personal-wallet swaps (no multisig).
export async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  opts?: { wrapAndUnwrapSol?: boolean; computeUnitPriceMicroLamports?: number },
): Promise<VersionedTransaction> {
  const body = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: opts?.wrapAndUnwrapSol ?? true,
    computeUnitPriceMicroLamports: opts?.computeUnitPriceMicroLamports,
    dynamicComputeUnitLimit: true,
    skipUserAccountsRpcCalls: true,
  };
  const r = await fetch(`${JUP_BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Jupiter swap-tx failed (${r.status}): ${t.slice(0, 200)}`);
  }
  const json = await r.json();
  const buf = Buffer.from(json.swapTransaction, "base64");
  return VersionedTransaction.deserialize(buf);
}

export type JupSwapInstructions = {
  tokenLedgerInstruction?: TransactionInstruction;
  computeBudgetInstructions: TransactionInstruction[];
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction?: TransactionInstruction;
  addressLookupTableAddresses: PublicKey[];
};

// Raw instructions + LUTs. Used for vault-mode swaps where the swap is the
// inner ix of a Squads vault transaction proposal.
export async function getSwapInstructions(
  conn: Connection,
  quote: JupiterQuote,
  userPublicKey: string,
): Promise<JupSwapInstructions> {
  const body = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    skipUserAccountsRpcCalls: true,
  };
  const r = await fetch(`${JUP_BASE}/swap-instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Jupiter swap-instructions failed (${r.status}): ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  if (j.error) throw new Error(j.error);

  const toIx = (raw: any): TransactionInstruction => new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((a: any) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(raw.data, "base64"),
  });

  return {
    tokenLedgerInstruction: j.tokenLedgerInstruction ? toIx(j.tokenLedgerInstruction) : undefined,
    computeBudgetInstructions: (j.computeBudgetInstructions ?? []).map(toIx),
    setupInstructions: (j.setupInstructions ?? []).map(toIx),
    swapInstruction: toIx(j.swapInstruction),
    cleanupInstruction: j.cleanupInstruction ? toIx(j.cleanupInstruction) : undefined,
    addressLookupTableAddresses: (j.addressLookupTableAddresses ?? []).map((s: string) => new PublicKey(s)),
  };
}

// Fetch LUT accounts for the swap (Jupiter often uses 2-3 LUTs). Needed when
// we compose a v0 transaction containing the Jupiter swap.
export async function fetchLookupTables(
  conn: Connection,
  addresses: PublicKey[],
): Promise<AddressLookupTableAccount[]> {
  const out: AddressLookupTableAccount[] = [];
  for (const a of addresses) {
    const info = await conn.getAccountInfo(a);
    if (!info) continue;
    out.push(new AddressLookupTableAccount({
      key: a,
      state: AddressLookupTableAccount.deserialize(info.data),
    }));
  }
  return out;
}

// Common token presets shown in the picker. Users can paste any mint too.
export const SWAP_TOKEN_PRESETS = [
  { symbol: "SOL",   name: "Solana",          mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  { symbol: "USDC",  name: "USD Coin",        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT",  name: "Tether",          mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  { symbol: "JUP",   name: "Jupiter",         mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
  { symbol: "BONK",  name: "Bonk",            mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
  { symbol: "HYPE",  name: "Hyperliquid",     mint: "HYPEv4FBz2gRdvUDXq2Ekmiivp4iDuDPgZS5xR2W9fDe", decimals: 6 },
] as const;

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
