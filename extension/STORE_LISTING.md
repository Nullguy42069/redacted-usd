# Chrome Web Store listing — Redacted Multisig

## Name
Redacted Multisig

## Short description (max 132 chars)
Sign Solana transactions with your Squads multisig vault, from any dApp.

## Category
Productivity (Chrome Web Store doesn't have "Wallet" / "Web3" categories.
Productivity is what most other wallet extensions use.)

## Detailed description
Redacted Multisig is a non-custodial browser extension that lets you connect
your Squads v4 multisig vault to any Solana dApp.

Instead of signing transactions with a hot wallet — where one compromised
device or one signing mistake can drain everything — your transactions become
proposals in your multisig. They route through your co-signers' normal
approval flow before executing on chain.

WHAT IT DOES
• Registers as a Wallet Standard provider, so any modern Solana dApp can
  connect to your multisig the same way it would connect to Phantom or
  Backpack.
• When a dApp asks you to sign, the request is forwarded to the Redacted web
  app (redacted-usd.xyz) where it's shown clearly and turned into a Squads
  proposal.
• You and your co-signers approve through normal Squads flow.
• Once threshold is met, anyone can execute the transaction on chain.

WHAT IT DOES NOT DO
• It does not hold private keys.
• It does not have authority to sign anything by itself.
• It does not transmit any data to servers we control.
• There is no tracking, analytics, or telemetry.

HOW IT'S DIFFERENT FROM A NORMAL WALLET
A normal wallet extension is the signer — it holds the keys and can be
tricked or compromised. Redacted Multisig is just a bridge. The actual
signing is done by your signing wallet (hardware, Phantom, Backpack, etc.)
when you approve the multisig proposal — the same flow you already use for
Squads vault transactions.

This gives you the convenience of dApp connections with the security
guarantees of a multisig.

REQUIREMENTS
• A Squads v4 vault that you're a member of (create one at redacted-usd.xyz).
• A signing wallet to approve proposals.
• That's it.

PRIVACY POLICY
https://redacted-usd.xyz/privacy

The extension does not collect, store, or transmit any personal information.
Open source and auditable.

## Permissions justification (required by Chrome review)

**storage** — Required to remember which Redacted tab is open so signing
requests get routed to it instead of opening duplicate tabs on every dApp
connection.

**tabs** — Required to open the Redacted web app when a dApp requests a
connection but no Redacted tab is currently open. Without this, the user
sees a confusing failure when first connecting from a fresh browser session.

**host_permissions: <all_urls>** — Required by the Wallet Standard spec.
The extension must inject a small provider object on every site to announce
itself when the dApp's wallet adapter scans for available wallets. The
content script does not read page content, does not transmit any data, and
does not modify the page DOM beyond registering the provider object. This
is the same permission Phantom, Backpack, Solflare, and every other Solana
wallet extension uses.

## Screenshots needed (1280×800 each, at least 1, up to 5)

1. **Hero shot** — Redacted web app showing a vault dashboard with the
   "Redacted Multisig" badge prominent. Convey "this is your multisig home."

2. **Connect flow** — A popular Solana dApp (Jupiter, Raydium, Marinade) with
   the wallet-connect modal open, showing "Redacted Multisig" as one of the
   wallet options.

3. **Sign request** — A pending transaction in the Redacted app waiting for
   co-signer approval. Shows the proposed instruction clearly.

4. **Approval flow** — Co-signers approving and the threshold counter
   incrementing.

5. **Settled** — The transaction confirmed on chain, with a Solscan link.

## Promotional images (optional but recommended)
• Marquee promo tile: 1400×560
• Large promo tile: 920×680
• Small promo tile: 440×280
