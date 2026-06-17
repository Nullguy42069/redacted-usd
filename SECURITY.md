# Security Policy

Private Safe (Redacted USD) is a non-custodial wallet that handles real funds.
Security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately via one of:

- GitHub: open a [private security advisory](https://github.com/Nullguy42069/redacted-usd/security/advisories/new)
- Email: `hello@redacted-usd.xyz`

Include: a description, affected file(s)/version, reproduction steps or a PoC, and
the impact you believe it has. We aim to acknowledge within 72 hours.

Please give us a reasonable window to ship a fix before public disclosure.

## Scope

In scope:

- The web app (`apps/web`), the aggregator (`packages/aggregator`), the browser
  extension (`extension/`), and the security/CI scripts (`scripts/`).
- Anything that can drain funds, leak keys, bypass multisig approval, forge a
  transaction the user signs, or weaken the fee/privacy integrity guards.

Out of scope:

- Third-party programs/SDKs we integrate (Squads, Umbra/Arcium, Jupiter,
  deBridge) — report those upstream — though we want to hear if we *use* them
  unsafely.
- Funds lost to user error, phishing outside this codebase, or RPC/provider
  outages.
- The known upstream-unpatched advisories tracked in `pnpm-workspace.yaml`
  (`elliptic`, `bigint-buffer`) where no fixed release exists yet.

## Good to know

- Keys never leave the browser; signing is via the wallet adapter.
- Privacy (Umbra) runs on a release-candidate SDK — see the README caveat.
- Fees are capped and pinned in code; `pnpm check:fees` fails CI if the wallet,
  rate, or caps are altered.
