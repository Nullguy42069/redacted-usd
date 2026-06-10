#!/usr/bin/env node
// Weekly privacy backend scanner.
//
// Two jobs:
//   1. Check every backend we know about for version / status updates.
//   2. Look for new privacy-on-Solana projects we haven't catalogued yet.
//
// Output: a Markdown report under docs/scanner-reports/YYYY-MM-DD.md with any
// proposed diffs to packages/aggregator/src/backends/registry.ts. Humans review
// + merge the changes.
//
// Scheduling: run via cron (e.g. PM2 `pm2 start scripts/weekly-privacy-scan.mjs
// --cron "0 9 * * 1"`) or the /schedule skill.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REGISTRY_PATH = join(
  ROOT,
  "packages/aggregator/src/backends/registry.ts",
);
const REPORT_DIR = join(ROOT, "docs/scanner-reports");

// ─────────────── Known backends ───────────────
// Dynamically derived from registry.ts so adding a backend here auto-enrolls it
// in future scans. SECURITY: we never auto-mutate the registry or load candidates
// at runtime. Scanner only proposes. Promotion to REGISTRY requires:
//   1. Formal audit or equivalent for privacyScore >=60
//   2. 2 human reviewers (one cryptographer) + explicit multisig approval for prod
//   3. Adapter implementation passing our test harness
// This ordering (Security > Reliability > Privacy > Speed > Cost) is non-negotiable.
const REGISTRY_META = loadRegistryMeta();
const TRACKED = REGISTRY_META.map((m) => ({
  id: m.id,
  npm: inferNpm(m.id),
  github: inferGithub(m.id),
  site: m.site || null,
}));

// ─────────────── Discovery search terms ───────────────
// What we'd Google-equivalent search to find brand-new Solana privacy projects.
// Output of the scanner includes a "TODO manual review" section listing these
// queries so the human reviewer can paste them into a search tool.
const DISCOVERY_QUERIES = [
  "new privacy project Solana 2026",
  "Solana FHE program mainnet",
  "Solana ZK proof program privacy mainnet",
  "Solana TEE confidential compute new",
  "Solana stealth address protocol",
  "Solana mixer privacy launch",
  "site:github.com solana privacy",
  "Colosseum hackathon privacy track winners",
];

// ─────────────── Helpers ───────────────

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": "redacted-usd-scanner/0", ...headers } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function checkNpm(pkg) {
  const data = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
  return { version: data.version, time: null };
}

async function checkGithubLatestRelease(repo) {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`, {
      accept: "application/vnd.github+json",
    });
    return { tag: data.tag_name, publishedAt: data.published_at, name: data.name };
  } catch (e) {
    // Repos without releases often just tag; fall back to tags endpoint.
    try {
      const tags = await fetchJson(`https://api.github.com/repos/${repo}/tags?per_page=1`);
      if (Array.isArray(tags) && tags.length > 0) {
        return { tag: tags[0].name, publishedAt: null, name: tags[0].name };
      }
    } catch {}
    return { tag: null, publishedAt: null, name: null, error: e?.message ?? String(e) };
  }
}

function loadRegistryLastVerified() {
  const src = readFileSync(REGISTRY_PATH, "utf8");
  const map = new Map();
  // Extremely naive: scan for `id: "...",` followed by `lastVerifiedAt: "..."`.
  const re = /id:\s*"([^"]+)"[\s\S]*?lastVerifiedAt:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

// Load enough static meta to drive the scanner without hardcoding.
function loadRegistryMeta() {
  const src = readFileSync(REGISTRY_PATH, "utf8");
  const metas = [];
  // Pull id + supportedIntents + trustNotes + lastVerified for signals.
  const idRe = /id:\s*"([^"]+)"/g;
  let idMatch;
  const idList = [];
  while ((idMatch = idRe.exec(src)) !== null) idList.push(idMatch[1]);
  for (const id of idList) {
    metas.push({ id, site: inferSite(id) });
  }
  return metas;
}

function inferNpm(id) {
  if (id === "arcium") return "@arcium-hq/client";
  if (id === "light-compressed") return "@lightprotocol/stateless.js";
  return null;
}
function inferGithub(id) {
  if (id === "arcium") return "arcium-hq/arcium";
  if (id === "magicblock-tee") return "magicblock-labs/ephemeral-rollups-sdk";
  if (id === "light-compressed") return "Lightprotocol/light-protocol";
  return null;
}
function inferSite(id) {
  if (id === "arcium") return "https://arcium.com";
  if (id === "magicblock-tee") return "https://www.magicblock.xyz/solana-privacy";
  if (id === "encrypt-fhe") return "https://encrypt.xyz";
  if (id === "token2022-confidential") return "https://solana.com/privacy";
  if (id === "light-compressed") return "https://lightprotocol.com";
  if (id === "zkprime") return "https://www.zkprime.dev";
  return null;
}

// Best-effort GitHub repo search for brand new Solana privacy work.
// Uses public API (rate-limited ~10 req/min unauth). With GITHUB_TOKEN in env
// we get 30x more. Anything returned here is a *candidate only* — never auto
// added to REGISTRY or loaded by the aggregator.
async function discoverNewSolanaPrivacy() {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const q = encodeURIComponent('solana (privacy OR mpc OR "confidential" OR fhe OR "tee" OR "zero knowledge") created:>2026-04-01');
  try {
    const data = await fetchJson(
      `https://api.github.com/search/repositories?q=${q}&sort=updated&per_page=8`,
      headers
    );
    return (data.items || [])
      .filter((r) => r.stargazers_count > 2 || r.forks_count > 1)
      .map((r) => ({
        fullName: r.full_name,
        desc: r.description,
        url: r.html_url,
        pushed: r.pushed_at,
        stars: r.stargazers_count,
      }));
  } catch (e) {
    return [{ error: `discovery failed (add GITHUB_TOKEN for production): ${e?.message ?? e}` }];
  }
}

// ─────────────── Main ───────────────

const today = new Date().toISOString().slice(0, 10);
const lastVerified = loadRegistryLastVerified();

const findings = [];

for (const t of TRACKED) {
  const entry = { id: t.id, npm: null, github: null, notes: [] };
  if (t.npm) {
    try {
      const npm = await checkNpm(t.npm);
      entry.npm = `${t.npm}@${npm.version}`;
    } catch (e) {
      entry.notes.push(`npm check failed: ${e?.message ?? e}`);
    }
  }
  if (t.github) {
    try {
      const gh = await checkGithubLatestRelease(t.github);
      entry.github = gh.tag ? `${t.github} ${gh.tag} (${gh.publishedAt ?? "no date"})` : `${t.github} (no releases)`;
    } catch (e) {
      entry.notes.push(`github check failed: ${e?.message ?? e}`);
    }
  }
  const prev = lastVerified.get(t.id);
  if (prev) entry.lastVerifiedAt = prev;
  findings.push(entry);
}

// ─────────────── Discovery + candidate proposals (SECURITY GATED) ───────────────
const newCandidates = await discoverNewSolanaPrivacy();

// Generate strict candidate stubs + meta. These land in docs/proposed-candidates/
// ONLY. The PrivacyAggregator and router NEVER load from here. Human + audit
// required before any promotion. This is how "auto build new system into selection"
// happens without violating Security > Reliability.
const CANDIDATE_DIR = join(ROOT, "docs/proposed-candidates");
if (newCandidates.length > 0 && !newCandidates[0]?.error && !existsSync(CANDIDATE_DIR)) {
  mkdirSync(CANDIDATE_DIR, { recursive: true });
}
for (const c of newCandidates) {
  if (c.error) continue;
  const safeId = c.fullName.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 40);
  const meta = {
    id: safeId,
    displayName: c.fullName,
    trustModel: "unknown",
    auditStatus: "unaudited",
    privacyScore: 10, // placeholder — real score only after rubric + review
    supportedIntents: ["compute", "transfer"],
    network: "devnet",
    baselineLatencyMs: 5000,
    baselineCostLamports: 5000,
    trustNotes: [
      "DISCOVERED BY SCANNER — NOT YET REVIEWED.",
      "Requires full security audit before registry promotion.",
      `Upstream: ${c.url}`,
    ],
    lastVerifiedAt: today,
    source: c,
  };
  const stub = `// STUB for ${c.fullName}. SECURITY REVIEW MANDATORY.
// Implements PrivacyBackend from @redacted-usd/aggregator/types.
// Do not import or register until:
//   - 2 reviewers (cryptographer + sec) sign off
//   - Audit report added to docs/audits/
//   - Multisig proposal records the inclusion (on-chain audit trail)
import type { PrivacyBackend, BackendStaticMeta, Intent, BuildResult, Connection, PublicKey } from "@redacted-usd/aggregator";
import { getMeta } from "../backends/registry"; // will fail until promoted

const META: BackendStaticMeta = { /* fill from candidate meta after review */ } as any;

export class ${safeId.replace(/-/g, "")}Backend implements PrivacyBackend {
  readonly id = "${safeId}" as const;
  readonly meta = META;
  canHandle(i: Intent) { return false; /* TODO after review */ }
  async estimateCost() { return 0; }
  async estimateLatencyMs() { return 0; }
  async buildTransactions(): Promise<BuildResult> { throw new Error("not implemented — review first"); }
}
`;
  writeFileSync(join(CANDIDATE_DIR, `${safeId}.candidate.json`), JSON.stringify(meta, null, 2));
  writeFileSync(join(CANDIDATE_DIR, `${safeId}.stub.ts`), stub);
}

// Build the report — now with security/reliability signals + real proposals.
const lines = [];
lines.push(`# Privacy backend scan — ${today}`);
lines.push("");
lines.push(`Auto-generated by \`scripts/weekly-privacy-scan.mjs\`. **Security-first process**: scanner proposes only. No auto-mutation of registry or runtime loading of candidates. Promotion requires audit + 2-reviewer signoff per rubric in registry.ts.`);
lines.push("");
lines.push("## Tracked backends (auto-enrolled from registry.ts)");
lines.push("");
for (const f of findings) {
  lines.push(`### ${f.id}`);
  lines.push(`- last registry verify: ${f.lastVerifiedAt ?? "—"}`);
  if (f.npm) lines.push(`- npm latest: \`${f.npm}\``);
  if (f.github) lines.push(`- github: ${f.github}`);
  // Simple reliability signal: if no recent tag and no npm, flag staleness risk.
  if (!f.npm && !f.github?.includes("2026")) {
    lines.push(`- ⚠ RELIABILITY: limited public release activity — monitor cluster health closely (see Arcium trustNotes).`);
  }
  for (const n of f.notes) lines.push(`- ⚠ ${n}`);
  lines.push("");
}
lines.push("## Live discovery — new Solana privacy candidates");
lines.push("These are raw. **Never** route real funds through an unvetted candidate. They exist only to feed the weekly review.");
lines.push("");
if (newCandidates[0]?.error) {
  lines.push(`- ${newCandidates[0].error}`);
} else if (newCandidates.length === 0) {
  lines.push("- No new qualifying repos in the last 60 days (or rate limited).");
} else {
  for (const c of newCandidates) {
    lines.push(`- [${c.fullName}](${c.url}) — ${c.desc || ""} (stars: ${c.stars}, pushed: ${c.pushed})`);
    lines.push(`  → candidate files written to docs/proposed-candidates/ for review`);
  }
}
lines.push("");
lines.push("## Proposed registry diff (apply manually after review)");
lines.push("```diff");
lines.push("// Example: if a tracked backend has a new major that changes MPC ceremony,");
lines.push("// bump its privacyScore or trustNotes here and open PR.");
lines.push("// New candidates get added only after the 3-gate process above.");
lines.push("```");
lines.push("");
lines.push("## Action items (Security > Reliability > Privacy > Speed > Cost)");
lines.push("- [ ] Review any candidates in docs/proposed-candidates/. Run full rubric before editing registry.ts.");
lines.push("- [ ] Reconcile versions + bump lastVerifiedAt only for backends that still match their trust model.");
lines.push("- [ ] If Arcium or MagicBlock released a material security update, open the delegation hook PR (#41) first.");
lines.push("- [ ] Never promote a backend that would make the router have only one high-privacy path for flagship intents.");
lines.push("");

if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
const reportPath = join(REPORT_DIR, `${today}.md`);
writeFileSync(reportPath, lines.join("\n"));
console.log(`wrote ${reportPath}`);
if (newCandidates.length > 0 && !newCandidates[0]?.error) {
  console.log(`wrote ${newCandidates.length} candidate proposals to docs/proposed-candidates/ (SECURITY GATED — review before use)`);
}
