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
} from "@mui/material";
import { PublicKey } from "@solana/web3.js";

export function AddVaultDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (address: string, name?: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    try {
      new PublicKey(address.trim());
    } catch {
      setError("Not a valid Solana address.");
      return;
    }
    onAdd(address.trim(), name.trim() || undefined);
    setAddress("");
    setName("");
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
            onChange={(e) => setAddress(e.target.value)}
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!address.trim()}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
