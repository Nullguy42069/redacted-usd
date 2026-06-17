#!/usr/bin/env node
// Fee-integrity invariant (replaces the former zero-fee gate).
//
// Redacted charges a small SOL fee to fund server costs: 0.1% of a transaction's
// USD value capped at $0.99, plus a flat $0.99 for vault creation and each signer
// add/remove. The fee is a transparent SystemProgram.transfer to the project
// wallet (apps/web/lib/fees.ts).
//
// Because this is open source, this guard ensures nobody can silently (a) redirect
// the fee to a different wallet or (b) raise the cap above $0.99 via an unreviewed
// change. It is intentionally narrow and auditable.
import { readFileSync } from "node:fs";

const FEES_FILE = "apps/web/lib/fees.ts";
const EXPECTED_WALLET = "5zno6VrqGtXNphqkTc8skN6sPeyMZ7tXFwczaR7yn2Y3";
const MAX_CAP_USD = 0.99;
const MAX_FEE_BPS = 10; // 0.1% — nobody silently raises the percentage either

function fail(msg) {
  console.error(`FEE INTEGRITY VIOLATED: ${msg}`);
  process.exit(1);
}

let src;
try {
  src = readFileSync(FEES_FILE, "utf8");
} catch {
  console.error(`FEE INTEGRITY: cannot read ${FEES_FILE}`);
  process.exit(1);
}

// Parse the ACTUAL wallet initializer, not just "is this string somewhere in the
// file" (which a comment could satisfy while the real PublicKey points elsewhere).
// Pin the exact form: REDACTED_FEE_WALLET = new PublicKey("<base58>").
const walletInits = [...src.matchAll(/REDACTED_FEE_WALLET\s*=\s*new\s+PublicKey\(\s*["']([1-9A-HJ-NP-Za-km-z]+)["']\s*\)/g)];
if (walletInits.length === 0) {
  fail(`${FEES_FILE} no longer initializes REDACTED_FEE_WALLET = new PublicKey("…").`);
}
if (walletInits.length > 1) {
  fail(`REDACTED_FEE_WALLET is initialized ${walletInits.length}× — exactly one definition is required.`);
}
const boundWallet = walletInits[0][1];
if (boundWallet !== EXPECTED_WALLET) {
  fail(`REDACTED_FEE_WALLET points to ${boundWallet}, not the project wallet ${EXPECTED_WALLET}.`);
}
// Defense in depth: any OTHER PublicKey literal feeding a fee transfer is suspicious.
// (The only PublicKey in this file should be the fee wallet.)
const allPubkeys = [...src.matchAll(/new\s+PublicKey\(\s*["']([1-9A-HJ-NP-Za-km-z]{32,44})["']\s*\)/g)].map((m) => m[1]);
const stray = allPubkeys.filter((k) => k !== EXPECTED_WALLET);
if (stray.length) {
  fail(`unexpected PublicKey literal(s) in ${FEES_FILE}: ${stray.join(", ")} — only the fee wallet belongs here.`);
}

// Numeric constants: anchor to a top-level `const NAME =` so a same-named field
// elsewhere can't shadow the check, and require exactly one definition.
function pinNumber(name, max) {
  const matches = [...src.matchAll(new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*([0-9_.]+)`, "g"))];
  if (matches.length !== 1) {
    fail(`${name} must be defined exactly once (found ${matches.length}).`);
  }
  const val = Number(matches[0][1].replace(/_/g, ""));
  if (!Number.isFinite(val)) fail(`${name} is not a finite number.`);
  if (!(val <= max)) fail(`${name} (${val}) exceeds the allowed maximum (${max}).`);
  return val;
}

const bps = pinNumber("FEE_BPS", MAX_FEE_BPS);
const cap = pinNumber("FEE_CAP_USD", MAX_CAP_USD);
const flat = pinNumber("FLAT_FEE_USD", MAX_CAP_USD);

console.log(
  `OK: fee wallet pinned to ${EXPECTED_WALLET}; FEE_BPS=${bps}≤${MAX_FEE_BPS}, ` +
    `cap $${cap}≤$${MAX_CAP_USD}, flat $${flat}≤$${MAX_CAP_USD}.`,
);
