"use client";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  IconButton,
  Snackbar,
} from "@mui/material";
import { ContentCopy } from "@mui/icons-material";
import { useState } from "react";
import { useMultisig } from "./MultisigContext";

export function ReceiveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { multisig, mode, activeOwner, personalPublicKey } = useMultisig();
  const [copied, setCopied] = useState(false);

  const addr = mode === 'personal' 
    ? (personalPublicKey ? personalPublicKey.toBase58() : null)
    : (multisig ? multisig.vault.toBase58() : null);

  if (!addr) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Receive</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography sx={{ color: "text.secondary" }}>
              Send Solana assets to the active address ({mode === 'personal' ? 'personal wallet' : 'vault'}). Only send Solana-network assets.
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                p: 2,
                bgcolor: "rgba(255,255,255,0.04)",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography sx={{ flex: 1, fontFamily: "monospace", wordBreak: "break-all" }}>
                {addr}
              </Typography>
              <IconButton
                onClick={() => {
                  navigator.clipboard.writeText(addr);
                  setCopied(true);
                }}
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={copied}
        autoHideDuration={1500}
        onClose={() => setCopied(false)}
        message="Address copied"
      />
    </>
  );
}
