# Mainnet Readiness Checklist — Redacted USD Privacy Aggregator

This document tracks what is required to run the full privacy aggregator (with Arcium + TEE + Light + Confidential Transfers) against real mainnet.

## Current Status (as of late May 2026)

| Area                        | Status      | Notes |
|----------------------------|-------------|-------|
| RPC                        | Config ready | Code defaults to mainnet, but local dev uses devnet |
| Private Vote (Arcium)      | In progress  | Config prepared. Run `arcium deploy --cluster mainnet` |
| Private Vote TEE           | Not deployed | Deploy together with Arcium private_vote if using TEE path |
| MagicBlock TEE Router      | Devnet only  | Mainnet router endpoint not yet configured |
| Light Protocol             | Ready        | Already live on mainnet (compression + confidential flows) |
| Token-2022 Confidential    | Ready        | Native Solana feature |
| Squads Multisig            | Ready        | Works on mainnet |
| Aggregator Library         | Ready + Mainnet Smarts | Auto priority fees + network detection + warnings when running on mainnet (see `packages/aggregator/src/utils/network.ts` and `aggregator.ts`) |
| Web Frontend Config        | Partially ready | `.env.mainnet.example` now exists |

## Required Steps to Go Mainnet

### 1. Deploy the Privacy Programs

```bash
# In private_vote/
anchor build
# Deploy private_vote and private_vote_tee to mainnet
# Record the two program IDs
```

### 2. Set Mainnet Environment Variables

Use `apps/web/.env.mainnet.example` as the template.

Critical variables:
- `NEXT_PUBLIC_RPC_URL` — Use a reliable mainnet RPC (Helius, QuickNode, etc.)
- `NEXT_PUBLIC_PRIVATE_VOTE_PROGRAM_ID`
- `NEXT_PUBLIC_PRIVATE_VOTE_TEE_PROGRAM_ID`
- `NEXT_PUBLIC_MAGIC_ROUTER_ENDPOINT` — Update once you have the real mainnet router
- `NEXT_PUBLIC_SQUADS_PROGRAM_ID` (rarely needed; defaults to the correct mainnet Squads v4)

### 3. MagicBlock TEE Mainnet Router

- Confirm the current mainnet router endpoint with MagicBlock.
- Test that `delegate_for_tee`, `cast_vote` (via router), and `finalize_and_commit` work on mainnet.
- Note: Mainnet ephemeral rollups may have different availability or requirements than devnet.

### 4. Arcium Mainnet (if using)

- Run `arcium deploy --cluster mainnet` for your MXE.
- Get the cluster offset and configure it in the Arcium backend if needed.
- Test MPC voting end-to-end on mainnet.

### 5. Light Protocol

- Already production on mainnet.
- Good for cheap compressed vault transfers and as a scaling layer.

### 6. Testing Recommendations (per your experience)

- Start with very small amounts.
- Test vault creation on mainnet first.
- Test a plain (non-private) transaction.
- Then test a private vault transfer using Light + Token-2022.
- Finally test the full private vote flow (Arcium and/or TEE).

## Recommended Testing Order (Mainnet)

1. Connect wallet + create a mainnet Squads multisig (or use an existing one).
2. Do a basic vault transfer (no privacy) to validate the UI + Squads integration.
3. Do a Light-compressed vault transfer.
4. Do a Token-2022 confidential transfer.
5. Test private vote creation + voting using Arcium (if deployed).
6. Test private vote creation + voting using TEE (if deployed + router working).

## Gotchas

- Mainnet RPC rate limits on the public endpoint are brutal — use a paid RPC.
- TEE vote transactions must be sent through the correct MagicBlock router (not a normal RPC).
- Arcium computations on mainnet have real costs and latency.
- Once real money is involved, every assumption about gas, accounts, and routing will be stress-tested.

## Next Actions

- [ ] Deploy both `private_vote` and `private_vote_tee` to mainnet
- [ ] Obtain and test a mainnet MagicBlock router endpoint
- [ ] Populate and test using `.env.mainnet.example`
- [ ] Add wallet connection + vault creation flow (UI work)
- [ ] End-to-end mainnet testing with small real transactions

---

**Goal**: When the UI is ready, we can immediately start real mainnet testing instead of being blocked by devnet-only configuration.
