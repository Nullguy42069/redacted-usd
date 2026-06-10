"use client";
import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  Alert,
  CircularProgress,
} from "@mui/material";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { loadMultisig } from "@/lib/squads";

export function AddVaultDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (address: string, name?: string) => void;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [bypass, setBypass] = useState(false);

  // Anti-phishing check (Fable 5 audit 2026-06-10): before adding a vault to
  // the user's local list under a friendly name, verify the connected wallet
  // is actually a member. A crafted vault-list JSON could otherwise seat an
  // attacker-controlled multisig under a trusted name; if the victim funds it
  // thinking it's theirs, the funds go to a vault they don't control.
  const submit = async () => {
    setError(null);
    setWarning(null);
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(address.trim());
    } catch {
      setError("Not a valid Solana address.");
      return;
    }
    if (!publicKey) {
      setError("Connect a wallet first so we can verify membership.");
      return;
    }
    setChecking(true);
    try {
      const view = await loadMultisig(connection, pubkey);
      const isMember = view.members.some((m) => m.pubkey.equals(publicKey));
      if (!isMember && !bypass) {
        setWarning(
          "Your connected wallet is NOT a member of this multisig. " +
            "If you add it under a familiar name and then fund it, the funds will go " +
            "to a vault you do NOT control — this is a common phishing pattern. " +
            "Check the address carefully. Tick the confirm box below to add anyway as read-only.",
        );
        setChecking(false);
        return;
      }
      onAdd(address.trim(), name.trim() || undefined);
      setAddress("");
      setName("");
      setBypass(false);
    } catch (e) {
      setError(
        "Couldn't load this vault on-chain — either it doesn't exist or the RPC failed. " +
          "Double-check the address. (" +
          ((e as Error)?.message?.slice(0, 80) ?? "unknown") +
          ")",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add existing vault</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Vault address"
            placeholder="Solana vault address"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setWarning(null);
              setBypass(false);
            }}
            fullWidth
            autoFocus
          />
          <TextField
            label="Name (optional)"
            placeholder="e.g. Team treasury"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          {warning && (
            <Stack spacing={1}>
              <Alert severity="warning">{warning}</Alert>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => {
                  setBypass(true);
                  setWarning(null);
                }}
              >
                I understand — add as read-only
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!address.trim() || checking}
          startIcon={checking ? <CircularProgress size={14} /> : null}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
