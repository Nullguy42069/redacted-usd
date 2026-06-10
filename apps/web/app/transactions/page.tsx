"use client";
import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Stack,
  Chip,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import { SendDialog } from "@/components/SendDialog";
import { PrivateVotePanel } from "@/components/PrivateVotePanel";
import { isPrivateVoteWrapped } from "@/lib/privateVote";
import { isTeeVoteWrapped } from "@/lib/teeVote";
import {
  buildApprove,
  buildExecute,
  buildReject,
  isQueueStatus,
  loadTransactions,
  shortAddress,
  type ProposalStatus,
  type TxRow,
} from "@/lib/squads";
import { cachedGetSignaturesForAddress, invalidateAfterTx } from "@/lib/rpc-cache";

export default function TransactionsPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { multisig, refresh, mode, personalPublicKey } = useMultisig();
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [rows, setRows] = useState<TxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyIdx, setBusyIdx] = useState<bigint | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [privateVoteIdx, setPrivateVoteIdx] = useState<bigint | null>(null);

  // Personal wallet tx history (simple recent signatures)
  const [personalTxs, setPersonalTxs] = useState<Array<{signature: string; slot: number; blockTime: number | null | undefined; err: any}> | null>(null);

  useEffect(() => {
    if (mode !== 'vault' || !multisig) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const r = await loadTransactions(connection, multisig.address, multisig);
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, multisig, mode]);

  // Load personal wallet tx history
  useEffect(() => {
    if (mode !== 'personal' || !publicKey) return;
    let cancelled = false;
    setPersonalTxs(null);
    setError(null);
    (async () => {
      try {
        const sigInfos = await cachedGetSignaturesForAddress(connection, publicKey, { limit: 25 });
        const txs = sigInfos.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime,
          err: s.err,
        }));
        if (!cancelled) setPersonalTxs(txs as any);
        if (!cancelled) setPersonalTxs(txs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [connection, publicKey, mode]);

  if (mode === 'vault' && !multisig) return <Alert severity="info">Load a vault first.</Alert>;
  if (mode === 'personal' && !publicKey) return <Alert severity="info">Connect a wallet to view transactions.</Alert>;

  const isPersonal = mode === 'personal';

  const youAreSigner =
    !isPersonal && publicKey && multisig!.members.some((m) => m.pubkey.equals(publicKey));
  const arciumWrapped = !isPersonal && isPrivateVoteWrapped(
    multisig!.members.map((m) => m.pubkey),
    multisig!.address,
  );
  const teeWrapped = !isPersonal && isTeeVoteWrapped(
    multisig!.members.map((m) => m.pubkey),
    multisig!.address,
  );
  const wrapped = arciumWrapped || teeWrapped;

  async function act(
    idx: bigint,
    kind: "approve" | "reject" | "execute",
  ) {
    if (isPersonal || !multisig || !publicKey) return;
    setBusyIdx(idx);
    try {
      const build =
        kind === "approve" ? buildApprove : kind === "reject" ? buildReject : buildExecute;
      const tx = await build(connection, multisig.address, idx, publicKey);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      // Clear cached vault state so balances/proposals reflect the new on-chain state
      invalidateAfterTx(multisig.vault);
      refresh();
      // also refresh local list
      const r = await loadTransactions(connection, multisig.address, multisig);
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyIdx(null);
    }
  }

  const filtered = (rows ?? []).filter((r) =>
    tab === "queue" ? isQueueStatus(r.status) : !isQueueStatus(r.status),
  );

  if (isPersonal) {
    return (
      <Box>
        <Stack direction="row" sx={{ alignItems: "center", mb: 3 }}>
          <Typography variant="h2">Transactions</Typography>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" onClick={() => setSendOpen(true)}>
            New transaction
          </Button>
        </Stack>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Card>
          <CardContent sx={{ p: 0 }}>
            {!personalTxs && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            )}
            {personalTxs && personalTxs.length === 0 && (
              <Typography sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
                No recent transactions found for this wallet.
              </Typography>
            )}
            {personalTxs && personalTxs.map((tx) => (
              <Box
                key={tx.signature}
                sx={{
                  px: 3,
                  py: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Typography sx={{ fontFamily: "monospace", color: "text.secondary", width: 120, fontSize: 13 }}>
                  {shortAddress(tx.signature, 8, 8)}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : `slot ${tx.slot}`}
                </Typography>
                <Chip
                  size="small"
                  label={tx.err ? "Failed" : "Success"}
                  color={tx.err ? "error" : "success"}
                  variant="outlined"
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => window.open(`https://solscan.io/tx/${tx.signature}`, "_blank")}
                >
                  View on Solscan
                </Button>
              </Box>
            ))}
          </CardContent>
        </Card>
        <SendDialog open={sendOpen} onClose={() => setSendOpen(false)} />
      </Box>
    );
  }

  // Vault mode: multisig is guaranteed non-null here
  const m = multisig!;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", mb: 3 }}>
        <Typography variant="h2">Transactions</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={() => setSendOpen(true)}
          disabled={!youAreSigner}
        >
          New transaction
        </Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="queue" label="Queue" />
        <Tab value="history" label="History" />
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {!rows && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          )}
          {rows && filtered.length === 0 && (
            <Typography sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
              {tab === "queue" ? "No transactions to sign" : "No history yet"}
            </Typography>
          )}
          {filtered.map((r) => {
            const approvals = r.approvals.length;
            const needed = m.threshold;
            const canApprove = r.status === "Active" && youAreSigner && !alreadyVoted(r, publicKey);
            const canExecute = r.status === "Approved" && youAreSigner;
            const canReject = r.status === "Active" && youAreSigner && !alreadyVoted(r, publicKey);
            return (
              <Box
                key={r.proposalPda.toBase58()}
                sx={{
                  px: 3,
                  py: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Typography sx={{ fontFamily: "monospace", color: "text.secondary", width: 60 }}>
                  #{r.index.toString()}
                </Typography>
                <StatusChip status={r.status} />
                <KindChip kind={r.kind} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {shortAddress(r.proposalPda, 6, 6)}
                  </Typography>
                  {r.status === "Active" && (
                    <Box sx={{ mt: 1, maxWidth: 260 }}>
                      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>
                        {approvals} of {m.threshold} approvals
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, (approvals / m.threshold) * 100)}
                      />
                    </Box>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  {wrapped && r.status !== "Executed" && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setPrivateVoteIdx(r.index)}
                      disabled={busyIdx === r.index}
                    >
                      {teeWrapped ? "Private vote (TEE)" : "Private vote"}
                    </Button>
                  )}
                  {canApprove && !wrapped && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => act(r.index, "approve")}
                      disabled={busyIdx === r.index}
                    >
                      Approve
                    </Button>
                  )}
                  {canReject && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => act(r.index, "reject")}
                      disabled={busyIdx === r.index}
                    >
                      Reject
                    </Button>
                  )}
                  {canExecute && (
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={() => act(r.index, "execute")}
                      disabled={busyIdx === r.index}
                    >
                      Execute
                    </Button>
                  )}
                </Stack>
              </Box>
            );
          })}
        </CardContent>
      </Card>
      <SendDialog open={sendOpen} onClose={() => setSendOpen(false)} />
      {privateVoteIdx !== null && (
        <PrivateVotePanel
          open
          onClose={() => setPrivateVoteIdx(null)}
          multisig={m.address}
          transactionIndex={privateVoteIdx}
          isTeeWrapped={teeWrapped}
        />
      )}
    </Box>
  );
}

function alreadyVoted(r: TxRow, member: import("@solana/web3.js").PublicKey | null): boolean {
  if (!member) return false;
  return (
    r.approvals.some((a) => a.equals(member)) ||
    r.rejections.some((a) => a.equals(member)) ||
    r.cancellations.some((a) => a.equals(member))
  );
}

function StatusChip({ status }: { status: ProposalStatus }) {
  const color: Record<ProposalStatus, "default" | "warning" | "success" | "error" | "info"> = {
    Draft: "default",
    Active: "warning",
    Approved: "info",
    Executing: "info",
    Executed: "success",
    Rejected: "error",
    Cancelled: "default",
  };
  return <Chip size="small" label={status} color={color[status]} />;
}

function KindChip({ kind }: { kind: import("@/lib/squads").TxKind }) {
  const label = kind === "vault" ? "Vault tx" : kind === "config" ? "Config" : kind === "batch" ? "Batch" : "Unknown";
  // Config txs touch multisig settings — bias toward purple so users notice.
  const variant = kind === "config" ? { variant: "outlined" as const, color: "secondary" as const } : { variant: "outlined" as const };
  return <Chip size="small" label={label} {...variant} />;
}
