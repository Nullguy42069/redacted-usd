"use client";
import {
  Box, Card, CardContent, Typography, Stack, Divider, Link as MuiLink, Chip,
} from "@mui/material";

// ─── Docs page ──────────────────────────────────────────────────────────────
// Single long-scroll doc with a sticky table of contents on the side. Each
// section has an `id` for deep-linking from the TOC, future search, or
// shareable URLs.

const SECTIONS = [
  { id: "what-is",        title: "What is Redacted" },
  { id: "getting-started",title: "Getting started" },
  { id: "modes",          title: "Wallet vs Vault mode" },
  { id: "multisig",       title: "How multisig works" },
  { id: "send-receive",   title: "Send & Receive" },
  { id: "swap",           title: "Swap" },
  { id: "bridge",         title: "Bridge" },
  { id: "earn",           title: "Earn" },
  { id: "perps",          title: "Perps" },
  { id: "privacy",        title: "Privacy" },
  { id: "extension",      title: "Browser extension" },
  { id: "settings",       title: "Settings" },
  { id: "troubleshooting",title: "Troubleshooting" },
  { id: "security",       title: "Security model" },
  { id: "support",        title: "Support" },
] as const;

export default function HelpPage() {
  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 1 }}>Docs</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        Everything Redacted does, in plain text. Search-friendly anchors on every section.
      </Typography>

      <Box
        sx={{
          maxWidth: 1180,
          mx: "auto",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "220px 1fr" },
          gap: 3,
          alignItems: "start",
        }}
      >
        {/* TOC */}
        <Box
          sx={{
            position: { md: "sticky" },
            top: { md: 20 },
            p: 1.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}
          >
            On this page
          </Typography>
          <Stack spacing={0.5}>
            {SECTIONS.map((s) => (
              <MuiLink
                key={s.id}
                href={`#${s.id}`}
                underline="none"
                sx={{
                  color: "text.secondary",
                  fontSize: 13,
                  py: 0.5,
                  px: 1,
                  borderRadius: 0.5,
                  "&:hover": { color: "primary.main", bgcolor: "rgba(124,58,237,0.06)" },
                }}
              >
                {s.title}
              </MuiLink>
            ))}
          </Stack>
        </Box>

        {/* Body */}
        <Stack spacing={2.5}>
          <Section id="what-is" title="What is Redacted">
            <Para>
              Redacted is a privacy-aware multisig vault on Solana. You keep self-custody. The site adds the surfaces you actually need: send, receive, swap, bridge, yield, automated perps trading — each with a one-tap Private/Public toggle.
            </Para>
            <Para>
              Two design constraints shape everything:
            </Para>
            <Bullets>
              <li><b>Your keys, your call.</b> Redacted never custodies funds. Multisig vaults are Squads-style on Solana — every transaction is a proposal your signers vote on.</li>
              <li><b>Privacy is a toggle.</b> Every transfer and swap has a Private/Public switch. <b>Private</b> routes through Light Protocol — Helius-aligned, cheap and fast via ZK compression, with full shielding rolling out alongside Helius&apos;s privacy layer. <b>Public</b> is a standard Squads vault.</li>
            </Bullets>
            <Para>
              Redacted takes no fee on swaps, bridges, or routing. The only fee in the system is on Perps vault profits (10%, high-water mark) — and only when those vaults open for deposit.
            </Para>
          </Section>

          <Section id="getting-started" title="Getting started">
            <NumberedSteps
              items={[
                <>Click <Code>Connect Wallet</Code> in the top right. Phantom, Solflare, Backpack, Brave, Ledger, Trezor all work — anything Wallet Standard.</>,
                <>The first time a wallet connects, it lands in <b>Wallet</b> mode showing only your personal address. To use multisig features, switch to <b>Vault</b> mode at the top.</>,
                <>If you have no vault yet, hit the <Code>+</Code> button on the topbar to create one. Pick members (1-8 Solana addresses) and a threshold (M-of-N approvals).</>,
                <>Your new vault auto-bookmarks and becomes active. You can add more later, swap between them from the topbar dropdown.</>,
              ]}
            />
          </Section>

          <Section id="modes" title="Wallet vs Vault mode">
            <Para>
              The toggle in the topbar switches the entire app between two contexts:
            </Para>
            <KvList
              items={[
                ["Wallet mode", "Your personal Solana address. Direct signing, no proposals. EVM bridging is available here. Use for solo activity."],
                ["Vault mode", "The multisig vault PDA. Every transaction becomes a proposal that needs threshold approvals before executing. EVM bridging is disabled — Solana multisigs can't sign EVM transactions."],
              ]}
            />
            <Para>
              The mode is remembered per-wallet. Switch wallets and you'll see that wallet's last-used mode + last-selected vault.
            </Para>
          </Section>

          <Section id="multisig" title="How multisig works">
            <Para>
              A vault has <b>members</b> (signer addresses), each with a permissions bitmask:
            </Para>
            <KvList
              items={[
                ["Initiate", "Create proposals."],
                ["Vote", "Approve or reject proposals."],
                ["Execute", "Push approved proposals on chain."],
              ]}
            />
            <Para>
              Threshold M-of-N: a proposal needs M approvals out of N members before any signer can execute it. Most teams use 2-of-3 or 3-of-5.
            </Para>
            <Para>
              <b>Transaction flow:</b>
            </Para>
            <Bullets>
              <li>Someone with Initiate creates a proposal (Send, Swap, Bridge, Add Signer, etc.). The creator usually auto-approves at proposal time.</li>
              <li>Other members visit the Transactions tab, see the proposal, and Approve or Reject.</li>
              <li>Once approvals ≥ threshold, anyone with Execute can run it on chain.</li>
            </Bullets>
            <Para>
              Settings → Modules → Time lock adds a global delay between approval and execution. Spending limits let specific signers move bounded amounts without a full vote.
            </Para>
          </Section>

          <Section id="send-receive" title="Send & Receive">
            <Para>
              <b>Send</b> opens a dialog: recipient address, amount, optional memo. In Wallet mode the tx fires immediately. In Vault mode a proposal is created — vote in the Transactions tab to execute.
            </Para>
            <Para>
              The Send flow has the <b>Private/Public</b> toggle. <b>Private</b> routes through Light Protocol (Helius-aligned ZK compression today; full shielding rolling out with Helius). <b>Public</b> is a standard Squads transfer — fully visible on-chain.
            </Para>
            <Para>
              <b>Receive</b> shows your active wallet or vault address with a QR code. Vault addresses are PDAs — fully receivable just like a regular wallet.
            </Para>
          </Section>

          <Section id="swap" title="Swap">
            <Para>
              Token swaps on Solana, best price across every DEX. Pick input + output tokens (presets for SOL, USDC, USDT, JUP, BONK, HYPE, or paste any mint + decimals). Slippage presets at 0.1% / 0.5% / 1% / 3% with custom override.
            </Para>
            <Para>
              The quote panel shows the rate, price impact (warns at &gt;1%), the routed DEXes, and the minimum received after slippage.
            </Para>
            <Para>
              <b>Wallet mode:</b> click Swap → wallet signs → confirmed on chain. <b>Vault mode:</b> click Propose swap → the inner instructions are wrapped in a Squads proposal → vote and execute.
            </Para>
            <Para>
              Redacted takes no fee. The only costs are standard Solana fees + the swap route's own DEX fees.
            </Para>
          </Section>

          <Section id="bridge" title="Bridge">
            <Para>
              Cross-chain bridging. <b>You pay</b> (source chain + token) on top, <b>You receive</b> (destination chain + token) below. Click either chip to open the chain + token picker — 8 chains supported (Solana, Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche).
            </Para>
            <Para>
              <b>Solana source (Wallet or Vault):</b> Redacted builds the bridge transaction in-app. Wallet mode signs directly. Vault mode wraps the bridge's instructions in a Squads proposal.
            </Para>
            <Para>
              <b>EVM source:</b> Wallet mode only — a Solana multisig can't sign EVM transactions. An "EVM connect wallet" pill appears beneath the Solana wallet pill in the topbar. Connect MetaMask (or any EIP-1193 wallet) → the recipient address field auto-fills with your EVM address.
            </Para>
            <Para>
              The <b>Recipient on X</b> field is always visible for cross-VM bridges (SVM ↔ EVM). It defaults to your active wallet on the destination chain — paste a different address to send elsewhere. Same-VM bridges (EVM → EVM) keep the optional "Send to another address" checkbox.
            </Para>
          </Section>

          <Section id="earn" title="Earn">
            <Para>
              Three cards, picked weekly by a real human looking at on-chain yields:
            </Para>
            <KvList
              items={[
                ["USDC", "Top stable-lending pick. Today Kamino Lend, ~8.4%. Deep-link to the platform — you complete the deposit there, no custody by Redacted."],
                ["SOL", "Top liquid-staking pick. Today Jito jitoSOL, ~7.9%. In-app deposit via Jupiter swap (routes through direct stake when cheaper, DEX when not). LST tokens land in your wallet or vault."],
                ["Perp Liquidity", "Top perp LP pick. Today JLP at ~42%. In-app deposit (USDC → JLP via Jupiter). Caution badge — JLP value tracks a SOL/ETH/BTC/USDC/USDT basket; vol-exposed."],
              ]}
            />
            <Para>
              The "Show all platforms" toggle on each card expands the full registry with APYs and risk badges. Active pick is highlighted with the purple border. Picks refresh every Monday — week stamp at the bottom of the page tracks freshness.
            </Para>
          </Section>

          <Section id="perps" title="Perps">
            <Para>
              Automated trading strategies running today on Hyperliquid as paper books. When Percolator launches on Solana, each book becomes a vault you can deposit into:
            </Para>
            <Bullets>
              <li><b>Your share</b> is pro-rata of total deposits.</li>
              <li><b>Daily P&amp;L</b> is distributed to the vault pro-rata.</li>
              <li><b>Management fee:</b> 10% of new profits.</li>
              <li><b>High-water mark:</b> fee only charged on new gains above your previous peak. If a vault goes down then back to even, you owe no fee.</li>
              <li><b>Withdraw any time.</b> No lockup, no exit fee.</li>
            </Bullets>
            <Para>
              The captain card on top is <b>Jarvis</b> — the strategy-of-strategies allocator that rotates capital across the books that are working in the current regime. Below Jarvis is a grid of individual books with live stats: deposits, lifetime return, last-1h delta, lifetime trade count + WR, today's net. Cards re-sort hourly so whichever book is doing best in the last hour bubbles to the top.
            </Para>
            <Para>
              All numbers shown are phantom-fill audited. Books that traded synthetic equity tickers (xyz: prefix on HL) were audited for fill realism; the displayed returns are post-strip.
            </Para>
          </Section>

          <Section id="privacy" title="Privacy">
            <Para>
              Privacy is one toggle, not a settings page. Every transfer and swap has a <b>Private / Public</b> switch:
            </Para>
            <KvList
              items={[
                ["Private — Light Protocol", "Helius-aligned (the same vendor as our RPC), so it's cheap and fast via ZK compression. Today that means dramatically cheaper transactions; full shielding (hiding amounts and counterparties) rolls out with Helius's privacy layer. We bet on one protocol and do it well."],
                ["Public — Squads", "Standard Squads multisig. Everything on chain, no privacy overhead, fastest path. The safe default."],
              ]}
            />
            <Para>
              That&apos;s the whole model: pick Private or Public per transaction. No per-activity backend matrix, no protocol to choose — Light handles privacy, Squads handles public.
            </Para>
          </Section>

          <Section id="extension" title="Browser extension">
            <Para>
              The Redacted browser extension makes any Solana dApp connect to your vault. On Jupiter, Drift, Kamino, etc., "Redacted Multisig" appears in the connect-wallet picker right next to Phantom. Sign in any dApp → the transaction routes back to Redacted as a proposal for your vault to vote on.
            </Para>
            <Para>
              Install: open the Apps tab → click <b>Download Extension</b> → unzip → <Code>chrome://extensions</Code> → enable Developer mode → Load unpacked → pick the unzipped folder. Once loaded, the install banner on the Apps page is replaced by a green "Extension active" chip.
            </Para>
            <Para>
              Vault selection syncs from Redacted → extension storage automatically. Change the active vault on Redacted and any open dApp tab updates to that vault's address.
            </Para>
            <Para>
              Web Store submission is in progress — once approved, install will be one click instead of load-unpacked.
            </Para>
          </Section>

          <Section id="settings" title="Settings">
            <Para>
              Eight tabs covering everything per-vault and per-browser:
            </Para>
            <KvList
              items={[
                ["Setup", "Vault nonce, voting mode (Public), program version, members + manage signers (Add / Remove via config-tx proposals)."],
                ["Appearance", "Light or dark mode. Saved per-browser."],
                ["Notifications", "Browser push permission per-vault. Today fires when a Redacted tab is open; service-worker background push ships in v2."],
                ["Modules", "Spending limits, time lock, program modules. Spending limits = bounded delegation (a signer can spend up to X token Y per period without full multisig vote). Time lock = global delay on every approval-to-execution transition."],
                ["Privacy", "Per-activity backend picker (see above)."],
                ["Data", "Export your local data — saved vaults, address book, custom dApps, watchlist, theme, notification + privacy preferences. Drag-and-drop JSON to import elsewhere. No keys exported."],
                ["Environment", "Override Solana RPC URL, MagicRouter endpoint, Squads program ID. Stored per-browser. Refresh required to apply."],
              ]}
            />
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <Para>
              Common errors and what they mean:
            </Para>
            <KvList
              items={[
                ['"Rate limited"', "Your RPC is throttled. Switch to a paid Helius / Triton / QuickNode endpoint in Settings → Environment."],
                ['"failed to get accounts owned by program … account index service overloaded"', "Helius rejecting legacy getProgramAccounts. The spending-limits list auto-falls-back to getProgramAccountsV2 — refresh and it should resolve."],
                ['"Connected wallet is not a signer of this vault"', "The wallet you have connected isn't in the vault's member list. Either switch wallets or use Add Signer in Setup → Manage signers."],
                ['"Transaction too large"', "Squads vault transactions cap at ~10kb. Complex Jupiter routes can exceed this — try Direct Routes only in Swap settings."],
                ['"User rejected the request"', "You dismissed the wallet popup. No harm done — try again."],
                ["Wallet doesn't reconnect on page reload", "Most wallets remember authorization per-site. If reconnect fails, disconnect from the wallet extension and reconnect fresh."],
                ["Extension installed but banner still showing", "Hard-refresh the Apps page (⌘⇧R). The extension's content script announces itself once at document-start — a stale tab won't see it."],
              ]}
            />
          </Section>

          <Section id="security" title="Security model">
            <Para>
              <b>What Redacted can do:</b> read on-chain state via your RPC, build transaction proposals for you to sign, persist preferences and address book to your browser's localStorage.
            </Para>
            <Para>
              <b>What Redacted cannot do:</b> move your funds without your signature, see your private keys, custody anything, modify your vault's on-chain rules unilaterally.
            </Para>
            <Para>
              <b>Quantum resilience.</b> Multisig is M-of-N classical Ed25519 today. An attacker would need to break M keys, not 1 — and do it within the time-lock window before other signers cancel. This is a working defense today while the industry migrates to post-quantum signatures (Dilithium / Falcon).
            </Para>
            <Para>
              <b>For automated trading (Percolator era):</b> the agent gets a delegated-trader role that can <b>open / close / modify positions</b> but <b>cannot withdraw collateral</b>. If the API key leaks, the attacker can only trade your funds within the vault — they cannot take them.
            </Para>
            <Para>
              <b>What's not yet audited:</b> the recovery program and any future custom programs we deploy. Don't put real money behind unaudited custom programs.
            </Para>
          </Section>

          <Section id="support" title="Support">
            <Para>
              Bugs, feature requests, security disclosures:
            </Para>
            <Bullets>
              <li>Telegram bot for trading questions: <MuiLink href="https://t.me/JarvisHL42069_bot" target="_blank" rel="noopener">@JarvisHL42069_bot</MuiLink></li>
              <li>Email: <MuiLink href="mailto:hello@redacted-usd.pro">hello@redacted-usd.pro</MuiLink></li>
              <li>For security issues, please use the email — do not file public issues for vulnerabilities.</li>
            </Bullets>
            <Box sx={{ mt: 2 }}>
              <Chip size="small" label="v1.0 docs" color="primary" variant="outlined" />
              <Chip size="small" label={`Updated ${new Date().toISOString().slice(0, 10)}`} sx={{ ml: 1 }} variant="outlined" />
            </Box>
          </Section>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Tiny building blocks ──────────────────────────────────────────────────
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card id={id} sx={{ scrollMarginTop: 20 }}>
      <CardContent>
        <Typography variant="h3" sx={{ fontSize: 22, mb: 2 }}>{title}</Typography>
        <Stack spacing={1.5}>{children}</Stack>
      </CardContent>
    </Card>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.6, fontSize: 14 }}>
      {children}
    </Typography>
  );
}

function Bullets({ children }: { children: React.ReactNode }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5, color: "text.secondary", fontSize: 14, "& li": { mb: 0.5, lineHeight: 1.6 } }}>
      {children}
    </Box>
  );
}

function NumberedSteps({ items }: { items: React.ReactNode[] }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 2.5, color: "text.secondary", fontSize: 14, "& li": { mb: 1, lineHeight: 1.6 } }}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </Box>
  );
}

function KvList({ items }: { items: Array<[string, string]> }) {
  return (
    <Stack spacing={1}>
      {items.map(([k, v]) => (
        <Box
          key={k}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "180px 1fr" },
            gap: 1.5,
            p: 1, borderRadius: 0.75,
            bgcolor: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{k}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.5 }}>{v}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: "monospace", fontSize: 12,
        bgcolor: "rgba(255,255,255,0.06)",
        px: 0.75, py: 0.25, borderRadius: 0.5,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </Box>
  );
}
