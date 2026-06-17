# Private Safe (Redacted USD)

A privacy-aware, non-custodial multisig wallet for Solana. Self-hostable, no tracking.

- **UX**: Safe-style (Overview, Assets, Transactions, Address Book, Apps, Settings, Swap, Bridge, Earn)
- **Backend**: Squads v4 multisig
- **Privacy**: Umbra (Arcium shielded balances) — shield a public balance into an
  encrypted token account (amounts + balances hidden, sender/graph unlinkable),
  with a public (plain Squads) route as the safe default
- **Integrations**: Jupiter (swaps + pricing), deBridge (cross-chain bridge)
- **Fees**: a small, capped, transparent infrastructure fee — **0.1% of value,
  capped at $0.99** per swap/bridge/transfer, plus a flat **$0.99** for vault
  creation and signer add/remove. Paid in SOL to a single public project wallet
  to fund hosting. Enforced + bounded in code by `pnpm check:fees` (pins the
  wallet, caps, and rate so they can't be silently changed). See
  [apps/web/lib/fees.ts](apps/web/lib/fees.ts).

## Status

Phase 1 — scaffolding + mainnet preparation. The Squads multisig core, swap, and
bridge are wired for mainnet. **Umbra privacy is wired and live but runs on a
release-candidate SDK (`@umbra-privacy/sdk` 5.0.0-rc.x)** — test a tiny
shield → unshield round-trip before moving real size. See
[docs/mainnet-readiness.md](docs/mainnet-readiness.md).

> Early-stage software handling real funds. Use small amounts first.

## Security

- App-layer CSP + HSTS/XFO/nosniff headers; `frame-ancestors 'none'` to block
  clickjacking of the signing UI (gated in CI by `pnpm check:csp`).
- Fee integrity gate (`pnpm check:fees`), dependency audit, and typecheck run in
  CI (`.github/workflows/ci.yml`) and via a pre-commit hook.
- See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Dev

```bash
pnpm install
pnpm dev          # apps/web on http://localhost:3000
pnpm verify       # check:fees + typecheck + dependency audit
pnpm build
```
