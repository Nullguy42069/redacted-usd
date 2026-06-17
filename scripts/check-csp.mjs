#!/usr/bin/env node
// check-csp.mjs — CI gate: refuse to ship without a CSP on the deployed site.
//
// Runs against the production URL by default (REDACTED_DEPLOY_URL or .xyz).
// Skips in PR/local builds when CHECK_CSP_LIVE_ONLY=1 is unset (so dev never
// blocks). Configure as a deploy-pipeline step that runs AFTER deploy and
// blocks promotion to canonical DNS if CSP isn't present.

const url = process.env.REDACTED_DEPLOY_URL || "https://redacted-usd.xyz";

const REQUIRED_DIRECTIVES = ["default-src", "frame-ancestors", "script-src"];

async function main() {
  let r;
  try {
    r = await fetch(url, { redirect: "follow" });
  } catch (e) {
    console.error(`[check-csp] could not fetch ${url}: ${e.message}`);
    process.exit(2);
  }
  const csp =
    r.headers.get("content-security-policy") ||
    r.headers.get("content-security-policy-report-only");
  if (!csp) {
    console.error(`[check-csp] FAIL: no Content-Security-Policy header at ${url}`);
    process.exit(1);
  }
  const lower = csp.toLowerCase();
  const missing = REQUIRED_DIRECTIVES.filter((d) => !lower.includes(d));
  if (missing.length) {
    console.error(`[check-csp] FAIL: CSP missing required directives: ${missing.join(", ")}`);
    console.error(`[check-csp] received: ${csp.slice(0, 300)}`);
    process.exit(1);
  }
  // Hard fail on `unsafe-eval` (arbitrary string→code). `wasm-unsafe-eval` is the
  // narrow WASM-compile grant the ZK prover needs and is explicitly allowed —
  // strip those tokens before testing so they don't trip the check.
  const withoutWasm = lower.replace(/'wasm-unsafe-eval'/g, "");
  if (withoutWasm.includes("unsafe-eval")) {
    console.error(`[check-csp] FAIL: CSP allows 'unsafe-eval' — arbitrary code-eval surface.`);
    console.error(`[check-csp] received: ${csp.slice(0, 300)}`);
    process.exit(1);
  }
  // frame-ancestors must be 'none' — anything else leaves a clickjacking surface
  // on a signing UI. Hard fail (was a warning).
  if (!lower.match(/frame-ancestors\s+['"]?none['"]?/)) {
    console.error(`[check-csp] FAIL: frame-ancestors must be 'none' on a wallet/signing UI.`);
    console.error(`[check-csp] received: ${csp.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[check-csp] OK — CSP present at ${url}`);
  console.log(`[check-csp] ${csp.slice(0, 200)}`);
}

main().catch((e) => {
  console.error(`[check-csp] crashed: ${e.message}`);
  process.exit(2);
});
