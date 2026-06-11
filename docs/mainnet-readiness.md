# Mainnet Readiness Checklist — Redacted USD Privacy Aggregator

This document tracks what is required to run the privacy aggregator against real mainnet. Privacy is provided by **Light Protocol** (Helius-aligned); the public (plain Squads) route is the safe default.

## Current Status (as of June 2026)

| Area                        | Status      | Notes |
|----------------------------|-------------|-------|
| RPC                        | Config ready | Code defaults to mainnet, but local dev uses devnet |
| Light Protocol             | Ready        | Already live on mainnet (compression + shielded flows) |
| Squads Multisig            | Ready        | Works on mainnet |
| Aggregator Library         | Ready + Mainnet Smarts | Auto priority fees + network detection + warnings when running on mainnet (see `packages/aggregator/src/utils/network.ts` and `aggregator.ts`) |
| Web Frontend Config        | Partially ready | `.env.mainnet.example` now exists |

## Required Steps to Go Mainnet

### 1. Set Mainnet Environment Variables

Use `apps/web/.env.mainnet.example` as the template.

Critical variables:
- `NEXT_PUBLIC_RPC_URL` — Use a reliable mainnet RPC (Helius, QuickNode, etc.)
- `NEXT_PUBLIC_SQUADS_PROGRAM_ID` (rarely needed; defaults to the correct mainnet Squads v4)

### 2. Light Protocol

- Already production on mainnet.
- Good for cheap compressed vault transfers and as a shielding layer.

### 3. Testing Recommendations

- Start with very small amounts.
- Test vault creation on mainnet first.
- Test a plain (non-private) transaction.
- Then test a Light-compressed (shielded) vault transfer.

## Recommended Testing Order (Mainnet)

1. Connect wallet + create a mainnet Squads multisig (or use an existing one).
2. Do a basic vault transfer (no privacy) to validate the UI + Squads integration.
3. Do a Light-compressed vault transfer.

## Gotchas

- Mainnet RPC rate limits on the public endpoint are brutal — use a paid RPC.
- Once real money is involved, every assumption about gas, accounts, and routing will be stress-tested.

## Next Actions

- [ ] Populate and test using `.env.mainnet.example`
- [ ] Add wallet connection + vault creation flow (UI work)
- [ ] End-to-end mainnet testing with small real transactions

---

**Goal**: When the UI is ready, we can immediately start real mainnet testing instead of being blocked by devnet-only configuration.
