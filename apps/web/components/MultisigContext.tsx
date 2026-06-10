"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { loadMultisig, type MultisigView } from "@/lib/squads";
import { getLastMode, setLastMode, getLastSelectedVault } from "@/lib/vault-store";

type State = {
  multisig: MultisigView | null;
  error: string | null;
  loading: boolean;
  setAddress: (addr: string) => void;
  refresh: () => void;
  // New: support using the site with just a connected personal wallet (for future privacy features
  // without requiring multisig). Toggleable at the top.
  mode: 'vault' | 'personal';
  setMode: (mode: 'vault' | 'personal') => void;
  personalPublicKey: PublicKey | null;
  // The pubkey whose tokens/balance we should display and act on (personal wallet or vault PDA).
  activeOwner: PublicKey | null;
};

const Ctx = createContext<State | null>(null);

export function MultisigProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey: personalPublicKey } = useWallet();

  // Default to PERSONAL — no vault is loaded until the user explicitly picks
  // one for this wallet. Prevents "first visitor sees whatever vault the dev
  // set in NEXT_PUBLIC_DEFAULT_MULTISIG" leak and the "switched to a fresh
  // wallet but the previous wallet's vault stayed selected" leak.
  const [mode, setMode] = useState<'vault' | 'personal'>('personal');
  const [address, setAddress] = useState<string>("");
  const [multisig, setMultisig] = useState<MultisigView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  // Track the wallet we last applied saved-state for, so we re-apply on every
  // *actual* wallet change (including switches inside the extension).
  const appliedForWallet = useRef<string | null>(null);

  useEffect(() => {
    if (mode === 'personal' || !address) {
      setMultisig(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pk = new PublicKey(address);
        const m = await loadMultisig(connection, pk);
        if (!cancelled) setMultisig(m);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setMultisig(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, connection, tick, mode]);

  const activeOwner = mode === 'personal' ? personalPublicKey : (multisig ? multisig.vault : null);

  // Restore per-wallet state on (a) initial connect and (b) wallet switch.
  // When a different wallet connects, clear the previous wallet's vault
  // selection so it doesn't leak across users sharing a browser. Then apply
  // the *new* wallet's saved last-mode + last-selected-vault.
  useEffect(() => {
    const walletKey = personalPublicKey?.toBase58() ?? null;
    if (appliedForWallet.current === walletKey) return;
    appliedForWallet.current = walletKey;

    if (!walletKey) {
      // Disconnected. Fully clear.
      setMode('personal');
      setAddress("");
      return;
    }

    // Apply this wallet's saved preferences. Defaults: personal mode, no vault.
    const savedMode = getLastMode(walletKey);
    const nextMode: 'vault' | 'personal' = savedMode ?? 'personal';
    setMode(nextMode);

    if (nextMode === 'vault') {
      const savedVault = getLastSelectedVault(walletKey);
      setAddress(savedVault ?? "");
    } else {
      // Make sure we don't carry the previous wallet's vault into personal mode
      setAddress("");
    }
  }, [personalPublicKey]);

  // Persist mode changes (only after a wallet is connected).
  useEffect(() => {
    if (personalPublicKey) {
      setLastMode(personalPublicKey.toBase58(), mode);
    }
  }, [mode, personalPublicKey]);

  return (
    <Ctx.Provider
      value={{
        multisig,
        error,
        loading,
        setAddress,
        refresh: () => setTick((t) => t + 1),
        mode,
        setMode,
        personalPublicKey,
        activeOwner,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMultisig() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMultisig must be used inside MultisigProvider");
  return v;
}
