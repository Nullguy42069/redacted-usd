"use client";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, TextField, Button, Alert, Typography, MenuItem,
  CircularProgress, Stack, Link as MuiLink,
} from "@mui/material";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import { buildSetTimeLockProposal, loadMultisig, humanizeSeconds } from "@/lib/squads";
import { invalidateAfterTx } from "@/lib/rpc-cache";

// Presets that cover the common cases — matches the spirit of Safe's
// delay-modifier presets (7/14/28/56 days).
const PRESETS: { label: string; seconds: number }[] = [
  { label: "Instant (no lock)", seconds: 0 },
  { label: "1 hour",  seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days",   seconds: 86400 * 7 },
  { label: "14 days",  seconds: 86400 * 14 },
  { label: "28 days",  seconds: 86400 * 28 },
];

export function TimeLockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [preset, setPreset] = useState<string>("custom");
  const [seconds, setSeconds] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ sig: string; index: bigint } | null>(null);

  const { connection } = useConnection();
  const { publicKey: connectedMember, sendTransaction } = useWallet();
  const { multisig } = useMultisig();
  if (!multisig) return null;

  const reset = () => {
    setPreset("custom"); setSeconds(""); setMemo("");
    setError(null); setSuccess(null);
  };
  const closeAndReset = () => { reset(); onClose(); };

  const effectiveSeconds = preset === "custom"
    ? Math.max(0, Math.floor(Number(seconds) || 0))
    : Number(preset);

  const submit = async () => {
    if (!connectedMember) { setError("Connect a signer wallet first."); return; }
    if (effectiveSeconds < 0) { setError("Time lock can't be negative."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const view = await loadMultisig(connection, multisig.address);
      const built = await buildSetTimeLockProposal({
        conn: connection,
        multisigPda: multisig.address,
        view,
        creator: connectedMember,
        newTimeLockSeconds: effectiveSeconds,
        memo: memo || `Set time lock → ${humanizeSeconds(effectiveSeconds)}`,
      });
      const sig = await sendTransaction(built.tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      invalidateAfterTx(multisig.vault);
      setSuccess({ sig, index: built.transactionIndex });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : closeAndReset} maxWidth="sm" fullWidth>
      <DialogTitle>Change time lock</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Time lock delays every proposal from approval to execution. Currently:{" "}
          <Box component="b">{humanizeSeconds(multisig.timeLockSeconds)}</Box>. The change creates a
          proposal that needs {multisig.threshold} of {multisig.members.length} signers to vote.
        </Typography>

        <Stack spacing={2}>
          <TextField
            select
            label="Preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            fullWidth
            disabled={submitting}
          >
            {PRESETS.map((p) => (
              <MenuItem key={p.label} value={String(p.seconds)}>{p.label}</MenuItem>
            ))}
            <MenuItem value="custom">Custom (seconds)</MenuItem>
          </TextField>

          {preset === "custom" && (
            <TextField
              label="Seconds"
              type="number"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              fullWidth
              disabled={submitting}
              helperText={Number(seconds) > 0 ? `That's ${humanizeSeconds(Number(seconds))}` : "0 = no lock (instant)"}
            />
          )}

          <TextField
            label="Memo (optional)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            fullWidth
            disabled={submitting}
          />
        </Stack>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Proposal #{success.index.toString()} created.{" "}
            <MuiLink href={`https://solscan.io/tx/${success.sig}`} target="_blank" rel="noopener">View transaction</MuiLink>
            . Vote from the Transactions tab.
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeAndReset} disabled={submitting}>{success ? "Close" : "Cancel"}</Button>
        {!success && (
          <Button
            variant="contained"
            onClick={submit}
            disabled={submitting || !connectedMember || effectiveSeconds === multisig.timeLockSeconds}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting ? "Submitting…" : "Create proposal"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
