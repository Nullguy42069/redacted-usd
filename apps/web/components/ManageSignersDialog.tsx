"use client";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, TextField, Button, Alert, Typography, MenuItem,
  CircularProgress, Stack, Chip, Link as MuiLink, FormControlLabel, Switch,
} from "@mui/material";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import {
  buildAddMemberProposal,
  buildRemoveMemberProposal,
  buildChangeThresholdProposal,
  buildExecute,
  loadMultisig,
  shortAddress,
} from "@/lib/squads";
import { invalidateAfterTx } from "@/lib/rpc-cache";

type Mode = "add" | "remove" | "threshold";

// 90s manual confirm poller (same approach as CreateVaultDialog) — Solana mainnet
// during congestion blows past the default 30s wallet-adapter timeout, leaving
// the UI stuck with no feedback when the tx actually did land.
async function confirmWithExtendedTimeout(
  connection: ReturnType<typeof useConnection>["connection"],
  sig: string,
  timeoutMs = 90_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(sig);
    const v = status?.value;
    if (v?.err) {
      throw new Error(`Transaction failed on chain: ${JSON.stringify(v.err)}. Signature: ${sig}`);
    }
    if (v?.confirmationStatus === "confirmed" || v?.confirmationStatus === "finalized") {
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Confirmation timed out after 90s. The transaction may still confirm — check the signature on Solana Explorer:\nhttps://solscan.io/tx/${sig}`,
  );
}

export function ManageSignersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("add");
  const [addrInput, setAddrInput] = useState("");
  const [memo, setMemo] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string>("");
  const [newThreshold, setNewThreshold] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ sig: string; index: bigint; autoApproved: boolean } | null>(null);
  // Add-signer permission: Initiate + Vote always on; Execute is the only
  // optional bit per the same rule we apply at vault creation.
  const [newSignerExecute, setNewSignerExecute] = useState(true);

  const { connection } = useConnection();
  const { publicKey: connectedMember, sendTransaction } = useWallet();
  const { multisig, refresh } = useMultisig();

  const reset = () => {
    setAddrInput("");
    setMemo("");
    setRemoveTarget("");
    setNewThreshold("");
    setError(null);
    setSuccess(null);
    setExecuted(false);
  };
  const closeAndReset = () => { reset(); onClose(); refresh(); };

  if (!multisig) return null;

  const memberCount = multisig.members.length;
  const wouldBreakThreshold = mode === "remove" && memberCount - 1 < multisig.threshold;
  const thresholdNum = Number(newThreshold);
  const thresholdValid =
    Number.isFinite(thresholdNum) && thresholdNum >= 1 && thresholdNum <= memberCount && thresholdNum !== multisig.threshold;

  // After creating a proposal, the creator's vote is already baked into the tx
  // (proposalApprove instruction). For a 1-threshold vault, that single vote
  // meets threshold, so the proposal is now "Approved" and just needs an
  // Execute tx. We surface this with a one-click Execute button — saves the
  // user from hunting in the Transactions tab.
  const canAutoExecute = success?.autoApproved && !executed && multisig.threshold === 1;

  // Permission check — being in the member list isn't enough. Squads v4 has
  // a per-member permissions mask: bit 0 = Initiate, bit 1 = Vote, bit 2 = Execute.
  // The Create Proposal flow does configTransactionCreate + proposalCreate +
  // proposalApprove in one tx — needs Initiate (1) AND Vote (2). Without one
  // of those, the on-chain program returns Unauthorized (6004).
  const connectedMemberEntry = connectedMember
    ? multisig.members.find((m) => m.pubkey.equals(connectedMember))
    : null;
  const isMember = !!connectedMemberEntry;
  const perms = connectedMemberEntry?.permissions ?? 0;
  const hasInitiate = (perms & 1) === 1;
  const hasVote = (perms & 2) === 2;
  const hasExecute = (perms & 4) === 4;
  const canCreateProposal = isMember && hasInitiate && hasVote;
  function permsLabel(p: number): string {
    const parts = [];
    if ((p & 1) === 1) parts.push("Initiate");
    if ((p & 2) === 2) parts.push("Vote");
    if ((p & 4) === 4) parts.push("Execute");
    return parts.length ? parts.join(" + ") : "none";
  }

  const submit = async () => {
    if (!connectedMember) { setError("Connect a signer wallet first."); return; }
    if (!isMember) {
      setError(
        `The connected wallet (${shortAddress(connectedMember)}) is not a member of this multisig. ` +
        `Switch to a member wallet to create proposals. Current members: ` +
        multisig.members.map((m) => shortAddress(m.pubkey)).join(", "),
      );
      return;
    }
    if (!canCreateProposal) {
      const missing = [];
      if (!hasInitiate) missing.push("Initiate");
      if (!hasVote) missing.push("Vote");
      setError(
        `Connected wallet is a member but lacks ${missing.join(" + ")} permission${missing.length === 1 ? "" : "s"}. ` +
        `Current permissions: ${permsLabel(perms)}. ` +
        `A wallet with full permissions must update yours via the Manage Signers flow first (or use a different member wallet).`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const view = await loadMultisig(connection, multisig.address);

      let built;
      if (mode === "add") {
        let newMember: PublicKey;
        try { newMember = new PublicKey(addrInput.trim()); }
        catch { throw new Error("Invalid Solana address."); }
        if (multisig.members.some((m) => m.pubkey.equals(newMember))) {
          throw new Error("That address is already a signer.");
        }
        built = await buildAddMemberProposal({
          conn: connection,
          multisigPda: multisig.address,
          view,
          creator: connectedMember,
          newMember,
          permissionsMask: 1 | 2 | (newSignerExecute ? 4 : 0),
          memo: memo || `Add signer ${shortAddress(newMember)}`,
        });
      } else if (mode === "remove") {
        if (!removeTarget) throw new Error("Pick a signer to remove.");
        const oldMember = new PublicKey(removeTarget);
        built = await buildRemoveMemberProposal({
          conn: connection,
          multisigPda: multisig.address,
          view,
          creator: connectedMember,
          oldMember,
          memo: memo || `Remove signer ${shortAddress(oldMember)}`,
        });
      } else {
        if (!thresholdValid) throw new Error(`Threshold must be 1-${memberCount} and different from current (${multisig.threshold}).`);
        built = await buildChangeThresholdProposal({
          conn: connection,
          multisigPda: multisig.address,
          view,
          creator: connectedMember,
          newThreshold: thresholdNum,
          memo: memo || `Change threshold ${multisig.threshold}/${memberCount} → ${thresholdNum}/${memberCount}`,
        });
      }

      const sig = await sendTransaction(built.tx, connection, { maxRetries: 3 });
      await confirmWithExtendedTimeout(connection, sig);
      // Signer/threshold change just landed — invalidate cached multisig state
      // so UI reflects the new member set immediately. Without this, the cache
      // would show stale member counts for up to 15s (Fable 5 audit 2026-06-10).
      invalidateAfterTx(multisig.vault);
      // The tx's proposalApprove ix counts the creator's vote. If threshold=1,
      // the proposal is now in "Approved" status and can execute.
      setSuccess({ sig, index: built.transactionIndex, autoApproved: multisig.threshold === 1 });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const executeNow = async () => {
    if (!connectedMember || !success) return;
    setExecuting(true);
    setError(null);
    try {
      const execTx = await buildExecute(connection, multisig.address, success.index, connectedMember);
      const sig = await sendTransaction(execTx, connection, { maxRetries: 3 });
      await confirmWithExtendedTimeout(connection, sig);
      invalidateAfterTx(multisig.vault);
      setExecuted(true);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setExecuting(false);
    }
  };

  const buttonDisabled =
    submitting ||
    !connectedMember ||
    !canCreateProposal ||
    (mode === "add" && !addrInput.trim()) ||
    (mode === "remove" && (!removeTarget || wouldBreakThreshold)) ||
    (mode === "threshold" && !thresholdValid);

  return (
    <Dialog open={open} onClose={submitting || executing ? undefined : closeAndReset} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Manage signers</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Changes create a proposal that needs {multisig.threshold} of {memberCount} signer{memberCount === 1 ? "" : "s"} to vote and execute.
          {multisig.threshold === 1 && " Since your threshold is 1, your single signature can both vote and execute in one click after the proposal is created."}
        </Typography>

        {connectedMember && !isMember && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Connected wallet is not a member of this vault.</strong>
            <br />
            Connected: <code>{shortAddress(connectedMember)}</code>
            <br />
            Members: {multisig.members.map((m) => <code key={m.pubkey.toBase58()} style={{ marginRight: 4 }}>{shortAddress(m.pubkey)}</code>)}
            <br />
            Switch to a member wallet to create proposals.
          </Alert>
        )}

        {connectedMember && isMember && !canCreateProposal && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Connected wallet is a member but lacks required permissions.</strong>
            <br />
            Has: <code>{permsLabel(perms)}</code>
            <br />
            Needs: <code>Initiate + Vote</code> to create proposals (and <code>Execute</code> for one-click execute).
            <br />
            A member with full permissions must update yours via Manage Signers first, or use a different member wallet.
          </Alert>
        )}

        {connectedMember && canCreateProposal && (
          <Alert severity="info" sx={{ mb: 2, py: 0.5 }} icon={false}>
            <Typography variant="body2" sx={{ fontSize: 12 }}>
              Connected as member <code>{shortAddress(connectedMember)}</code> — permissions: <code>{permsLabel(perms)}</code>
              {!hasExecute && " (no Execute — proposals will need a separate execute by an Execute-permission member)"}
            </Typography>
          </Alert>
        )}

        <Tabs
          value={mode}
          onChange={(_, v) => { setMode(v); setError(null); setSuccess(null); setExecuted(false); }}
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="add" label="Add signer" />
          <Tab value="remove" label="Remove signer" />
          <Tab value="threshold" label="Change threshold" />
        </Tabs>

        {mode === "add" && (
          <Stack spacing={2}>
            <TextField
              label="Solana address"
              placeholder="e.g. 7xKXt…N6qP"
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              fullWidth
              autoFocus
              disabled={submitting || !!success}
            />
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                <strong>Initiate + Vote</strong> are always granted — without them, the new signer can&apos;t move the vault forward. <strong>Execute</strong> is optional.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Chip size="small" label="Initiate" />
                <Chip size="small" label="Vote" />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={newSignerExecute}
                      onChange={(e) => setNewSignerExecute(e.target.checked)}
                    />
                  }
                  label={<Typography sx={{ fontSize: 12 }}>Execute</Typography>}
                  sx={{ m: 0, gap: 0.5 }}
                />
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
                Changing this member&apos;s permissions later requires a multisig vote.
              </Typography>
            </Stack>
          </Stack>
        )}

        {mode === "remove" && (
          <Stack spacing={2}>
            <TextField
              select
              label="Signer to remove"
              value={removeTarget}
              onChange={(e) => setRemoveTarget(e.target.value)}
              fullWidth
              disabled={submitting || !!success}
            >
              {multisig.members.map((m) => {
                const a = m.pubkey.toBase58();
                return (
                  <MenuItem key={a} value={a}>
                    {shortAddress(a, 8, 8)}
                  </MenuItem>
                );
              })}
            </TextField>
            {wouldBreakThreshold && (
              <Alert severity="warning">
                Removing this signer would leave fewer signers ({memberCount - 1}) than the threshold ({multisig.threshold}). Change threshold first.
              </Alert>
            )}
          </Stack>
        )}

        {mode === "threshold" && (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Current: <strong>{multisig.threshold} of {memberCount}</strong>
            </Typography>
            <TextField
              type="number"
              label={`New threshold (1-${memberCount})`}
              placeholder={`e.g. ${Math.min(memberCount, multisig.threshold + 1)}`}
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
              fullWidth
              autoFocus
              disabled={submitting || !!success}
              inputProps={{ min: 1, max: memberCount }}
              helperText={
                newThreshold === "" ? `Will become: N of ${memberCount}` :
                thresholdValid ? `Will become: ${thresholdNum} of ${memberCount}` :
                thresholdNum === multisig.threshold ? "Already at this threshold" :
                `Must be 1-${memberCount}`
              }
              error={newThreshold !== "" && !thresholdValid}
            />
          </Stack>
        )}

        <TextField
          label="Memo (optional)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          fullWidth
          sx={{ mt: 2 }}
          disabled={submitting || !!success}
        />

        {error && <Alert severity="error" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>{error}</Alert>}
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Stack spacing={1}>
              <span>
                Proposal #{success.index.toString()} created.{" "}
                <MuiLink href={`https://solscan.io/tx/${success.sig}`} target="_blank" rel="noopener">
                  View transaction
                </MuiLink>
                .
              </span>
              {executed ? (
                <span>
                  <strong>✓ Executed.</strong> The change is now active on chain.
                </span>
              ) : success.autoApproved ? (
                <span>
                  Threshold is 1 — your signature already approved it. One more click to execute and apply the change:
                </span>
              ) : (
                <span>
                  Other signers need to vote in the <strong>Transactions</strong> tab. Once threshold ({multisig.threshold}) is met, the proposal can be executed there.
                </span>
              )}
            </Stack>
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeAndReset} disabled={submitting || executing}>
          {success ? "Close" : "Cancel"}
        </Button>
        {!success && (
          <Button
            variant="contained"
            onClick={submit}
            disabled={buttonDisabled}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting ? "Submitting…" : "Create proposal"}
          </Button>
        )}
        {canAutoExecute && (
          <Button
            variant="contained"
            color="success"
            onClick={executeNow}
            disabled={executing}
            startIcon={executing ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {executing ? "Executing…" : "Execute now"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
