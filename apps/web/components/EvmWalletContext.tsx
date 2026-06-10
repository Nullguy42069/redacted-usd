"use client";
// Minimal EVM wallet connection layer. Uses window.ethereum (MetaMask /
// Rabby / OKX / Coinbase extension / Brave / any EIP-1193 provider) so we
// don't need wagmi or RainbowKit just to surface a connect pill.
//
// Scope: read address, switch chain, render the pill. Transaction signing for
// EVM-source bridges still hands off to the deBridge external UI (we'll wire
// proper EVM signing in a focused session).

import {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
} from "react";

type EthProvider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthProvider;
  }
}

type Ctx = {
  available: boolean;            // any window.ethereum present
  address: string | null;
  chainId: number | null;        // decimal
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (id: number) => Promise<void>;
  // Pages can declare they need an EVM wallet so the Topbar surfaces the
  // pill. Cleared when the user navigates away.
  required: boolean;
  setRequired: (b: boolean) => void;
};

const EvmWalletCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "redacted-evm-connected";

export function EvmWalletProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [required, setRequired] = useState(false);

  // Detect provider on mount + try silent reconnect if previously connected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = window.ethereum;
    setAvailable(!!eth);
    if (!eth) return;

    const onAccountsChanged = (accs: string[]) => {
      setAddress(accs?.[0] ?? null);
      try { localStorage.setItem(STORAGE_KEY, accs?.[0] ? "1" : ""); } catch {}
    };
    const onChainChanged = (idHex: string) => {
      try { setChainId(parseInt(idHex, 16)); } catch {}
    };
    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);

    // Silent reconnect: only if the user previously approved and the wallet
    // still has the site authorised. eth_accounts (no prompt) returns
    // [] when unauthorised.
    const wasConnected = (() => { try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; } })();
    if (wasConnected) {
      eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
        if (accs?.[0]) setAddress(accs[0]);
      }).catch(() => {});
      eth.request({ method: "eth_chainId" }).then((idHex: string) => {
        try { setChainId(parseInt(idHex, 16)); } catch {}
      }).catch(() => {});
    }

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No EVM wallet detected. Install MetaMask, Rabby, or another EIP-1193 wallet.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accs: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accs?.[0] ?? null;
      setAddress(addr);
      try { localStorage.setItem(STORAGE_KEY, addr ? "1" : ""); } catch {}
      try {
        const idHex: string = await window.ethereum.request({ method: "eth_chainId" });
        setChainId(parseInt(idHex, 16));
      } catch {}
    } catch (e: any) {
      // 4001 = user rejected — quiet
      if (e?.code !== 4001) setError(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    // window.ethereum has no "disconnect" call — user must revoke from the
    // wallet UI to fully unbind. We just forget locally.
  }, []);

  const switchChain = useCallback(async (id: number) => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const hex = "0x" + id.toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e: any) {
      // 4902 = chain not added in wallet. User can add it manually.
      if (e?.code !== 4001) setError(e?.message ?? String(e));
    }
  }, []);

  const value = useMemo<Ctx>(() => ({
    available, address, chainId, connecting, error,
    connect, disconnect, switchChain, required, setRequired,
  }), [available, address, chainId, connecting, error, connect, disconnect, switchChain, required]);

  return <EvmWalletCtx.Provider value={value}>{children}</EvmWalletCtx.Provider>;
}

export function useEvmWallet(): Ctx {
  const v = useContext(EvmWalletCtx);
  if (!v) throw new Error("useEvmWallet must be used inside EvmWalletProvider");
  return v;
}

export function shortEvmAddress(a: string | null, head = 4, tail = 4): string {
  if (!a) return "";
  if (a.length <= head + tail + 2) return a;
  return `${a.slice(0, 2 + head)}…${a.slice(-tail)}`;
}
