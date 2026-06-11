# Private Safe

The most private multisig wallet possible for Solana.

- **UX**: Safe-style (Overview, Assets, Transactions, Address Book, Apps, Settings, Swap, Bridge, Earn)
- **Backend**: Squads v4 multisig
- **Privacy**: Light Protocol (Helius-aligned) — ZK compression + shielded transfers, with a public (plain Squads) route as the safe default
- **Fees**: zero, forever — enforced by `pnpm check:no-fees`

## Status

Phase 1 — scaffolding + backend mainnet preparation.

**Mainnet readiness**: See [docs/mainnet-readiness.md](docs/mainnet-readiness.md). The Squads multisig core and the Light Protocol shielding path are wired for mainnet.

See [project memory](../.claude/projects/-Users-anne/memory/project_private_safe.md) for the broader plan.

## Dev

```bash
pnpm install
pnpm dev          # apps/web on http://localhost:3000
pnpm check:no-fees
pnpm typecheck
```
