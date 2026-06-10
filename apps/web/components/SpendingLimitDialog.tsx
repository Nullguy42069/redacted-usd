"use client";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, TextField, Button, Alert, Typography, MenuItem,
  CircularProgress, Stack, Link as MuiLink, Chip,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import { buildAddSpendingLimitProposal, loadMultisig, shortAddress } from "@/lib/squads";
import { invalidateAfterTx } from "@/lib/rpc-cache";

// Built-in mint shortcuts. SOL = PublicKey.default (Squads encodes native SOL
// as the zero pubkey). USDC mainnet is the most common.
const NATIVE_SOL = PublicKey.default.toBase58();
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MINT_PRESETS: { label: string; mint: string; decimals: number }[] = [
  { label: "Native SOL", mint: NATIVE_SOL,   decimals: 9 },
  { label: "USDC",       mint: USDC_MAINNET, decimals: 6 },
];

const PERIODS = [
  { value: 1, label: "Daily" },
  { value: 2, label: "Weekly" },
  { value: 3, label: "Monthly" },
  { value: 0, label: "One-time" },
];

export function SpendingLimitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mintChoice, setMintChoice] = useState<string>(NATIVE_SOL);  // mint base58 or "custom"
  const [customMint, setCustomMint] = useState("");
  const [customDecimals, setCustomDecimals] = useState<string>("6");
  const [amountInput, setAmountInput] = useState("");
  const [period, setPeriod] = useState<number>(1);
  const [memberSel, setMemberSel] = useState<string>("");
  const [members, setMembers] = useState<string[]>([]);
  const [destInput, setDestInput] = useState("");
  const [destinations, setDestinations] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ sig: string; index: bigint } | null>(null);

  const { connection } = useConnection();
  const { publicKey: connectedMember, sendTransaction } = useWallet();
  const { multisig } = useMultisig();
  if (!multisig) return null;

  const reset = () => {
    setMintChoice(NATIVE_SOL); setCustomMint(""); setCustomDecimals("6");
    setAmountInput(""); setPeriod(1);
    setMemberSel(""); setMembers([]); setDestInput(""); setDestinations([]);
    setMemo(""); setError(null); setSuccess(null);
  };
  const closeAndReset = () => { reset(); onClose(); };

  const preset = MINT_PRESETS.find((p) => p.mint === mintChoice);
  const decimals = preset ? preset.decimals : Math.max(0, parseInt(customDecimals || "0", 10));
  const mintLabel = preset?.label ?? (customMint ? `Custom mint (${shortAddress(customMint)})` : "Custom mint");

  const addMember = () => {
    if (!memberSel) return;
    if (!members.includes(memberSel)) setMembers([...members, memberSel]);
    setMemberSel("");
  };
  const removeMember = (a: string) => setMembers(members.filter((m) => m !== a));

  const addDestination = () => {
    if (!destInput.trim()) return;
    try { new PublicKey(destInput.trim()); } catch { setError("Invalid destination address."); return; }
    if (!destinations.includes(destInput.trim())) setDestinations([...destinations, destInput.trim()]);
    setDestInput(""); setError(null);
  };
  const removeDestination = (a: string) => setDestinations(destinations.filter((d) => d !== a));

  const submit = async () => {
    if (!connectedMember) { setError("Connect a signer wallet first."); return; }
    if (members.length === 0) { setError("Add at least one spending member."); return; }
    if (!amountInput || Number(amountInput) <= 0) { setError("Enter a positive amount."); return; }

    let mint: PublicKey;
    try {
      mint = new PublicKey(mintChoice === "custom" ? customMint.trim() : mintChoice);
    } catch { setError("Invalid mint address."); return; }

    setSubmitting(true);
    setError(null);
    try {
      const view = await loadMultisig(connection, multisig.address);
      // Convert user-entered amount to base units using mint decimals.
      const amt = Number(amountInput);
      const baseUnits = BigInt(Math.round(amt * Math.pow(10, decimals)));

      const built = await buildAddSpendingLimitProposal({
        conn: connection,
        multisigPda: multisig.address,
        view,
        creator: connectedMember,
        mint,
        amountBaseUnits: baseUnits,
        period,
        members: members.map((s) => new PublicKey(s)),
        destinations: destinations.map((s) => new PublicKey(s)),
        memo: memo || `Add spending limit: ${amt} ${mintLabel} / ${PERIODS.find(p=>p.value===period)?.label}`,
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
      <DialogTitle>Add spending limit</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Spending limits let specific signers move up to a capped amount per period without going through a full multisig vote. The change itself is a proposal that needs {multisig.threshold} of {multisig.members.length} signers to approve.
        </Typography>

        <Stack spacing={2}>
          {/* Token */}
          <Stack direction="row" spacing={1}>
            <TextField
              select
              label="Token"
              value={mintChoice}
              onChange={(e) => setMintChoice(e.target.value)}
              fullWidth
              disabled={submitting}
            >
              {MINT_PRESETS.map((p) => (
                <MenuItem key={p.mint} value={p.mint}>{p.label}</MenuItem>
              ))}
              <MenuItem value="custom">Custom mint</MenuItem>
            </TextField>
          </Stack>
          {mintChoice === "custom" && (
            <Stack direction="row" spacing={1}>
              <TextField
                label="Mint address"
                value={customMint}
                onChange={(e) => setCustomMint(e.target.value)}
                fullWidth
                disabled={submitting}
              />
              <TextField
                label="Decimals"
                type="number"
                value={customDecimals}
                onChange={(e) => setCustomDecimals(e.target.value)}
                sx={{ width: 120 }}
                disabled={submitting}
              />
            </Stack>
          )}

          {/* Amount + period */}
          <Stack direction="row" spacing={1}>
            <TextField
              label="Amount"
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              fullWidth
              disabled={submitting}
              helperText={amountInput ? `Stored as ${BigInt(Math.round(Number(amountInput) * Math.pow(10, decimals))).toString()} base units` : `${decimals} decimals`}
            />
            <TextField
              select
              label="Period"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              sx={{ width: 160 }}
              disabled={submitting}
            >
              {PERIODS.map((p) => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Members allowed to spend */}
          <Box>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>Members allowed to spend</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                select
                label="Signer"
                value={memberSel}
                onChange={(e) => setMemberSel(e.target.value)}
                fullWidth
                disabled={submitting}
              >
                {multisig.members
                  .filter((m) => !members.includes(m.pubkey.toBase58()))
                  .map((m) => (
                    <MenuItem key={m.pubkey.toBase58()} value={m.pubkey.toBase58()}>
                      {shortAddress(m.pubkey.toBase58(), 8, 8)}
                    </MenuItem>
                  ))}
              </TextField>
              <Button variant="outlined" startIcon={<Add />} onClick={addMember} disabled={!memberSel || submitting}>
                Add
              </Button>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {members.map((a) => (
                <Chip key={a} label={shortAddress(a, 6, 6)} onDelete={() => removeMember(a)} deleteIcon={<Close fontSize="small" />} />
              ))}
              {members.length === 0 && (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>None added yet</Typography>
              )}
            </Stack>
          </Box>

          {/* Destinations (optional) */}
          <Box>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
              Allowed destinations <Box component="span" sx={{ opacity: 0.7 }}>(optional — empty = anywhere)</Box>
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                label="Solana address"
                value={destInput}
                onChange={(e) => setDestInput(e.target.value)}
                fullWidth
                disabled={submitting}
              />
              <Button variant="outlined" startIcon={<Add />} onClick={addDestination} disabled={!destInput.trim() || submitting}>
                Add
              </Button>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {destinations.map((a) => (
                <Chip key={a} label={shortAddress(a, 6, 6)} onDelete={() => removeDestination(a)} deleteIcon={<Close fontSize="small" />} />
              ))}
            </Stack>
          </Box>

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
            disabled={
              submitting || !connectedMember ||
              members.length === 0 || !amountInput || Number(amountInput) <= 0 ||
              (mintChoice === "custom" && !customMint.trim())
            }
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting ? "Submitting…" : "Create proposal"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
