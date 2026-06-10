"use client";
import React, { useMemo, useEffect } from "react";
import { registerServiceWorker } from "@/lib/notifications";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import { TrezorWalletAdapter } from "@solana/wallet-adapter-trezor";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { getTheme } from "@/lib/theme";
import { RPC_URL } from "@/lib/env";
import { MultisigProvider } from "@/components/MultisigContext";
import { ThemeModeProvider, useThemeMode } from "@/components/ThemeModeContext";
import { EvmWalletProvider } from "@/components/EvmWalletContext";
import "@solana/wallet-adapter-react-ui/styles.css";

function ThemedShell({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const theme = useMemo(() => getTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

function WalletErrorHandler() {
  const { disconnect } = useWallet();

  // This effect helps clean up state when the wallet disconnects externally
  // (e.g. user disconnects from Phantom extension while the site is open)
  React.useEffect(() => {
    const handleDisconnect = () => {
      console.log("Wallet was disconnected externally");
    };

    window.addEventListener("wallet-disconnect", handleDisconnect as any);
    return () => window.removeEventListener("wallet-disconnect", handleDisconnect as any);
  }, [disconnect]);

  return null;
}

// Listens for Phantom's legacy `accountChanged` event — fires when the user
// flips accounts inside the Phantom extension. The Wallet Standard `change`
// event handled by wallet-adapter-react covers modern wallets natively; this
// is the Phantom-specific bridge for the legacy provider that still emits
// accountChanged in current builds.
//
// IMPORTANT: only triggers on the legacy provider event, NOT on adapter
// connect (the previous version did that and looped — disconnect+connect on
// every connect = infinite churn). We update local state via the adapter's
// connect() so existing approvals are reused; the user only sees a Phantom
// prompt the first time they switch to a previously-unapproved account.
function WalletAccountChangeHandler() {
  const { wallet, publicKey, connect, disconnect } = useWallet();

  React.useEffect(() => {
    if (!wallet) return;
    const w = window as any;
    const provider = w.solana;
    if (!provider?.isPhantom || typeof provider.on !== "function") return;

    let cancelled = false;

    const onPhantomAccountChanged = async (newPubkey: any) => {
      if (cancelled) return;
      if (!newPubkey) {
        // null = wallet locked or current account removed
        try { await disconnect(); } catch {}
        return;
      }
      const newStr = typeof newPubkey === "string"
        ? newPubkey
        : newPubkey.toBase58?.() ?? null;
      if (!newStr || newStr === publicKey?.toBase58()) return;
      try {
        await disconnect();
        if (cancelled) return;
        await connect();
      } catch {
        // user dismissed re-approval prompt — quiet
      }
    };

    provider.on("accountChanged", onPhantomAccountChanged);
    return () => {
      cancelled = true;
      if (typeof provider.removeListener === "function") {
        provider.removeListener("accountChanged", onPhantomAccountChanged);
      }
    };
  }, [wallet, publicKey, connect, disconnect]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Register the notifications Service Worker as soon as the app boots. It's
  // safe to call repeatedly — the function memoizes its result. This also
  // primes the SW so the first notification doesn't pay the registration cost.
  useEffect(() => { registerServiceWorker(); }, []);

  // wallet-standard discovery picks up most browser wallets automatically.
  // We explicitly add hardware wallets so Ledger and Trezor appear in the selection UI.
  const wallets = useMemo(
    () => [new LedgerWalletAdapter(), new TrezorWalletAdapter()],
    []
  );

  const onError = (error: Error) => {
    // Expected user-driven outcomes — log quietly, don't surface as runtime errors.
    if (error.name === "WalletDisconnectedError") {
      console.warn("Wallet disconnected:", error.message);
      return;
    }
    if (
      error.name === "WalletConnectionError" ||
      error.name === "WalletNotConnectedError" ||
      /user rejected/i.test(error.message)
    ) {
      console.warn("Wallet connect cancelled by user.");
      return;
    }
    console.error("Wallet error:", error);
  };

  return (
    <AppRouterCacheProvider>
      <ThemeModeProvider>
        <ThemedShell>
          <ConnectionProvider endpoint={RPC_URL}>
            <WalletProvider wallets={wallets} autoConnect onError={onError}>
              <WalletModalProvider>
                <WalletErrorHandler />
                <WalletAccountChangeHandler />
                <MultisigProvider>
                  <EvmWalletProvider>
                    {children}
                  </EvmWalletProvider>
                </MultisigProvider>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </ThemedShell>
      </ThemeModeProvider>
    </AppRouterCacheProvider>
  );
}
