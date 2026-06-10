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
  if (lower.includes("frame-ancestors") && !lower.match(/frame-ancestors\s+['"]?none['"]?/)) {
    console.error(`[check-csp] WARN: frame-ancestors is set but not 'none' — clickjacking surface remains.`);
  }
  console.log(`[check-csp] OK — CSP present at ${url}`);
  console.log(`[check-csp] ${csp.slice(0, 200)}`);
}

main().catch((e) => {
  console.error(`[check-csp] crashed: ${e.message}`);
  process.exit(2);
});
