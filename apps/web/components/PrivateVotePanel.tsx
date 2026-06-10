"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Drawer,
  Button,
  Stack,
  TextField,
  Typography,
  Alert,
  Chip,
  LinearProgress,
  Box,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { CheckCircle, Cancel, Lock, Bolt } from "@mui/icons-material";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getMeta, type RoutingDecision } from "@redacted-usd/aggregator";
import {
  allMembersVoted,
  buildCpiProposalApproveTx,
  buildInitPollTx,
  buildInitPrivateVoteTx,
  buildTryFinalizeTx,
  derivePrivateVotePda,
  hasVoted,
  loadPrivateVoteState,
  phase as derivePhase,
  type LifecyclePhase,
  type PrivateVoteState,
} from "@/lib/privateVote";
import { isTeeVoteWrapped } from "@/lib/teeVote";
import { getAggregator } from "@/lib/aggregator";
import { invalidateAfterTx } from "@/lib/rpc-cache";
import { RoutingDisplay } from "./RoutingDisplay";

type Props = {
  open: boolean;
  onClose: () => void;
  multisig: PublicKey;
  transactionIndex: bigint;
  isTeeWrapped?: boolean;   // passed from parent so we can label correctly even before decision loads
};

export function PrivateVotePanel({ open, onClose, multisig, transactionIndex, isTeeWrapped }: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [state, setState] = useState<PrivateVoteState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pda] = derivePrivateVotePda(multisig, transactionIndex);
      const s = await loadPrivateVoteState(connection, pda);
      setState(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [connection, multisig, transactionIndex]);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  // While waiting on MPC callbacks (init_poll, try_finalize), poll state every 3s.
  useEffect(() => {
    if (!open || !state) return;
    const ph = derivePhase(state, allMembersVoted(state));
    if (ph !== "needsPoll" && ph !== "needsFinalize") return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [open, state, refresh]);

  // Decision-driven callout: ask the aggregator what it would actually route
  // for a vote intent on this proposal. This is the source of truth for the
  // privacy tier banner (no more hardcoded "ARCIUM MPC (80)").
  useEffect(() => {
    if (!open || !multisig) return;
    let cancelled = false;
    (async () => {
      try {
        const agg = await getAggregator(connection);
        const d = await agg.route(
          {
            type: "vote",
            multisig,
            transactionIndex,
            choice: true,
            voter: publicKey ?? multisig, // best-effort; voter not required for pure routing
          },
          undefined,
          { signer: publicKey ?? undefined },
        );
        if (!cancelled) setDecision(d);
      } catch {
        // best-effort only
      }
    })();
    return () => { cancelled = true; };
  }, [open, multisig, transactionIndex, connection, publicKey]);

  async function submit(buildTx: () => Promise<VersionedTransaction>, label: string) {
    if (!publicKey) return;
    setError(null);
    setBusy(label);
    try {
      const tx = await buildTx();
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      if (multisig) invalidateAfterTx(multisig.vault);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const ph = derivePhase(state, allMembersVoted(state));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 420 }, bgcolor: "background.paper", borderLeft: "1px solid", borderColor: "divider" } } }}
    >
      <Box sx={{
        p: { xs: 1.5, sm: 2.5 },
        display: "flex",
        alignItems: "center",
        gap: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        flexWrap: "wrap",
      }}>
        <Lock fontSize="small" color="secondary" />
        <Typography sx={{ flex: 1, minWidth: 140, fontWeight: 600, fontSize: { xs: 14, sm: 15 } }}>
          Private vote
          {decision?.winner === "magicblock-tee" ? " (TEE)" : isTeeWrapped ? " (TEE)" : ""}
          — #{transactionIndex.toString()}
        </Typography>
        <PhaseChip phase={ph} loading={loading} />
        <IconButton size="small" onClick={onClose} sx={{ ml: "auto" }}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ p: { xs: 1.75, sm: 2.5 }, overflow: "auto", flex: 1 }}>
        <PrivacyTierCallout decision={decision} />
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          {ph === "uninitialized" && (
            <SetupForm
              multisig={multisig}
              transactionIndex={transactionIndex}
              creator={publicKey}
              submit={submit}
              busy={busy}
            />
          )}
          {ph === "needsPoll" && (
            <NeedsPollPanel
              multisig={multisig}
              transactionIndex={transactionIndex}
              payer={publicKey}
              submit={submit}
              busy={busy}
            />
          )}
          {ph === "voting" && state && (
            <VotingPanel
              state={state}
              multisig={multisig}
              transactionIndex={transactionIndex}
              voter={publicKey}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              refresh={refresh}
            />
          )}
          {ph === "needsFinalize" && (
            <NeedsFinalizePanel
              multisig={multisig}
              transactionIndex={transactionIndex}
              payer={publicKey}
              submit={submit}
              busy={busy}
            />
          )}
          {ph === "approved" && (
            <ApprovedPanel
              multisig={multisig}
              transactionIndex={transactionIndex}
              trigger={publicKey}
              submit={submit}
              busy={busy}
            />
          )}
          {ph === "rejected" && (
            <Alert severity="error" icon={<Cancel />}>
              Encrypted tally fell short of the threshold. This proposal is rejected.
            </Alert>
          )}
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={onClose} size="small">Close</Button>
      </Box>
    </Drawer>
  );
}

function PrivacyTierCallout({ decision }: { decision: RoutingDecision | null }) {
  if (!decision?.winner) {
    return (
      <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: "rgba(255,0,0,0.06)", border: "1px solid rgba(255,0,0,0.2)" }}>
        <Typography sx={{ fontSize: 12, color: "error.main", fontWeight: 600 }}>
          No private backend available for vote on this vault right now.
        </Typography>
      </Box>
    );
  }

  const meta = getMeta(decision.winner);
  const score = decision.scores.find((s) => s.backendId === decision.winner);
  const isLowTrust = meta.privacyScore < 60 || meta.trustNotes.some(n => n.toLowerCase().includes("not yet wired"));

  const bg = isLowTrust
    ? "rgba(255,165,0,0.08)"
    : "rgba(34,211,238,0.06)";
  const border = isLowTrust
    ? "1px solid rgba(255,165,0,0.35)"
    : "1px solid rgba(34,211,238,0.2)";

  return (
    <Box sx={{ mb: 2, p: { xs: 1.25, sm: 1.5 }, borderRadius: 1, bgcolor: bg, border }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 600, letterSpacing: 0.5 }}>
          PRIVACY TIER
        </Typography>
        <Chip
          size="small"
          label={`${meta.displayName} (${meta.privacyScore})`}
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 700,
            bgcolor: isLowTrust ? "warning.main" : "primary.main",
            color: "background.paper",
          }}
        />
        {score && (
          <Typography sx={{ fontSize: 10, color: "text.secondary", ml: "auto" }}>
            {score.expectedLatencyMs < 1000 ? "~" + Math.round(score.expectedLatencyMs) + "ms" : "~" + (score.expectedLatencyMs / 1000).toFixed(0) + "s"} • est. route
          </Typography>
        )}
      </Stack>

      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.75 }}>
        {meta.trustModel === "mpc" && "Individual votes encrypted via MPC. Only the aggregate result is revealed on-chain."}
        {meta.trustModel === "tee" && "Vote execution happens inside attested TEE (Intel TDX). Tally committed on-chain after finalization."}
        {meta.trustModel === "validators" && "Privacy limited to what the native primitive provides (amounts or balances)."}
        {!["mpc", "tee", "validators"].includes(meta.trustModel) && "Privacy properties depend on the selected backend."}
      </Typography>

      {/* Honest trust notes — especially important for TEE while lifecycle is still being wired */}
      {meta.trustNotes.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          {meta.trustNotes.slice(0, 2).map((note, i) => (
            <Typography
              key={i}
              sx={{
                fontSize: 11,
                color: isLowTrust ? "warning.main" : "text.secondary",
                display: "flex",
                gap: 0.5,
                alignItems: "flex-start",
              }}
            >
              <span style={{ opacity: 0.7 }}>•</span> {note}
            </Typography>
          ))}
          {meta.trustNotes.length > 2 && (
            <Typography sx={{ fontSize: 10, color: "text.disabled", mt: 0.25 }}>
              +{meta.trustNotes.length - 2} more notes in registry
            </Typography>
          )}
        </Box>
      )}

      {isLowTrust && (
        <Typography sx={{ fontSize: 11, color: "warning.main", mt: 0.75, fontWeight: 500 }}>
          This route is currently gated / lower confidence. Do not assume full privacy until the registry score and lifecycle are green.
        </Typography>
      )}
    </Box>
  );
}

function PhaseChip({ phase, loading }: { phase: LifecyclePhase; loading: boolean }) {
  const label =
    phase === "uninitialized" ? "Not setup"
    : phase === "needsPoll" ? "Awaiting poll"
    : phase === "voting" ? "Voting"
    : phase === "needsFinalize" ? "Ready to finalize"
    : phase === "approved" ? "Approved"
    : "Rejected";
  const color: Record<LifecyclePhase, "default" | "warning" | "info" | "success" | "error"> = {
    uninitialized: "default",
    needsPoll: "warning",
    voting: "info",
    needsFinalize: "info",
    approved: "success",
    rejected: "error",
  };
  return (
    <Chip size="small" label={loading ? `${label}…` : label} color={color[phase]} />
  );
}

function SetupForm({
  multisig,
  transactionIndex,
  creator,
  submit,
  busy,
}: {
  multisig: PublicKey;
  transactionIndex: bigint;
  creator: PublicKey | null;
  submit: (builder: () => Promise<VersionedTransaction>, label: string) => Promise<void>;
  busy: string | null;
}) {
  const { connection } = useConnection();
  const [membersText, setMembersText] = useState("");
  const [threshold, setThreshold] = useState("2");

  const members = membersText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const valid =
    creator &&
    members.length >= 1 &&
    members.length <= 8 &&
    Number(threshold) >= 1 &&
    Number(threshold) <= members.length &&
    members.every((m) => {
      try {
        new PublicKey(m);
        return true;
      } catch {
        return false;
      }
    });

  return (
    <>
      <Typography sx={{ color: "text.secondary" }}>
        Configure the private quorum for this proposal. Each member's vote is encrypted
        end-to-end — only the final verdict reveals once the threshold is hit.
      </Typography>
      <TextField
        multiline
        minRows={3}
        label="Members (one Solana address per line, up to 8)"
        value={membersText}
        onChange={(e) => setMembersText(e.target.value)}
        fullWidth
      />
      <TextField
        type="number"
        label="Threshold"
        value={threshold}
        onChange={(e) => setThreshold(e.target.value)}
        sx={{ width: 160 }}
      />
      <Button
        fullWidth
        variant="contained"
        disabled={!valid || busy !== null}
        onClick={() =>
          submit(
            () =>
              buildInitPrivateVoteTx({
                connection,
                creator: creator!,
                multisig,
                transactionIndex,
                threshold: Number(threshold),
                members: members.map((m) => new PublicKey(m)),
              }),
            "setup",
          )
        }
        sx={{ py: { xs: 1.25, sm: 0.875 } }}
      >
        {busy === "setup" ? "Submitting…" : "Setup private vote"}
      </Button>
    </>
  );
}

function NeedsPollPanel({
  multisig,
  transactionIndex,
  payer,
  submit,
  busy,
}: {
  multisig: PublicKey;
  transactionIndex: bigint;
  payer: PublicKey | null;
  submit: (builder: () => Promise<VersionedTransaction>, label: string) => Promise<void>;
  busy: string | null;
}) {
  const { connection } = useConnection();
  return (
    <>
      <Typography sx={{ color: "text.secondary" }}>
        Mint the initial encrypted tally (yes=0, no=0). Runs once per proposal inside MPC,
        then the encrypted state lives on-chain until votes come in.
      </Typography>
      {busy === "init_poll" && <LinearProgress />}
      <Button
        fullWidth
        variant="contained"
        disabled={!payer || busy !== null}
        onClick={() =>
          submit(
            () =>
              buildInitPollTx({
                connection,
                payer: payer!,
                multisig,
                transactionIndex,
              }),
            "init_poll",
          )
        }
        startIcon={<Bolt />}
        sx={{ py: { xs: 1.25, sm: 0.875 } }}
      >
        {busy === "init_poll" ? "Waiting for MPC…" : "Initialize poll"}
      </Button>
    </>
  );
}

function VotingPanel({
  state,
  multisig,
  transactionIndex,
  voter,
  busy,
  setBusy,
  setError,
  refresh,
}: {
  state: PrivateVoteState;
  multisig: PublicKey;
  transactionIndex: bigint;
  voter: PublicKey | null;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (s: string | null) => void;
  refresh: () => Promise<void>;
}) {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const [decision, setDecision] = useState<RoutingDecision | null>(null);

  const isMember = voter && state.members.some((m) => m.equals(voter));
  const voted = voter ? hasVoted(state, voter) : false;
  const votedCount = countBits(state.votedBitmap);

  // Resolve a routing decision once per (voter, proposal) so the user sees the
  // backend choice before they click "Vote Yes" / "Vote No".
  useEffect(() => {
    if (!voter || !isMember || voted) return;
    let cancelled = false;
    (async () => {
      try {
        const agg = await getAggregator(connection);
        const d = await agg.route(
          {
            type: "vote",
            multisig,
            transactionIndex,
            choice: true, // choice doesn't affect routing
            voter,
          },
          undefined,
          { signer: voter },
        );
        if (!cancelled) setDecision(d);
      } catch {
        // routing display is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [voter, isMember, voted, connection, multisig, transactionIndex]);

  async function castVote(choice: boolean) {
    if (!voter) return;
    setError(null);
    setBusy(choice ? "vote_yes" : "vote_no");
    try {
      const agg = await getAggregator(connection);
      const { result } = await agg.execute(
        {
          type: "vote",
          multisig,
          transactionIndex,
          choice,
          voter,
        },
        voter,
        async (tx) => {
          const sig = await sendTransaction(tx, connection);
          await connection.confirmTransaction(sig, "confirmed");
          if (multisig) invalidateAfterTx(multisig.vault);
          return sig;
        },
      );
      void result;
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
          {votedCount} of {state.memberCount} members have voted • threshold {state.threshold}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, (votedCount / state.memberCount) * 100)}
      />
      {!isMember && (
        <Alert severity="info">
          Your wallet isn't on this proposal's member list. Connect a member wallet to vote.
        </Alert>
      )}
      {isMember && voted && (
        <Alert severity="success">You've already voted. Waiting on the rest.</Alert>
      )}
      {isMember && !voted && decision && <RoutingDisplay decision={decision} />}
      {isMember && !voted && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            startIcon={<CheckCircle />}
            disabled={busy !== null}
            onClick={() => castVote(true)}
            sx={{ py: { xs: 1.25, sm: 0.75 } }}
          >
            {busy === "vote_yes" ? "Sending…" : "Vote Yes"}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            color="error"
            startIcon={<Cancel />}
            disabled={busy !== null}
            onClick={() => castVote(false)}
            sx={{ py: { xs: 1.25, sm: 0.75 } }}
          >
            {busy === "vote_no" ? "Sending…" : "Vote No"}
          </Button>
        </Stack>
      )}
    </>
  );
}

function NeedsFinalizePanel({
  multisig,
  transactionIndex,
  payer,
  submit,
  busy,
}: {
  multisig: PublicKey;
  transactionIndex: bigint;
  payer: PublicKey | null;
  submit: (builder: () => Promise<VersionedTransaction>, label: string) => Promise<void>;
  busy: string | null;
}) {
  const { connection } = useConnection();
  return (
    <>
      <Typography sx={{ color: "text.secondary" }}>
        All members have voted. Reveal the verdict (approved / rejected) — only the
        aggregate is decrypted, individual votes stay hidden forever.
      </Typography>
      {busy === "finalize" && <LinearProgress />}
      <Button
        fullWidth
        variant="contained"
        disabled={!payer || busy !== null}
        onClick={() =>
          submit(
            () =>
              buildTryFinalizeTx({
                connection,
                payer: payer!,
                multisig,
                transactionIndex,
              }),
            "finalize",
          )
        }
        startIcon={<Bolt />}
        sx={{ py: { xs: 1.25, sm: 0.875 } }}
      >
        {busy === "finalize" ? "Waiting for MPC…" : "Reveal result"}
      </Button>
    </>
  );
}

function ApprovedPanel({
  multisig,
  transactionIndex,
  trigger,
  submit,
  busy,
}: {
  multisig: PublicKey;
  transactionIndex: bigint;
  trigger: PublicKey | null;
  submit: (builder: () => Promise<VersionedTransaction>, label: string) => Promise<void>;
  busy: string | null;
}) {
  const { connection } = useConnection();
  return (
    <>
      <Alert severity="success" icon={<CheckCircle />}>
        Encrypted tally cleared the threshold. The wrapper PDA can now sign the
        proposal approval.
      </Alert>
      <Button
        fullWidth
        variant="contained"
        color="primary"
        disabled={!trigger || busy !== null}
        onClick={() =>
          submit(
            () =>
              buildCpiProposalApproveTx({
                connection,
                trigger: trigger!,
                multisigPda: multisig,
                transactionIndex,
              }),
            "cpi_approve",
          )
        }
        sx={{ py: { xs: 1.25, sm: 0.875 } }}
      >
        {busy === "cpi_approve" ? "Submitting…" : "Submit approval"}
      </Button>
    </>
  );
}

function countBits(n: bigint): number {
  let count = 0;
  let v = n;
  while (v > 0n) {
    if ((v & 1n) === 1n) count += 1;
    v >>= 1n;
  }
  return count;
}
