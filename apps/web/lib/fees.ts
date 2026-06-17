/**
 * Redacted fee layer.
 *
 * All fees are paid in SOL to the project wallet and fund ongoing server costs.
 * Two shapes, applied on BOTH the wallet (personal) side and the vault (multisig) side:
 *   - Percentage fee: 0.1% of the transaction's USD value, capped at $0.99
 *     (swaps, bridges, transfers).
 *   - Flat fee: $0.99 each for vault creation and every signer add/remove.
 *
 * SOL/USD comes from the app's existing Jupiter price feed (lib/jupiter.ts).
 * The fee is delivered as a plain SystemProgram.transfer to REDACTED_FEE_WALLET,
 * either composed into the action's own transaction or sent as a paired tx where
 * the provider hands back a pre-built transaction we can't append to.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { fetchPrices } from "./jupiter";

/** Project fee wallet — every fee in the system lands here. */
export const REDACTED_FEE_WALLET = new PublicKey("5zno6VrqGtXNphqkTc8skN6sPeyMZ7tXFwczaR7yn2Y3");

export const FEE_BPS = 10; // 0.1%
export const FEE_CAP_USD = 0.99; // max per-transaction percentage fee
export const FLAT_FEE_USD = 0.99; // vault create + signer add/remove

const WSOL_MINT = "So11111111111111111111111111111111111111112";

// Sane SOL/USD band — a feed returning a wildly wrong price (depeg glitch, wrong
// units, thin route) must fail closed, not mint a giant fee transfer.
const SOL_USD_MIN = 1;
const SOL_USD_MAX = 100_000;
// Absolute backstop on any single fee, regardless of price math. The USD cap is
// $0.99; even at SOL=$1 that's <1 SOL, so 1.5 SOL is an unreachable-in-normal-ops
// ceiling that still catches any arithmetic/oracle blow-up.
const MAX_FEE_LAMPORTS = 1_500_000_000; // 1.5 SOL

/**
 * Live SOL/USD from the app price feed. Throws if unavailable OR out of a sane
 * band, so a bad oracle can never silently skip or balloon a fee.
 */
export async function getSolUsdPrice(): Promise<number> {
  const prices = await fetchPrices([WSOL_MINT]);
  const p = prices[WSOL_MINT]?.price;
  if (!p || !(p > 0) || p < SOL_USD_MIN || p > SOL_USD_MAX) {
    throw new Error("SOL price unavailable or out of range for the fee — try again in a moment.");
  }
  return p;
}

/**
 * USD value of a token amount, from the app price feed. Throws (fail-closed) if
 * the token isn't priced — so a user can't zero the fee by swapping an unpriced
 * custom mint.
 */
export async function tokenUsdValue(
  mint: string,
  baseUnits: number | bigint,
  decimals: number,
): Promise<number> {
  const prices = await fetchPrices([mint]);
  const price = prices[mint]?.price;
  if (!price || !(price > 0)) {
    throw new Error("Couldn't price this token for the fee — try a token with a market price.");
  }
  return (Number(baseUnits) / 10 ** decimals) * price;
}

function usdToLamports(usd: number, solUsd: number): number {
  const lamports = Math.round((usd / solUsd) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports < 0 || lamports > MAX_FEE_LAMPORTS) {
    throw new Error("Computed fee is out of the expected range — aborting for safety.");
  }
  return lamports;
}

/** 0.1% of usdValue, capped at $0.99, in lamports. */
export function percentFeeLamports(usdValue: number, solUsd: number): number {
  const feeUsd = Math.min((usdValue * FEE_BPS) / 10_000, FEE_CAP_USD);
  return feeUsd > 0 ? usdToLamports(feeUsd, solUsd) : 0;
}

/** Flat $0.99 in lamports (vault create / signer change). */
export function flatFeeLamports(solUsd: number): number {
  return usdToLamports(FLAT_FEE_USD, solUsd);
}

/** SystemProgram.transfer(payer → fee wallet). */
export function feeTransferIx(payer: PublicKey, lamports: number): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: REDACTED_FEE_WALLET,
    lamports,
  });
}

/**
 * Percentage-fee instruction for a transaction of a given USD value. Returns
 * null only if the computed fee rounds to 0 (e.g. dust). Throws on price failure.
 */
export async function percentFeeIx(
  payer: PublicKey,
  usdValue: number,
): Promise<TransactionInstruction | null> {
  const solUsd = await getSolUsdPrice();
  const lamports = percentFeeLamports(usdValue, solUsd);
  return lamports > 0 ? feeTransferIx(payer, lamports) : null;
}

/** Flat-fee instruction (vault create / signer add/remove). Throws on price failure. */
export async function flatFeeIx(payer: PublicKey): Promise<TransactionInstruction> {
  const solUsd = await getSolUsdPrice();
  return feeTransferIx(payer, flatFeeLamports(solUsd));
}

type SendFn = (tx: VersionedTransaction, conn: Connection) => Promise<string>;

/** Send + confirm a standalone fee transfer. Used where the action's own tx is
 * built by an aggregator/provider and we can't compose the fee into it. */
async function sendFeeTx(
  conn: Connection,
  send: SendFn,
  payer: PublicKey,
  lamports: number,
): Promise<string> {
  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [feeTransferIx(payer, lamports)],
  }).compileToV0Message();
  const sig = await send(new VersionedTransaction(msg), conn);
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

/** Charge the flat $0.99 fee as its own confirmed tx (vault create / signer change). */
export async function payFlatFee(conn: Connection, send: SendFn, payer: PublicKey): Promise<void> {
  const solUsd = await getSolUsdPrice();
  await sendFeeTx(conn, send, payer, flatFeeLamports(solUsd));
}

/** Charge the 0.1%/$0.99-cap percentage fee as its own confirmed tx (vault transfer / bridge). */
export async function payPercentFee(
  conn: Connection,
  send: SendFn,
  payer: PublicKey,
  usdValue: number,
): Promise<void> {
  const solUsd = await getSolUsdPrice();
  const lamports = percentFeeLamports(usdValue, solUsd);
  if (lamports > 0) await sendFeeTx(conn, send, payer, lamports);
}
