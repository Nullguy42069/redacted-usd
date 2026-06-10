// Lightweight in-memory RPC response cache.
//
// Purpose: reduce repeat hits to Helius (or whatever RPC the wallet is on) when
// the same data is fetched by multiple components on the same page, or re-fetched
// on every tab switch / dialog open. Cache lives in-memory per browser tab; it's
// NOT shared across users or persisted across reloads.
//
// Two access patterns:
//   - cached(key, ttl, fetcher) — generic TTL cache for arbitrary RPC calls
//   - typed wrappers (cachedGetBalance, cachedGetAccountInfo, ...) — preferred for hot paths
//
// Invalidation: after a user submits a transaction, call invalidate() with the
// appropriate prefix so the next read fetches fresh state. The post-tx flow in
// each dialog should call invalidateAfterTx(vaultPubkey) to clear the standard
// cluster of keys that would have changed.

import type { Connection, PublicKey, GetProgramAccountsFilter } from "@solana/web3.js";

type CacheEntry<T = unknown> = { value: T; expiresAt: number };

const cache = new Map<string, CacheEntry>();

// Optional: in-flight de-duplication. If two components request the same key at
// the same moment, only one network round trip happens.
const inFlight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      const value = await fetcher();
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

// Remove all keys with a given prefix. Use after user actions invalidate state.
export function invalidate(prefix: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

// Nuclear clear — only on wallet switch or vault switch
export function invalidateAll(): void {
  cache.clear();
}

// Standard cluster of keys that change after the user submits a vault tx.
// Call this in dialog success paths so the next page render shows the new state
// instead of stale cache.
export function invalidateAfterTx(vault: PublicKey | string): void {
  const v = typeof vault === "string" ? vault : vault.toBase58();
  invalidate(`bal:${v}`);
  invalidate(`tokAcc:${v}`);
  invalidate(`multisig:`); // any proposal/tx list — keyed by multisigPda not vault
  invalidate(`sigs:${v}`);
}

// ─── Typed wrappers for hot paths ────────────────────────────────────────────

// Native SOL balance. 30s TTL — changes only on signed tx.
export async function cachedGetBalance(
  conn: Connection,
  pubkey: PublicKey,
  ttlMs = 30_000,
): Promise<number> {
  return cached(`bal:${pubkey.toBase58()}`, ttlMs, () => conn.getBalance(pubkey));
}

// Account info. 30s TTL. For immutable accounts (token metadata), pass a long TTL.
export async function cachedGetAccountInfo(
  conn: Connection,
  pubkey: PublicKey,
  ttlMs = 30_000,
): Promise<Awaited<ReturnType<Connection["getAccountInfo"]>>> {
  return cached(`acct:${pubkey.toBase58()}`, ttlMs, () => conn.getAccountInfo(pubkey));
}

// Batch account info. Key by sorted base58 pubkeys so different call orders share cache.
export async function cachedGetMultipleAccountsInfo(
  conn: Connection,
  pubkeys: PublicKey[],
  ttlMs = 15_000,
): Promise<Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>> {
  const ids = pubkeys.map((p) => p.toBase58());
  const sortedKey = [...ids].sort().join(",");
  return cached(`multisig:${sortedKey}`, ttlMs, () => conn.getMultipleAccountsInfo(pubkeys));
}

// SPL token accounts by owner. Key includes program filter so 2022 + legacy don't collide.
export async function cachedGetParsedTokenAccountsByOwner(
  conn: Connection,
  owner: PublicKey,
  filter: { programId: PublicKey },
  ttlMs = 30_000,
): Promise<Awaited<ReturnType<Connection["getParsedTokenAccountsByOwner"]>>> {
  const key = `tokAcc:${owner.toBase58()}:${filter.programId.toBase58()}`;
  return cached(key, ttlMs, () => conn.getParsedTokenAccountsByOwner(owner, filter));
}

// Signatures for address (transaction history). 60s TTL — append-only, freshness OK.
export async function cachedGetSignaturesForAddress(
  conn: Connection,
  pubkey: PublicKey,
  opts: { limit?: number; before?: string; until?: string } = {},
  ttlMs = 60_000,
): Promise<Awaited<ReturnType<Connection["getSignaturesForAddress"]>>> {
  const key = `sigs:${pubkey.toBase58()}:${opts.limit ?? 25}:${opts.before ?? ""}:${opts.until ?? ""}`;
  return cached(key, ttlMs, () => conn.getSignaturesForAddress(pubkey, opts));
}

// Token metadata is IMMUTABLE per mint — cache 24h. (If a creator updates the
// metadata account, browser refresh picks it up. Trade-off worth it.)
export async function cachedGetTokenMetadata(
  conn: Connection,
  metadataPda: PublicKey,
): Promise<Awaited<ReturnType<Connection["getAccountInfo"]>>> {
  return cached(`meta:${metadataPda.toBase58()}`, 24 * 60 * 60_000, () => conn.getAccountInfo(metadataPda));
}

// Dev/debug helper — surfaces cache stats. Wire into a settings page later.
export function cacheStats(): { entries: number; inFlight: number; keys: string[] } {
  return {
    entries: cache.size,
    inFlight: inFlight.size,
    keys: [...cache.keys()],
  };
}
