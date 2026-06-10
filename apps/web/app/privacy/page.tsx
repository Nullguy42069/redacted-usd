"use client";
import { Box, Typography, Stack, Link as MuiLink } from "@mui/material";

export default function PrivacyPolicyPage() {
  return (
    <Box sx={{ maxWidth: 760, mx: "auto", py: 6, px: 3 }}>
      <Typography variant="h2" sx={{ mb: 1 }}>Privacy Policy</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 4 }}>
        Last updated: 2026-06-08
      </Typography>

      <Stack spacing={3}>
        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>Summary</Typography>
          <Typography>
            Redacted Multisig (the browser extension and the web app at
            redacted-usd.xyz) is a non-custodial interface to Squads v4 multisig
            vaults on Solana. We do not collect, transmit, or store your private
            keys, seed phrases, transaction history, or personal information on
            any server we control.
          </Typography>
        </section>

        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>What stays on your device</Typography>
          <Typography component="div">
            All of the following are stored in your browser&apos;s local storage
            and never leave your machine:
            <ul>
              <li>Your saved vault address book</li>
              <li>UI preferences (theme, layout)</li>
              <li>Locally-generated API keys for the read-only Vaults API</li>
              <li>Vault display names and avatars you set</li>
            </ul>
            You can clear all of this any time by removing the
            <code>redacted-*</code> entries from your browser&apos;s local
            storage, or by uninstalling the extension.
          </Typography>
        </section>

        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>What touches the network</Typography>
          <Typography component="div">
            When you use the app, your browser makes requests to:
            <ul>
              <li>
                <b>Solana RPC providers</b> (default Helius, configurable in
                Settings) — to read multisig state and broadcast transactions
                you sign. These providers see your wallet address and the
                transactions you broadcast; that is the public chain.
              </li>
              <li>
                <b>Token metadata APIs</b> (Helius DAS, Jupiter) — to look up
                token names, symbols, and prices for assets in the vaults you
                view. Includes mint addresses, not personal info.
              </li>
              <li>
                <b>The Solana network itself</b> — every transaction you
                approve is broadcast to the public chain.
              </li>
            </ul>
            We do not run any analytics, telemetry, or tracking. There are no
            cookies, no fingerprinting, no third-party scripts beyond what the
            wallet-connect process strictly requires.
          </Typography>
        </section>

        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>The browser extension</Typography>
          <Typography component="div">
            The Redacted Multisig browser extension registers as a Wallet
            Standard provider so other Solana dApps can request signatures.
            When a dApp asks the extension to sign a transaction:
            <ol>
              <li>The transaction is shown to you in the Redacted web app.</li>
              <li>It is created as a proposal in your multisig vault on chain.</li>
              <li>You and your co-signers approve it through normal Squads flow.</li>
              <li>Once threshold is reached, anyone can execute it on chain.</li>
            </ol>
            The extension never sees or stores a private key. It does not have
            authority to sign anything by itself. Your signing wallet
            (hardware, browser wallet, or otherwise) handles all signatures
            through your existing wallet&apos;s normal approval flow.
          </Typography>
        </section>

        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>Permissions the extension requests</Typography>
          <Typography component="div">
            <ul>
              <li>
                <code>storage</code> — to remember which Redacted tab is the
                current one for routing sign requests.
              </li>
              <li>
                <code>tabs</code> — to open the Redacted app when a dApp
                requests a connection but no Redacted tab is open.
              </li>
              <li>
                <code>host_permissions: &lt;all_urls&gt;</code> — to register
                the wallet provider on any Solana dApp you visit. This is
                required by the Wallet Standard; the extension does not read
                page content or transmit anything off your machine.
              </li>
            </ul>
          </Typography>
        </section>

        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>Open source</Typography>
          <Typography>
            The source code for the extension and the web app is open and
            auditable. You can verify these claims by reading the code.
          </Typography>
        </section>

        <section>
          <Typography variant="h4" sx={{ mb: 1 }}>Contact</Typography>
          <Typography>
            For questions about this policy, file an issue in the project
            repository. Because this is a non-custodial tool with no user
            accounts, we have no users to contact and no support tickets to
            handle — only public issue threads.
          </Typography>
        </section>
      </Stack>
    </Box>
  );
}
