/**
 * Umbra shield / unshield — the REAL privacy backend (Arcium MPC).
 *
 * Replaces the retired Light stub. Umbra is an "airlock": it shields a public
 * SPL / Token-2022 balance into an Encrypted Token Account (amount + balance
 * hidden, sender/graph unlinkable) and unshields it back. A "private swap" is
 * shield → fresh addr → Jupiter → re-shield, composed elsewhere; this module is
 * the shield/unshield leg.
 *
 * CLIENT-ONLY + heavy (pulls snarkjs / zk-prover). Import it via dynamic import
 * from a client component only — never at module top-level of a server file.
 *
 * It uses the connected Wallet-Standard wallet (Redacted extension / Phantom /
 * Solflare) as the Umbra signer: the wallet signs, and Umbra's relayer submits
 * the exit (gasless). Redacted runs no paid RPC — the SDK's indexer/subscription
 * reads use the app's configured RPC_URL (free public mainnet-beta by default).
 *
 * LIVE on mainnet. The shield amount is the exact public-ATA base units; the
 * unshield amount is the decrypted SHIELDED balance (queried from the encrypted
 * token account). The SDK is still an RC (@umbra-privacy/sdk@5.0.0-rc.6) and the
 * shield→unshield round-trip has not yet been exercised end-to-end — test with a
 * TINY amount first on mainnet before moving real size.
 */
import { getWallets } from "@wallet-standard/app";
import {
  createSignerFromWalletAccount,
  getUmbraClient,
} from "@umbra-privacy/sdk";
import { createU64 } from "@umbra-privacy/sdk/types";
import { PublicKey } from "@solana/web3.js";
import { getATAIntoETADirectDepositorFunction } from "@umbra-privacy/sdk/deposit";
import { getETAIntoATAWithdrawerFunction } from "@umbra-privacy/sdk/withdrawal";
import { getEncryptedBalanceQuerierFunction } from "@umbra-privacy/sdk/query";
import { RPC_URL } from "./env";

// Wallet-Standard types, inferred from the discovery API so we don't take a
// direct @wallet-standard/base dependency (structurally identical to it).
type StdWallet = ReturnType<ReturnType<typeof getWallets>["get"]>[number];
type StdAccount = StdWallet["accounts"][number];

// Umbra's hosted services (read-only indexer + gasless exit relayer).
const UMBRA_INDEXER_ENDPOINT = "https://utxo-indexer.api.umbraprivacy.com";
const UMBRA_RELAYER_ENDPOINT = "https://relayer.api.umbraprivacy.com";
// Umbra needs both an HTTP and a WS RPC; derive WS from the configured HTTP RPC.
const RPC_SUBSCRIPTIONS_URL = RPC_URL.replace(/^http/i, "ws");
// Must match the network behind RPC_URL. mainnet supports wSOL/USDC/USDT;
// switch to "devnet" (wSOL only) for the end-to-end verification pass.
const UMBRA_NETWORK = "mainnet" as const;

export type UmbraShieldParams = {
  /** base58 owner pubkey of the connected wallet (the shield/unshield account). */
  ownerBase58: string;
  /** base58 SPL / Token-2022 mint to shield (e.g. USDC). */
  mintBase58: string;
  /** raw base-unit amount (e.g. 1_000_000n = 1 USDC at 6 decimals). */
  amountBaseUnits: bigint;
  /** Optional wallet-adapter name to disambiguate when several wallets are present. */
  walletName?: string;
};

/**
 * Find the Wallet-Standard wallet/account for the connected owner. The Redacted
 * extension, Phantom and Solflare all register via wallet-standard and expose
 * the features Umbra requires (signTransaction + signMessage for seed derivation).
 */
function resolveWalletAccount(
  ownerBase58: string,
  walletName?: string,
): { wallet: StdWallet; account: StdAccount } {
  for (const w of getWallets().get()) {
    const features = Object.keys(w.features);
    if (
      !features.includes("solana:signTransaction") ||
      !features.includes("solana:signMessage")
    ) {
      continue;
    }
    if (walletName && w.name !== walletName) continue;
    const account =
      w.accounts.find((a) => a.address === ownerBase58) ?? w.accounts[0];
    if (account) return { wallet: w, account };
  }
  throw new Error(
    "No connected wallet supports Umbra (needs Wallet-Standard signTransaction + signMessage). Connect the Redacted extension, Phantom, or Solflare.",
  );
}

// The SDK's branded Address type isn't exported, so derive the depositor's
// mint-param type directly from its signature.
type ShieldAddress = Parameters<ReturnType<typeof getATAIntoETADirectDepositorFunction>>[1];

/** Validate a base58 mint via PublicKey (throws on bad input) and brand it as the SDK's Address. */
function toMint(mintBase58: string): ShieldAddress {
  return new PublicKey(mintBase58).toBase58() as unknown as ShieldAddress;
}

async function umbraClientFor(ownerBase58: string, walletName?: string) {
  const { wallet, account } = resolveWalletAccount(ownerBase58, walletName);
  const signer = createSignerFromWalletAccount({ wallet, account });
  const client = await getUmbraClient({
    signer,
    network: UMBRA_NETWORK,
    rpcUrl: RPC_URL,
    rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
    indexerApiEndpoint: UMBRA_INDEXER_ENDPOINT,
  });
  return { client, signer };
}

/** Toggle ON: move a public ATA balance into the owner's Encrypted Token Account. */
export async function umbraShield(params: UmbraShieldParams) {
  const { client, signer } = await umbraClientFor(params.ownerBase58, params.walletName);
  const deposit = getATAIntoETADirectDepositorFunction({ client });
  return deposit(
    signer.address,
    toMint(params.mintBase58),
    createU64({ value: params.amountBaseUnits }),
  );
}

/**
 * Toggle OFF: move the shielded balance back to the public ATA.
 *
 * The amount is read from the SHIELDED balance (the encrypted token account),
 * NOT the public ATA — that's the whole point of an exit, and the public ATA is
 * ~0 right after a shield. We query the encrypted account, decrypt its balance,
 * and withdraw the full amount. (params.amountBaseUnits is intentionally ignored
 * here; it reflects the public balance, which is the wrong source for an exit.)
 */
export async function umbraUnshield(params: UmbraShieldParams) {
  const { client, signer } = await umbraClientFor(params.ownerBase58, params.walletName);
  const mint = toMint(params.mintBase58);

  // Decrypt the current shielded balance for this mint.
  const fetchBalances = getEncryptedBalanceQuerierFunction({ client });
  const balances = await fetchBalances([mint]);
  const result = balances.get(mint);
  if (!result || result.state !== "shared") {
    throw new Error(
      `No spendable shielded balance for this token (state: ${result?.state ?? "unknown"}). Nothing to unshield.`,
    );
  }
  const shieldedAmount = BigInt(result.balance);
  if (shieldedAmount <= 0n) {
    throw new Error("Shielded balance is zero — nothing to unshield.");
  }

  // NOTE: this submits the exit via the client (the connected wallet pays gas),
  // not Umbra's gasless relayer. Wiring UMBRA_RELAYER_ENDPOINT for a gasless exit
  // is a later refinement; paying gas yourself is correct and fine for now.
  const withdraw = getETAIntoATAWithdrawerFunction({ client });
  return withdraw(signer.address, mint, createU64({ value: shieldedAmount }));
}
