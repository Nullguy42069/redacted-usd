"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Alert,
  Typography,
} from "@mui/material";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { RoutingDecision, VaultTransferIntent } from "@redacted-usd/aggregator";
import { useMultisig } from "./MultisigContext";
import { getAggregator } from "@/lib/aggregator";
import { percentFeeLamports, getSolUsdPrice, feeTransferIx, payPercentFee } from "@/lib/fees";
import { RoutingDisplay } from "./RoutingDisplay";
import { solToLamports } from "@/lib/squads";
import { policyForActivity, fallbackPolicy } from "@/lib/privacy-policy";
import { invalidateAfterTx } from "@/lib/rpc-cache";

// Send dialog goes through the aggregator: the user picks recipient + amount,
// the router scores the available vault_transfer backends, and the chosen one
// builds the proposal. Today the only mint we support here is SOL → SquadsPlain.
// Token-2022 mints will start to compete once the Token2022Confidential backend
// is implemented.
export function SendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { multisig, refresh, mode, activeOwner } = useMultisig();
  const isPersonal = mode === 'personal';
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);

  const reset = () => {
    setRecipient("");
    setAmount("");
    setMemo("");
    setError(null);
    setSig(null);
    setDecision(null);
  };

  // Resolve the recipient address once we can.
  const recipientPk = (() => {
    try {
      return new PublicKey(recipient.trim());
    } catch {
      return null;
    }
  })();

  const lamports = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return solToLamports(n);
  })();

  const intent: VaultTransferIntent | null =
    !isPersonal && multisig && publicKey && recipientPk && lamports > 0n
      ? {
          type: "vault_transfer",
          multisig: multisig.address,
          vault: multisig.vault,
          transactionIndex: multisig.transactionIndex + 1n,
          creator: publicKey,
          to: recipientPk,
          mint: null, // SOL for now
          amount: lamports,
          memo: memo.trim() || undefined,
        }
      : null;

  useEffect(() => {
    if (isPersonal || !intent || !publicKey || !multisig) {
      setDecision(null);
      return;
    }
    let cancelled = false;
    // Debounce so live simulation calls don't fire on every keystroke.
    const t = setTimeout(async () => {
      try {
        const agg = await getAggregator(connection);
        // Honor the Settings → Privacy tab pick for this vault. If the user's
        // preferred backend can't handle this intent (returns no winner), we
        // retry once with a fallback policy so Send doesn't brick.
        const vaultAddr = multisig.address.toBase58();
        const prefPolicy = policyForActivity(vaultAddr, "transfers");
        let d = await agg.route(intent, prefPolicy, { signer: publicKey });
        if (!d.winner) {
          d = await agg.route(intent, fallbackPolicy("transfers"), { signer: publicKey });
        }
        if (!cancelled) setDecision(d);
      } catch {
        if (!cancelled) setDecision(null);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    connection,
    publicKey,
    isPersonal,
    multisig?.address?.toBase58(),
    intent?.multisig?.toBase58(),
    intent?.to?.toBase58(),
    intent?.amount?.toString(),
    intent?.transactionIndex?.toString(),
  ]);

  async function submit() {
    if (!publicKey || !recipientPk || !lamports) return;
    setError(null);
    setSig(null);
    setSubmitting(true);
    try {
      if (isPersonal) {
        // Direct SOL transfer from personal wallet (no multisig, no aggregator).
        const { SystemProgram, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
        const { blockhash } = await connection.getLatestBlockhash();
        const ix = SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPk,
          lamports,
        });
        // Redacted fee: 0.1% of the transfer value, capped at $0.99, paid in SOL
        // and composed into the same transaction.
        const solUsd = await getSolUsdPrice();
        const feeLamports = percentFeeLamports((Number(lamports) / 1e9) * solUsd, solUsd);
        const msg = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions: feeLamports > 0 ? [feeTransferIx(publicKey, feeLamports), ix] : [ix],
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
        if (multisig) invalidateAfterTx(multisig.vault);
        setSig(sig);
      } else {
        if (!intent || !multisig) return;
        const agg = await getAggregator(connection);
        // Same two-policy pattern as routing: honor pick, fall back if it
        // can't handle this intent. We retry rather than failing so a stale
        // or non-applicable pick doesn't break the Send flow.
        const vaultAddr = multisig.address.toBase58();
        const prefPolicy = policyForActivity(vaultAddr, "transfers");
        let exec;
        try {
          exec = await agg.execute(intent, publicKey, async (tx) => {
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, "confirmed");
            return sig;
          }, prefPolicy);
        } catch {
          exec = await agg.execute(intent, publicKey, async (tx) => {
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, "confirmed");
            return sig;
          }, fallbackPolicy("transfers"));
        }
        const { result } = exec;
        if (multisig) invalidateAfterTx(multisig.vault);
        setSig(result.signature);
        // Redacted fee: 0.1% of the transfer value, capped at $0.99, in SOL —
        // paired tx paid by the initiating member, charged AFTER the proposal
        // lands so a failed/cancelled transfer is never billed. Best-effort.
        try {
          const feeSolUsd = await getSolUsdPrice();
          await payPercentFee(connection, sendTransaction, publicKey, (Number(intent.amount) / 1e9) * feeSolUsd);
        } catch (feeErr) {
          console.warn("[fee] vault-transfer fee skipped:", feeErr);
        }
        refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const youAreSigner =
    publicKey && (isPersonal || multisig?.members.some((m) => m.pubkey.equals(publicKey)));

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{isPersonal ? 'Send' : 'Propose transfer'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!publicKey && <Alert severity="warning">Connect your wallet to send.</Alert>}
          {publicKey && !youAreSigner && !isPersonal && (
            <Alert severity="error">
              Connected wallet is not a signer of this vault. Connect a member wallet.
            </Alert>
          )}
          <TextField
            label="Recipient"
            placeholder="Solana address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            fullWidth
          />
          <TextField
            label="Amount (SOL)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            slotProps={{ htmlInput: { min: 0, step: "any" } }}
          />
          <TextField
            label="Memo (optional)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            fullWidth
          />
          {decision && <RoutingDisplay decision={decision} />}
          {error && <Alert severity="error">{error}</Alert>}
          {sig && (
            <Alert severity="success">
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
                {sig}
              </Typography>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onClose();
            reset();
          }}
        >
          Close
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={submitting || !intent || !youAreSigner || !decision?.winner}
        >
          {submitting ? "Submitting…" : "Propose"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
