#!/usr/bin/env node
// Enforces the zero-fee invariant: if any of these tokens appear in source,
// the build fails. The product must remain free to use forever.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FORBIDDEN = [
  "platformFee",
  "platformFeeBps",
  "platformFeeAccount",
  "referralAccount",
  "referrerAccount",
  "feeAccount",
  "integratorFee",
  "integratorReferrer",
  "partnerFee",
];

const TRACKED_EXTS = ["ts", "tsx", "js", "mjs", "rs"];
const SCAN_DIRS = ["apps", "packages", "programs", "encrypted-ixs"];

const pattern = FORBIDDEN.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const extGlob = `*.{${TRACKED_EXTS.join(",")}}`;

let hits = "";
try {
  hits = execSync(
    `grep -rEn --include='${extGlob}' '(${pattern})' ${SCAN_DIRS.join(" ")} 2>/dev/null || true`,
    { encoding: "utf8" },
  );
} catch {}

// Exclude this very file from matching its own forbidden-list.
hits = hits
  .split("\n")
  .filter((line) => line && !line.includes("scripts/check-no-fees.mjs"))
  .join("\n");

if (hits.trim()) {
  console.error("ZERO-FEE INVARIANT VIOLATED. Private Safe must remain free forever.");
  console.error("Forbidden tokens found:");
  console.error(hits);
  process.exit(1);
}
console.log("OK: no fee/referrer tokens found.");
