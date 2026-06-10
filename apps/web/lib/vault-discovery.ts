import { Connection, PublicKey } from "@solana/web3.js";
import { SQUADS_PROGRAM_ID } from "./env";
import { loadMultisig } from "./squads";
import { addVault, loadVaults } from "./vault-store";
import { cachedGetSignaturesForAddress } from "./rpc-cache";

const SQUADS_PROGRAM = new PublicKey(SQUADS_PROGRAM_ID);

/** Simple sleep helper to be nice to RPCs and avoid 429s. */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract Helius API key from the RPC URL if present (supports the standard helius-rpc.com format). */
function getHeliusApiKey(conn: Connection): string | null {
  const endpoint = (conn as any)?.rpcEndpoint || (conn as any)?._rpcEndpoint || "";
  if (!endpoint || !endpoint.includes("helius")) return null;
  const m = endpoint.match(/[?&]api-key=([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

/** Retry wrapper with exponential backoff for 429 / transient errors. */
async function withBackoff<T>(fn: () => Promise<T>, label = "rpc"): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const is429 = msg.includes("429") || e?.status === 429 || e?.code === 429;
      if (is429 || attempt < 2) {
        const delay = 300 * Math.pow(2, attempt) + Math.random() * 200;
        if (is429) {
          console.warn(`[${label}] 429 rate limit, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1})`);
        }
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/** Fetch a page of parsed transactions for an address using Helius enhanced API (much more efficient than raw getSignatures + getTransaction). */
async function fetchHeliusTxPage(address: string, apiKey: string, limit = 100, before?: string): Promise<any[]> {
  const params = new URLSearchParams({ "api-key": apiKey, limit: String(limit) });
  if (before) params.set("before", before);
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?${params.toString()}`;
  const res = await withBackoff(() => fetch(url), "helius-tx");
  if (!res.ok) {
    if (res.status === 429) {
      // Let withBackoff handle retry at caller, but surface it
      throw new Error(`Helius 429`);
    }
    throw new Error(`Helius API error ${res.status}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Scans the connected wallet's recent transaction history for Squads v4
 * `multisigCreateV2` transactions where this wallet was the creator / fee payer.
 *
 * For each candidate, we attempt to load it as a valid multisig and confirm
 * the wallet is currently one of the members. This is the most reliable way
 * to surface "vaults I created" without a full indexer.
 *
 * Returns the list of newly discovered multisig addresses (base58) that were
 * not already in the local store.
 */
export async function discoverVaultsCreatedBy(
  connection: Connection,
  creator: PublicKey,
  options: { limit?: number } = {}
): Promise<string[]> {
  const { limit = 150 } = options;
  const creatorStr = creator.toBase58();
  const discovered: string[] = [];
  const alreadyKnown = new Set<string>();

  const heliusKey = getHeliusApiKey(connection);

  if (heliusKey) {
    // Preferred path: Helius enhanced address transactions API.
    // One call returns many fully-parsed txs (including instruction accounts).
    // We paginate with `before` to go deeper than a single page without exploding rate limits.
    // We do a few pages (respecting the caller's limit as approximate max txs to consider).
    let before: string | undefined;
    let totalConsidered = 0;
    const maxPages = Math.max(1, Math.ceil(limit / 80)); // ~80-100 per Helius page

    for (let page = 0; page < maxPages; page++) {
      try {
        const txs = await fetchHeliusTxPage(creatorStr, heliusKey, 100, before);
        if (!txs.length) break;

        for (const tx of txs) {
          totalConsidered++;
          before = tx.signature; // for next page (Helius uses the oldest sig in the page as before for previous)

          const instructions: any[] = tx.instructions || tx.accountData || [];
          const squadsIxs = instructions.filter((ix: any) => ix.programId === SQUADS_PROGRAM_ID || ix.programId === SQUADS_PROGRAM.toBase58());

          for (const ix of squadsIxs) {
            const accounts: string[] = ix.accounts || ix.accountKeys || [];
            for (const acct of accounts) {
              if (!acct || acct === creatorStr || acct === SQUADS_PROGRAM_ID) continue;
              if (acct.startsWith("1111") || acct.length < 32) continue;

              const candidate = new PublicKey(acct);
              const addr = candidate.toBase58();
              if (alreadyKnown.has(addr)) continue;

              try {
                const view = await withBackoff(() => loadMultisig(connection, candidate), "loadMultisig");
                const isMember = view.members.some((m) => m.pubkey.equals(creator));
                if (isMember) {
                  discovered.push(addr);
                  alreadyKnown.add(addr);
                }
              } catch {
                // ignore non-multisig or load failure
              }
            }
          }
        }

        // Be polite between pages to avoid 429s on Helius
        if (page < maxPages - 1) await sleep(250 + Math.random() * 150);

        if (totalConsidered >= limit) break;
      } catch (e) {
        console.warn("Helius discovery page failed, stopping early:", e);
        break;
      }
    }
  } else {
    // Fallback: standard web3.js path (used when not on Helius or key missing).
    // Slower and more calls, so we are extra careful with batching + backoff.
    let signatures: any[] = [];
    try {
      signatures = await withBackoff(
        () => cachedGetSignaturesForAddress(connection, creator, { limit: Math.min(limit, 200) }),
        "getSignatures"
      );
    } catch (e) {
      console.warn("discoverVaultsCreatedBy: getSignaturesForAddress failed", e);
      return [];
    }

    // Process in small batches with sleeps
    const batchSize = 8;
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (sigInfo: any) => {
          if (!sigInfo?.signature) return;
          try {
            const tx = await withBackoff(
              () =>
                connection.getTransaction(sigInfo.signature, {
                  maxSupportedTransactionVersion: 0,
                  commitment: "confirmed",
                }),
              "getTransaction"
            );
            if (!tx?.transaction?.message) return;

            const msg: any = tx.transaction.message;

            if (msg.addressTableLookups && msg.addressTableLookups.length > 0) return;

            let accountKeys: PublicKey[];
            try {
              accountKeys = msg.getAccountKeys().staticAccountKeys;
            } catch {
              return;
            }

            const candidates: PublicKey[] = [];
            for (const ix of msg.compiledInstructions || []) {
              const programId = accountKeys[ix.programIdIndex];
              if (!programId || !programId.equals(SQUADS_PROGRAM)) continue;
              const ixAccountKeys = (ix.accountKeyIndexes || []).map((idx: number) => accountKeys[idx]).filter(Boolean);
              for (const key of ixAccountKeys) {
                if (key.equals(creator) || key.equals(SQUADS_PROGRAM)) continue;
                const b58 = key.toBase58();
                if (b58.startsWith("1111") || b58.length < 32) continue;
                candidates.push(key);
              }
            }

            for (const candidate of candidates) {
              const addr = candidate.toBase58();
              if (alreadyKnown.has(addr)) continue;
              try {
                const view = await withBackoff(() => loadMultisig(connection, candidate), "loadMultisig");
                if (view.members.some((m) => m.pubkey.equals(creator))) {
                  discovered.push(addr);
                  alreadyKnown.add(addr);
                }
              } catch {}
            }
          } catch {
            // per-tx resilience
          }
        })
      );

      // Small delay between batches
      if (i + batchSize < signatures.length) await sleep(180);
    }
  }

  return [...new Set(discovered)];
}

/**
 * Convenience helper (still works for any callers): runs discovery and merges into local list.
 * Returns how many *new* vaults were added this time.
 */
export async function syncCreatedVaultsForWallet(
  connection: Connection,
  creator: PublicKey,
  options?: { limit?: number; autoBookmark?: boolean }
): Promise<number> {
  const { limit = 300, autoBookmark = true } = options ?? {};

  const found = await discoverVaultsCreatedBy(connection, creator, { limit });

  let added = 0;
  for (const address of found) {
    const before = loadVaults().length;
    addVault({ address, bookmarked: autoBookmark, readOnly: false });
    if (loadVaults().length > before) added++;
  }
  return added;
}
