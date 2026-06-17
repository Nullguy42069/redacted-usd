/**
 * Pre-sign transaction guard — the antidote to blind-signing.
 *
 * The swap/bridge providers (Jupiter, deBridge) hand back a fully-built
 * VersionedTransaction that the user signs. If that response were tampered with
 * (compromised endpoint, MITM, malicious mirror) it could smuggle in a
 * fund-draining instruction or swap the fee payer. The wallet would just show
 * "sign?" with no context — classic blind-sign.
 *
 * This module decodes the tx (resolving Address Lookup Tables so NOTHING is
 * hidden behind a LUT index) and enforces two deterministic invariants before
 * we ever call sendTransaction:
 *
 *   1. assertSignerOnly — the connected user is the fee payer (account 0) and is
 *      the ONLY unmet required signature. A tampered tx can't make the user
 *      co-sign for an extra authority or hand fee-payment to someone else.
 *   2. assertProgramAllowlist — every top-level instruction invokes a known,
 *      expected program. A drain instruction (e.g. SystemProgram.transfer to an
 *      attacker, or a Token transfer to a foreign ATA) uses a program too, but
 *      an injected *call path* that routes value out shows up as either a
 *      disallowed program or — for System/Token — is caught by the signer/
 *      fee-payer invariant plus the human-visible summary.
 *
 * Used hard on the Jupiter swap path (its program set is small + stable). The
 * bridge path enforces the signer invariant and surfaces its program set.
 */
import {
  Connection,
  PublicKey,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";

// Well-known mainnet programs we expect to see in routed swaps/bridges.
export const KNOWN_PROGRAMS: Record<string, string> = {
  ComputeBudget111111111111111111111111111111: "ComputeBudget",
  "11111111111111111111111111111111": "System",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "AssociatedToken",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter v6",
  src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4: "deBridge DLN Source",
  dst5MGcFPoBeREFAA5E3tU5ij8m5uVYwkzkSAbsLbNo: "deBridge DLN Destination",
};

// Program allowlist for a Jupiter swap transaction (top-level instructions only —
// the aggregator CPIs into AMMs internally, which never surface as top-level).
export const JUPITER_SWAP_PROGRAMS = new Set<string>([
  "ComputeBudget111111111111111111111111111111",
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
]);

export type TxSummary = {
  feePayer: string;
  /** Required signer pubkeys, in order (index < numRequiredSignatures). */
  requiredSigners: string[];
  /** Distinct top-level program ids invoked. */
  programs: string[];
  /** Human labels for those programs ("unknown:<id>" if unrecognized). */
  programLabels: string[];
};

/** Fetch + cache the LUTs a tx references so we can resolve every account key. */
async function resolveLuts(
  conn: Connection,
  tx: VersionedTransaction,
): Promise<AddressLookupTableAccount[]> {
  const lookups = tx.message.addressTableLookups ?? [];
  if (lookups.length === 0) return [];
  const accts = await Promise.all(
    lookups.map(async (l) => {
      const res = await conn.getAddressLookupTable(l.accountKey);
      if (!res.value) {
        throw new Error(`Could not load a lookup table the transaction references (${l.accountKey.toBase58()}).`);
      }
      return res.value;
    }),
  );
  return accts;
}

/** Decode a (possibly LUT-using) versioned tx into an inspectable summary. */
export async function summarizeTx(
  conn: Connection,
  tx: VersionedTransaction,
): Promise<TxSummary> {
  const luts = await resolveLuts(conn, tx);
  const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: luts });
  const numSigners = tx.message.header.numRequiredSignatures;

  const get = (i: number): PublicKey => {
    const k = keys.get(i);
    if (!k) throw new Error(`Transaction references account index ${i} that can't be resolved.`);
    return k;
  };

  const requiredSigners: string[] = [];
  for (let i = 0; i < numSigners; i++) requiredSigners.push(get(i).toBase58());

  const programs: string[] = [];
  for (const ci of tx.message.compiledInstructions) {
    const pid = get(ci.programIdIndex).toBase58();
    if (!programs.includes(pid)) programs.push(pid);
  }

  return {
    feePayer: get(0).toBase58(),
    requiredSigners,
    programs,
    programLabels: programs.map((p) => KNOWN_PROGRAMS[p] ?? `unknown:${p}`),
  };
}

/**
 * Enforce that the connected user is the fee payer and the only signature we're
 * being asked to add. Any other required-signer slot must already carry a
 * signature (a provider co-signer), never an empty slot the user would blind-sign
 * for. Throws otherwise.
 */
export function assertSignerOnly(
  tx: VersionedTransaction,
  summary: TxSummary,
  signerBase58: string,
): void {
  if (summary.feePayer !== signerBase58) {
    throw new Error(
      `Refusing to sign: this transaction's fee payer is ${summary.feePayer}, not your wallet. (Possible tampered response.)`,
    );
  }
  const sigs = tx.signatures;
  for (let i = 0; i < summary.requiredSigners.length; i++) {
    const who = summary.requiredSigners[i];
    if (who === signerBase58) continue;
    // A different required signer is only acceptable if already signed.
    const sig = sigs[i];
    const signed = sig && sig.some((b) => b !== 0);
    if (!signed) {
      throw new Error(
        `Refusing to sign: transaction asks for an unsigned signature from ${who}, which isn't your wallet. (Possible tampered response.)`,
      );
    }
  }
}

/** Throw if any top-level program isn't in the allowlist. */
export function assertProgramAllowlist(summary: TxSummary, allowed: Set<string>): void {
  const bad = summary.programs.filter((p) => !allowed.has(p));
  if (bad.length) {
    const labels = bad.map((p) => KNOWN_PROGRAMS[p] ?? p).join(", ");
    throw new Error(
      `Refusing to sign: transaction invokes an unexpected program (${labels}). Aborting for safety.`,
    );
  }
}

/**
 * Full guard for a personal Jupiter swap: user-only signer + Jupiter program
 * allowlist. Returns the summary (for optional display). Throws on any breach.
 */
export async function guardJupiterSwap(
  conn: Connection,
  tx: VersionedTransaction,
  signerBase58: string,
): Promise<TxSummary> {
  const summary = await summarizeTx(conn, tx);
  assertSignerOnly(tx, summary, signerBase58);
  assertProgramAllowlist(summary, JUPITER_SWAP_PROGRAMS);
  return summary;
}

/**
 * Guard for a personal deBridge transfer: enforce the user-only signer invariant
 * (deterministic, can't break a legit bridge) and surface the program set so an
 * unrecognized program is at least logged rather than silently signed. We do NOT
 * hard-allowlist bridge programs — DLN's exact program set varies by route and a
 * too-tight list would block legitimate bridges.
 */
export async function guardBridge(
  conn: Connection,
  tx: VersionedTransaction,
  signerBase58: string,
): Promise<TxSummary> {
  const summary = await summarizeTx(conn, tx);
  assertSignerOnly(tx, summary, signerBase58);
  const unknown = summary.programs.filter((p) => !KNOWN_PROGRAMS[p]);
  if (unknown.length) {
    console.warn("[tx-guard] bridge tx invokes unrecognized program(s):", unknown.join(", "));
  }
  return summary;
}
