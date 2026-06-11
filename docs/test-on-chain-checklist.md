# On-chain test checklist — Redacted v1

Running list of every flow that needs end-to-end verification on real chain
before we ship. Add new items as we build them. Tick each box once you've
manually run the flow and confirmed the on-chain effect matches expectation.

**Test environment recommendation:** devnet first with throwaway signers,
then mainnet with a small-value vault before declaring "verified".

---

## Settings → Setup

- [ ] Vault nonce shown matches `transactionIndex` on Solscan
- [ ] Program version section: "View program on Solscan" link opens the right account
- [ ] Members list shows every signer from the on-chain `members` array
- [ ] Each signer's permissions label matches the on-chain `permissions.mask`
- [ ] "Export as CSV" downloads a CSV containing every signer + permissions

## Settings → Setup → Manage signers (config tx)

- [ ] **Add signer** with valid Solana address → proposal #N created on chain
- [ ] **Add signer** with an address already in the multisig → blocked at client
- [ ] **Add signer** with invalid base58 → blocked at client
- [ ] **Add signer** → vote to threshold → **Execute** → on-chain `members` array contains the new address
- [ ] Newly added signer can now propose / vote / execute (depending on perms)
- [ ] **Remove signer** → proposal created
- [ ] **Remove signer** when `members - 1 < threshold` → button disabled, warning shown
- [ ] **Remove signer** → vote → Execute → on-chain `members` reflects removal
- [ ] Removed signer can no longer approve future proposals
- [ ] Memo field flows through to the proposal account's memo field

## Settings → Appearance

- [ ] Light/Dark toggle flips the entire app's surfaces + text colors
- [ ] Choice persists across hard refresh (localStorage `redacted-theme-mode`)
- [ ] Topbar, Settings, Transactions, Apps, Send / Receive dialogs all respect the mode
- [ ] No FOUC longer than ~200ms on first load after a mode change

## Settings → Notifications

- [ ] First toggle-on triggers browser permission prompt
- [ ] On grant → confirmation notification fires immediately
- [ ] On grant → toggle stays on after hard refresh (localStorage `redacted-notif-prefs`)
- [ ] On deny → warning alert shown, toggle disabled
- [ ] Switching active vault in topbar shows that vault's independent toggle state
- [ ] Tab open + toggle on + new proposal arrives → notification fires (requires wiring to a real event source — see "Wiring left to do" below)
- [ ] Toggle off → no notifications fire even if events occur

## Settings → Modules → Spending limits

- [ ] Empty state ("No spending limits set on this vault.") shown when none exist
- [ ] Existing limits load from chain
- [ ] **Helius V2 fallback** path triggers when legacy `getProgramAccounts` returns the "account index service overloaded" error — confirm by simulating or by hitting a vault with many limits
- [ ] **Add spending limit** with Native SOL preset → proposal created
- [ ] **Add spending limit** with USDC preset → proposal created
- [ ] **Add spending limit** with custom mint + decimals → proposal created
- [ ] **Add spending limit** with multiple members → all members appear in the on-chain `members` array of the limit
- [ ] **Add spending limit** with no destinations (any) → on-chain `destinations` array is empty
- [ ] **Add spending limit** with one or more destinations → matches on-chain
- [ ] Each period option (Daily / Weekly / Monthly / One-time) maps to the correct on-chain `Period` enum value
- [ ] Amount in user units maps to correct base units on chain (decimals applied right)
- [ ] After execute → spending limit account exists at the derived PDA
- [ ] After execute → row appears in the Modules tab list
- [ ] **`spendingLimitUse`** path: a member with a valid limit can actually transfer within bounds without a full multisig vote (not yet wired in UI; verify via SDK call)
- [ ] **Remove spending limit** → proposal created
- [ ] **Remove spending limit** → vote → execute → account closed on chain, row disappears
- [ ] Remaining-accounts handling: `configTransactionExecute` receives the correct `spendingLimits` PDA array for Add and Remove

## Settings → Modules → Time lock

- [ ] Displayed value matches `multisig.timeLock`
- [ ] All preset values (Instant, 1h, 24h, 7d, 14d, 28d) map to the correct seconds
- [ ] Custom seconds input writes the exact integer to chain
- [ ] **Change time lock** → proposal created
- [ ] **Change time lock** → vote → execute → `multisig.timeLock` updates
- [ ] With time lock > 0, a subsequent proposal cannot execute before the delay elapses (Squads enforces — confirm at the chain level)
- [ ] Setting time lock to 0 returns to instant execution

## Privacy toggle (Private / Public)

- [ ] The Private/Public toggle renders on each Assets row and on the Swap flow
- [ ] Toggling shows "Private" (Light) ↔ "Public" (Squads) with the correct tooltip
- [ ] No "Privacy" tab in Settings (privacy is per-transaction only)
- [ ] **Routing test:** a Public transfer routes through plain Squads (visible on-chain)
- [ ] **Routing test:** a Private transfer routes through Light Protocol
- [ ] **When Helius shielding ships:** Private hides amounts/counterparties; relabel the toggle accordingly

## Settings → Modules → Program modules

- [ ] Placeholder copy renders correctly (v2 roadmap)
- [ ] Will need real testing once Recovery / Arcium / Light / Token-2022 modules ship

## Transactions tab

- [ ] **Kind chip** correctly labels vault txs as "Vault tx"
- [ ] **Kind chip** correctly labels config txs as "Config" (purple outlined)
- [ ] **Kind chip** correctly labels batch txs as "Batch"
- [ ] Status chip + Kind chip both render without layout shift
- [ ] **Execute on a vault tx** → uses `vaultTransactionExecute`, succeeds
- [ ] **Execute on a config tx (Set time lock)** → uses `configTransactionExecute`, succeeds
- [ ] **Execute on a config tx (Add signer)** → succeeds, signers updated
- [ ] **Execute on a config tx (Remove signer)** → succeeds, signers updated
- [ ] **Execute on a config tx (Add spending limit)** → spending-limit PDA derived from `AddSpendingLimit.createKey` is correctly included in remaining accounts
- [ ] **Execute on a config tx (Remove spending limit)** → existing PDA correctly included in remaining accounts
- [ ] **Execute on a batch tx** → throws "not supported yet" with clean error UI
- [ ] **Execute on an unknown account** → error includes the transactionPda for debug
- [ ] Approve / Reject paths still work post-refactor (regression)
- [ ] Auto-refresh after execute reflects new status

## Apps tab + browser extension

- [ ] Extension install banner visible when extension not loaded
- [ ] After loading unpacked from `/Users/anne/private-safe/extension/` → banner replaced by green "Redacted extension active" chip
- [ ] Active vault syncs from React app → extension `chrome.storage.local` on vault switch
- [ ] Extension service worker is alive (`chrome://extensions` shows no errors)
- [ ] On Jupiter (and Drift, Kamino, Orca, Raydium, Meteora): "Redacted Multisig" appears in the connect-wallet picker
- [ ] Selecting "Redacted Multisig" connects to the active vault address
- [ ] Clicking Swap on Jupiter → extension intercepts `signTransaction` → opens / focuses Redacted tab → proposal created
- [ ] Proposal appears in Transactions tab with the right kind
- [ ] Proposal vote + execute completes the swap on chain
- [ ] Phantom is NOT replaced as `window.solana` (legacy provider only injects when no Phantom present)
- [ ] Extension popup shows active vault address
- [ ] Clicking the extension toolbar icon focuses an existing Redacted tab, or opens a new one if none

## Send / Receive / Vault management (regression after refactor)

- [ ] Create vault flow works
- [ ] Send SOL → proposal → vote → execute → balance changes
- [ ] Send SPL token → proposal → vote → execute → balance changes
- [ ] Receive dialog shows correct address + QR
- [ ] Topbar vault selector switches active vault; all tabs (Settings, Transactions, Apps) update
- [ ] Personal vs Vault mode toggle still works

## Settings → Environment

- [ ] Default values shown in caption under each field match the running app's actual defaults
- [ ] Saving a Solana RPC URL → localStorage key `redacted-env-rpc-url` populated
- [ ] After refresh, `<ConnectionProvider endpoint={RPC_URL}>` uses the override (verify a network call hits the new endpoint)
- [ ] Empty input → save → localStorage key removed, default applies on refresh
- [ ] Save button is disabled until a field actually changes (dirty detection)
- [ ] "Saved at …" timestamp + "refresh to apply" hint shows after save
- [ ] **Reset to defaults** wipes every override and shows the same timestamp
- [ ] **Currently in use** card shows the values the page is currently running with
- [ ] MagicRouter override applies to TEE vote routing (verify by switching to a custom endpoint and watching the TEE submit path)
- [ ] Squads program ID override flows through to `loadMultisig`, PDA derivation, and "View program" link in Setup tab
- [ ] Private vote (TEE / Arcium) program ID overrides honored by `getProgram()` in respective lib helpers
- [ ] Imported settings via Data tab do NOT include env overrides (they're separate scope)

## Settings → Data

- [ ] Data export shows current counts (vaults, address book, custom dApps, per-wallet selections, watchlist customizations, total keys)
- [ ] Download button writes a file matching `redacted-YYYY-MM-DD.json`
- [ ] Exported JSON has `schema: "redacted-export"`, `schemaVersion: 1`, ISO `exportedAt`, and a `data` object
- [ ] Exported `data` contains every Redacted-owned localStorage key (singleton + prefixed)
- [ ] No keys/signatures/session tokens in the export (verify by inspecting file)
- [ ] Drag-and-drop a JSON file → import runs
- [ ] "Choose a file" picker → import runs
- [ ] Non-Redacted JSON file → import refuses with clear error
- [ ] Newer schema version → import refuses
- [ ] Merge mode → existing keys preserved, only new keys written
- [ ] Replace mode → all Redacted keys cleared first, then import written
- [ ] Import result shows applied / skipped / removed counts
- [ ] Whitelist enforced: keys not owned by Redacted schema are silently skipped (defense against malicious files)
- [ ] After import, refresh shows imported vaults / theme / watchlist / privacy prefs reflected

## API

- [ ] `GET /api/v1/vaults/[address]/transactions` includes the new `kind` and `transactionPda` fields per row
- [ ] Existing consumers (if any) still parse the response

## Trading books (Jarvis side)

- [ ] **B18 / B19 / B20** off-hours behavior: `decisions.jsonl` should contain `skip_rth` entries for xyz: tickers during US off-hours (today's RTH gate fix)
- [ ] **B21** entries fire on funding-extreme + whale-flow confluence; 4 templates each appear at least once over the 7-day window
- [ ] **B22** entries fire on L2 carry/vol + SHORT confluence
- [ ] After 7 days: real per-book equity matches what `/books` shows in TG (no phantom xyz: contamination)
- [ ] **`rescore-phantom.mjs`** run on B16/B17/B18/B19/B20/B21/B22 shows ≤5% xyz: phantom rate for active books (the RTH gate is doing its job)
- [ ] `xyz-meta-bus` heartbeat shows `consecutiveFails: 0` for both `main` and `xyz` endpoints

## Helius RPC behavior

- [ ] Vaults with many spending limits load without "account index service overloaded" error
- [ ] V2 fallback paginates correctly (verify >1 page if any vault has >1000 spending limits)
- [ ] Existing `withRetry` wrapper still kicks in for transient 429s on other endpoints

---

## Privacy router (Phase 2 — Vault creation honors voting pref)

- [ ] Settings → Privacy → "Voting on proposals" pick is mirrored to the user's account-wide default
- [ ] Open Create Vault → routing preview's winner matches the user's voting pref (e.g. MagicBlock TEE if that was picked)
- [ ] Create a vault with TEE pref → resulting vault has the TEE wrapper PDA as a member
- [ ] After create, `loadMultisig(addr)` returns a multisig where `isTeeVoteWrapped(members, addr)` is true
- [ ] Settings → Setup → "Voting mode" section on a TEE-created vault shows "Encrypted (MagicBlock TEE)"
- [ ] Settings → Setup → "Voting mode" on a standard vault shows "Public (standard Squads)"
- [ ] Settings → Setup → "Voting mode" on an Arcium-wrapped vault shows "Encrypted (Arcium MPC)"
- [ ] Transactions tab on a TEE-wrapped vault: queue proposals show "Private vote (TEE)" button instead of "Approve"
- [ ] Private vote panel: init → delegate → cast → finalize → on-chain Squads proposalApprove via CPI

## Earn

### Tabs
- [ ] `/earn` page renders two top tabs: **Spot & Staking** and **Perps**
- [ ] Tab indicator uses Redacted purple, underline style

- [ ] `/earn` page renders two cards: USDC and SOL
- [ ] Each card shows the active platform's APY large + name + risk badge + blurb
- [ ] Week label at bottom (`Week of YYYY-WNN`) reflects current ISO week
- [ ] **SOL bucket** (LST flow, in-app):
  - [ ] Enter amount → debounced Jupiter quote (SOL → jitoSOL by default)
  - [ ] Estimated LST output shown below amount
  - [ ] Personal mode → wallet signs → confirms on chain
  - [ ] Vault mode → Squads proposal created, appears in Transactions tab
  - [ ] Approve + execute → SOL leaves vault, LST arrives at vault PDA
- [ ] **USDC bucket** (external):
  - [ ] "Deposit at Kamino Lend" button opens external URL in new tab
  - [ ] No funds touched until user completes flow on the external platform
- [ ] "Show all USDC/SOL platforms" toggle expands the full list with APYs and risk badges
- [ ] Active platform highlighted with purple border in the expanded list
- [ ] Changing `active: true` in `lib/earn-platforms.ts` flips the headline pick on next reload
- [ ] Risk badges render correctly (Audited / Caution / High risk)
- [ ] **Custody honesty**: confirm in code that Redacted never escrows funds — SOL flow routes user → Jupiter → LST stake pool/DEX; USDC flow is external link only

### Perps tab
- [ ] Active card shows "Perp Liquidity" header + JLP at ~42% with Caution badge
- [ ] Deposit input symbol shows "USDC" (not "PERPS")
- [ ] Personal mode deposit → Jupiter swap USDC → JLP fires on chain, JLP arrives at wallet
- [ ] Vault mode deposit → Squads proposal wraps the JLP swap; appears in Transactions tab
- [ ] Sibling card "Automated perp strategies" renders with "Soon" chip
- [ ] Automation card "Track the books live (TG)" button opens jarvis TG bot
- [ ] "Show all perp platforms" toggle expands JLP / Flash / Adrastea / Drift IF rows with risk badges

## Bridge (deBridge DLN)

### Outbound (Solana → other chain)
- [ ] `/bridge` route renders with tabs: "Solana → other chain" + "Other chain → Solana"
- [ ] Source token picker shows USDC / USDT / SOL presets
- [ ] Destination chain picker shows Ethereum / Base / Arbitrum / Optimism / Polygon / BSC / Avalanche
- [ ] USDC contract addresses match Circle's official mainnet list per destination
- [ ] Entering an amount fetches a quote via `dln.debridge.finance/v1.0/dln/order/quote`
- [ ] Quote shows estimated USDC received on destination + rate + fulfillment delay
- [ ] Privacy chip reflects user's "Token transfers" Privacy tab pick (Solana-side privacy applies to the source funds)
- [ ] Recipient field accepts an EVM address
- [ ] **Personal mode**: clicking "Bridge to X" → wallet signs deBridge's Solana tx → confirms → USDC arrives on dst chain within ~30-90s
- [ ] **Vault mode**: clicking "Propose bridge" → Squads proposal wraps deBridge's inner instructions
- [ ] Created proposal shows up in Transactions tab as a Vault tx
- [ ] Approve + execute on the proposal → bridge fires → USDC arrives on dst chain
- [ ] No referrer fee (Redacted takes 0% — verify `affiliateFeePercent=0` in the request)

### Inbound (other chain → Solana)
- [ ] Inbound tab shows the active vault/wallet address as the Solana recipient
- [ ] Copy address button works
- [ ] Open deBridge button generates a URL with prefilled `inputChain`, `outputChain=7565164`, `outputCurrency` (USDC), `recipient`
- [ ] After deBridge inbound, funds arrive at the vault/wallet within ~30-90s

## Swap (Jupiter)

- [ ] `/swap` route renders
- [ ] Token picker shows SOL / USDC / USDT / JUP / BONK / HYPE presets
- [ ] Custom mint + decimals input lets user add any Solana token
- [ ] Entering an amount fetches a quote via `lite-api.jup.ag/swap/v1/quote` within ~600ms (debounced)
- [ ] Quote panel shows rate, price impact, route (DEX list), min received after slippage
- [ ] Privacy backend chip reflects the user's "dApp activity" Privacy tab pick for the active vault
- [ ] Slippage presets (0.1% / 0.5% / 1% / 3%) + custom % both work
- [ ] Flip button (↕) swaps in/out tokens
- [ ] **Personal mode**: clicking Swap → wallet signs → Jupiter swap-tx confirms on chain (verify via Solscan link)
- [ ] **Vault mode**: clicking Propose swap → Squads proposal created wrapping Jupiter's instructions + LUTs
- [ ] Created proposal shows up in Transactions tab as a Vault tx
- [ ] Approve + execute on the proposal → swap fills on chain
- [ ] **Vault tx size limit**: complex Jupiter routes (>1280 bytes inner) may exceed Squads vault tx limit — verify error UI is clear on those
- [ ] Privacy tab change to "dApp activity" pick → swap page chip updates next visit
- [ ] **Routing test (v2)**: once Light SPL / Token-2022 confidential ship, swap proceeds route through user's pick instead of plain Squads

## Privacy router (Phase 1 — Send flow honors prefs)

- [ ] Send dialog Routing preview shows the backend matching the user's Settings → Privacy → "Token transfers" pick
- [ ] Picking `Light Protocol` for transfers → Routing preview shows Light
- [ ] Picking `Squads-plain` for transfers → Routing preview shows Squads-plain
- [ ] Picking `Token-2022 Confidential` for a native-SOL transfer → no winner → falls back to balanced policy (Send doesn't brick)
- [ ] Switching active vault → the new vault's preference loads
- [ ] On-chain SOL Send through Light path → tx confirms, recipient receives funds (identical effect to plain SOL transfer until Light SPL ships, but routed honestly through Light backend)
- [ ] Routing decision's `routedVia` value is visible in the success path

## Wiring left to do (not yet built — add to next session)

- Notification firing: connect `fireVaultNotification()` to the transactions watcher so a real notification fires when a new proposal lands. Currently only the confirmation notification on toggle-on actually fires.
- `spendingLimitUse` UI: surface a "Spend within limit" button somewhere so members can exercise their limit without going through full multisig.
- Batch transaction execution path.
- Recovery program + UI (Security tab).
- Arcium / Light / Token-2022 program modules (Modules tab → Program modules section).
