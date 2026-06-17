# Mainnet Readiness Checklist — Redacted USD Privacy Aggregator

This document tracks what is required to run the privacy aggregator against real mainnet. Privacy is provided by **Umbra** (Arcium shielded balances); the public (plain Squads) route is the safe default.

## Current Status (as of June 2026)

| Area                        | Status      | Notes |
|----------------------------|-------------|-------|
| RPC                        | Config ready | Code defaults to mainnet, but local dev uses devnet |
| Umbra (Arcium)             | Live (RC)    | Shield uses exact base units; unshield reads the decrypted shielded balance. SDK is RC (5.0.0-rc.6); verify a tiny round-trip on mainnet first |
| Squads Multisig            | Ready        | Works on mainnet |
| Aggregator Library         | Ready + Mainnet Smarts | Auto priority fees + network detection + warnings when running on mainnet (see `packages/aggregator/src/utils/network.ts` and `aggregator.ts`) |
| Web Frontend Config        | Partially ready | `.env.mainnet.example` now exists |

## Required Steps to Go Mainnet

### 1. Set Mainnet Environment Variables

Use `apps/web/.env.mainnet.example` as the template.

Critical variables:
- `NEXT_PUBLIC_RPC_URL` — Use a reliable mainnet RPC (Helius, QuickNode, etc.)
- `NEXT_PUBLIC_SQUADS_PROGRAM_ID` (rarely needed; defaults to the correct mainnet Squads v4)

### 2. Umbra (Arcium)

- The privacy backend (shield public balance → encrypted token account → unshield).
- GATED: disabled in the UI (`shieldable=false`) until a shield→unshield round-trip
  is verified on devnet then with a tiny amount on mainnet, and the unshield amount
  is sourced from the SDK shielded balance (not the public ATA).

### 3. Testing Recommendations

- Start with very small amounts.
- Test vault creation on mainnet first.
- Test a plain (non-private) transaction.
- Privacy (Umbra) stays gated until its round-trip is verified — see step 2.

## Recommended Testing Order (Mainnet)

1. Connect wallet + create a mainnet Squads multisig (or use an existing one).
2. Do a basic vault transfer (no privacy) to validate the UI + Squads integration.
3. (When un-gated) verify an Umbra shield→unshield round-trip with a tiny amount.

## Gotchas

- Mainnet RPC rate limits on the public endpoint are brutal — use a paid RPC.
- Once real money is involved, every assumption about gas, accounts, and routing will be stress-tested.

## Next Actions

- [ ] Populate and test using `.env.mainnet.example`
- [ ] Add wallet connection + vault creation flow (UI work)
- [ ] End-to-end mainnet testing with small real transactions

---

**Goal**: When the UI is ready, we can immediately start real mainnet testing instead of being blocked by devnet-only configuration.
