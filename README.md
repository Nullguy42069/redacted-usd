# Private Safe

The most private multisig wallet possible for Solana.

- **UX**: Safe-style (Overview, Assets, Transactions, Address Book, Apps, Settings, Swap, Bridge, Earn)
- **Backend**: Squads v4 multisig
- **Privacy** (phased): Arcium MPC + MagicBlock TEE for private voting, Light Protocol (ZK compression + confidential transfers) as high-performance layer, Token-2022 confidential transfers
- **Fees**: zero, forever — enforced by `pnpm check:no-fees`

## Status

Phase 1 — scaffolding + backend mainnet preparation.

**Mainnet readiness**: See [docs/mainnet-readiness.md](docs/mainnet-readiness.md). The aggregator backends are now wired for mainnet (TEE lifecycle complete, full Light Protocol backend). Programs still need to be deployed to mainnet before real testing.

See [project memory](../.claude/projects/-Users-anne/memory/project_private_safe.md) for the broader plan.

## Dev

```bash
pnpm install
pnpm dev          # apps/web on http://localhost:3000
pnpm check:no-fees
pnpm typecheck
```
