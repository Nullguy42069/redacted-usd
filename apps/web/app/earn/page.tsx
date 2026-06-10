"use client";
import {
  Box, Card, CardContent, Typography, Alert, TextField, Button, Chip,
  Stack, CircularProgress, Link as MuiLink,
} from "@mui/material";
import { TrendingUp, OpenInNew, InfoOutlined } from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import {
  activeFor, platformsFor, isoWeek, USDC_MINT, SOL_MINT,
  type EarnPlatform, type AssetKey, type RiskTier,
} from "@/lib/earn-platforms";
import {
  getQuote as jupQuote,
  getSwapTransaction,
  getSwapInstructions,
  toBaseUnits,
  fromBaseUnits,
  type JupiterQuote,
} from "@/lib/jupiter-swap";
import { buildProposeTransaction, loadMultisig } from "@/lib/squads";

export default function EarnPage() {
  const usdc = activeFor("USDC");
  const sol = activeFor("SOL");
  const perps = activeFor("PERPS");

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 1 }}>Earn</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        Highest yield on Solana, picked weekly. No referrer fee.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "1fr 1fr",
            lg: "repeat(3, 1fr)",
          },
          gap: 2,
          maxWidth: 1280, mx: "auto",
        }}
      >
        <AssetCard asset="USDC"  active={usdc}  />
        <AssetCard asset="SOL"   active={sol}   />
        <AssetCard asset="PERPS" active={perps} />
      </Box>

      <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "text.secondary", mt: 3 }}>
        Week of {isoWeek()} · Picks refresh every Monday
      </Typography>
    </Box>
  );
}

// ─── Books list + automation teaser moved to app/perps/page.tsx ────────────
function AssetCard({ asset, active }: { asset: AssetKey; active: EarnPlatform | null }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { multisig, mode, refresh } = useMultisig();
  const isPersonal = mode === "personal";

  const [amount, setAmount] = useState<string>("");
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);

  const all = useMemo(() => platformsFor(asset), [asset]);
  // Deposit input for PERPS LPs is USDC by default (most users have USDC as
  // stable capital). USDC card uses USDC. SOL card uses SOL.
  const inMint = asset === "SOL" ? SOL_MINT : USDC_MINT;
  const inDecimals = asset === "SOL" ? 9 : 6;
  const inSymbol = asset === "SOL" ? "SOL" : "USDC";
  const cardTitle =
    asset === "USDC"  ? "USDC" :
    asset === "SOL"   ? "SOL" :
                        "Perp Liquidity";
  const cardSubtitle =
    asset === "PERPS" ? "Top LP this week" : "Top pick this week";
  const isLST = !!active?.receiptMint;     // in-app deposit path
  const isExternal = !!active?.externalUrl;

  // Pull a Jupiter quote for the in-app LST deposit. Skipped for USDC (external).
  const baseUnits = useMemo(() => toBaseUnits(amount, inDecimals), [amount, inDecimals]);
  useEffect(() => {
    if (!active?.receiptMint || !baseUnits || baseUnits === 0n) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await jupQuote({
          inputMint: inMint,
          outputMint: active.receiptMint!,
          amount: baseUnits,
          slippageBps: 30,
        });
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) {
          setQuote(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [active?.receiptMint, baseUnits, inMint]);

  async function depositLst() {
    if (!publicKey || !quote || !active?.receiptMint) return;
    setSubmitting(true); setError(null); setSig(null);
    try {
      if (isPersonal) {
        const tx = await getSwapTransaction(quote, publicKey.toBase58());
        const s = await sendTransaction(tx, connection);
        await connection.confirmTransaction(s, "confirmed");
        setSig(s);
      } else {
        if (!multisig) throw new Error("No vault loaded.");
        const swapIxs = await getSwapInstructions(connection, quote, multisig.vault.toBase58());
        const inner = [
          ...swapIxs.computeBudgetInstructions,
          ...swapIxs.setupInstructions,
          swapIxs.swapInstruction,
          ...(swapIxs.cleanupInstruction ? [swapIxs.cleanupInstruction] : []),
        ];
        const view = await loadMultisig(connection, multisig.address);
        const built = await buildProposeTransaction({
          conn: connection,
          multisigPda: multisig.address,
          view,
          creator: publicKey,
          // @ts-expect-error TransactionInstruction shape matches
          instructions: inner,
          memo: `Earn: deposit ${amount} ${asset} → ${active.name}`,
        });
        const s = await sendTransaction(built.tx, connection);
        await connection.confirmTransaction(s, "confirmed");
        setSig(s);
        refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!active) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 1 }}>{asset}</Typography>
          <Alert severity="info">No active pick this week.</Alert>
        </CardContent>
      </Card>
    );
  }

  const outDisplay = quote && active.receiptDecimals
    ? fromBaseUnits(quote.outAmount, active.receiptDecimals)
    : "";
  const youAreSigner = publicKey && (isPersonal ||
    multisig?.members.some((m) => m.pubkey.equals(publicKey)));

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box>
            <Typography variant="h3">{cardTitle}</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {cardSubtitle}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
              <TrendingUp sx={{ color: "secondary.main", fontSize: 18 }} />
              <Typography sx={{ fontSize: 28, fontWeight: 700, color: "secondary.main" }}>
                {active.apy?.toFixed(1) ?? "—"}%
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>APY</Typography>
          </Box>
        </Box>

        <Box
          sx={{
            p: 1.5, borderRadius: 1, mb: 2,
            bgcolor: "rgba(124,58,237,0.05)",
            border: "1px solid rgba(124,58,237,0.20)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{active.name}</Typography>
            <RiskBadge tier={active.risk} />
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {active.blurb}
          </Typography>
        </Box>

        {/* Amount input */}
        <Box
          sx={{
            p: 2, borderRadius: 1, mb: 2,
            bgcolor: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <Typography variant="caption" sx={{ color: "text.secondary" }}>Deposit</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
            <TextField
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              fullWidth
              variant="standard"
              slotProps={{ input: { disableUnderline: true, style: { fontSize: 22, fontWeight: 600 } } }}
            />
            <Typography sx={{ fontWeight: 600 }}>{inSymbol}</Typography>
          </Stack>
          {isLST && outDisplay && (
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
              ≈ {outDisplay} {active.name.split(" ").shift()}
            </Typography>
          )}
        </Box>

        {/* Action button — in-app for LSTs, external for lending */}
        {isLST ? (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {!publicKey && <Alert severity="warning" sx={{ mb: 2 }}>Connect your wallet.</Alert>}
            {publicKey && !youAreSigner && !isPersonal && (
              <Alert severity="error" sx={{ mb: 2 }}>Connected wallet is not a signer of this vault.</Alert>
            )}
            {sig && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {isPersonal ? "Deposit submitted: " : "Proposal created: "}
                <MuiLink href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener">view on Solscan</MuiLink>
                {!isPersonal && ". Vote in Transactions to execute."}
              </Alert>
            )}
            <Button
              variant="contained"
              fullWidth
              disabled={!publicKey || !youAreSigner || !quote || submitting || !baseUnits || baseUnits === 0n}
              onClick={depositLst}
              startIcon={submitting || quoting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {submitting
                ? (isPersonal ? "Depositing…" : "Submitting proposal…")
                : (isPersonal ? `Deposit to ${active.name}` : `Propose deposit to ${active.name}`)}
            </Button>
          </>
        ) : isExternal ? (
          <Button
            component="a"
            variant="contained"
            fullWidth
            href={active.externalUrl}
            target="_blank"
            rel="noopener"
            endIcon={<OpenInNew fontSize="small" />}
          >
            Deposit at {active.name}
          </Button>
        ) : null}

        {/* See all platforms (collapsed) */}
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setShowAllPlatforms(!showAllPlatforms)}
            sx={{ color: "text.secondary" }}
          >
            {showAllPlatforms ? "Hide" : "Show"} all {asset === "PERPS" ? "perp" : asset} platforms ({all.length})
          </Button>
          {showAllPlatforms && (
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              {all.map((p) => (
                <Box
                  key={p.id}
                  sx={{
                    p: 1, borderRadius: 1,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    bgcolor: p.active ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.02)",
                    border: "1px solid",
                    borderColor: p.active ? "primary.main" : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ fontWeight: 500 }}>{p.name}</Typography>
                    {p.active && <Chip size="small" label="Active" color="primary" sx={{ height: 18 }} />}
                    <RiskBadge tier={p.risk} small />
                  </Box>
                  <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: p.active ? "secondary.main" : "text.secondary" }}>
                    {p.apy != null ? `${p.apy.toFixed(1)}%` : "—"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        <Box
          sx={{
            mt: 2, p: 1.25, borderRadius: 1, display: "flex", gap: 1,
            bgcolor: "rgba(34,211,238,0.05)",
            border: "1px solid rgba(34,211,238,0.15)",
          }}
        >
          <InfoOutlined sx={{ color: "secondary.main", fontSize: 14, flexShrink: 0, mt: 0.25 }} />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {isLST
              ? `${active.name} deposit routes through best on-chain liquidity (direct stake when cheaper than DEX, DEX when not). Funds stay in your ${isPersonal ? "wallet" : "vault"} — never custodied by Redacted.`
              : `Clicking through opens ${active.name}. Redacted recommends the platform — your deposit goes direct, no custody by us.`}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function RiskBadge({ tier, small }: { tier: RiskTier; small?: boolean }) {
  const { label, color } =
    tier === "low"    ? { label: "Audited",     color: "success" as const } :
    tier === "medium" ? { label: "Caution",     color: "warning" as const } :
                        { label: "High risk",   color: "error" as const };
  return (
    <Chip
      size="small"
      label={label}
      color={color}
      variant="outlined"
      sx={{ height: small ? 16 : 20, fontSize: small ? 9 : 11 }}
    />
  );
}
