"use client";
import {
  Box, Card, CardContent, Typography, Alert, TextField, Button, MenuItem,
  Stack, IconButton, Chip, CircularProgress, Link as MuiLink, Divider,
} from "@mui/material";
import { SwapVert, Settings, InfoOutlined } from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import { invalidateAfterTx } from "@/lib/rpc-cache";
import {
  SWAP_TOKEN_PRESETS,
  toBaseUnits,
  fromBaseUnits,
  getQuote,
  getSwapTransaction,
  getSwapInstructions,
  type JupiterQuote,
} from "@/lib/jupiter-swap";
import { buildProposeTransaction, loadMultisig } from "@/lib/squads";
import { getBackendIdFor, ACTIVITIES, backendsForActivity } from "@/lib/privacy-prefs";

type Token = { symbol: string; name: string; mint: string; decimals: number };

export default function SwapPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { multisig, mode, activeOwner, refresh } = useMultisig();
  const isPersonal = mode === "personal";

  const [inToken, setInToken] = useState<Token>(SWAP_TOKEN_PRESETS[0]);
  const [outToken, setOutToken] = useState<Token>(SWAP_TOKEN_PRESETS[1]);
  const [inputAmount, setInputAmount] = useState<string>("");
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [showSettings, setShowSettings] = useState(false);

  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  // Which privacy backend the user picked for dApp activity. Surfaced read-only
  // here so they can see what the swap will route through once each backend's
  // vault_transfer impl is finished. Today vault swaps go through plain Squads;
  // when Light SPL / Token-2022 confidential land, the same pick will activate.
  const vaultKey = activeOwner ? activeOwner.toBase58() : "__default__";
  const privacyPickId = getBackendIdFor(vaultKey, "dapp");
  const dappActivity = ACTIVITIES.find((a) => a.key === "dapp")!;
  const privacyPick = backendsForActivity(dappActivity).find((b) => b.id === privacyPickId);

  const baseUnits = useMemo(
    () => toBaseUnits(inputAmount, inToken.decimals),
    [inputAmount, inToken.decimals],
  );

  useEffect(() => {
    if (!baseUnits || baseUnits === 0n || inToken.mint === outToken.mint) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await getQuote({
          inputMint: inToken.mint,
          outputMint: outToken.mint,
          amount: baseUnits,
          slippageBps,
        });
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [baseUnits, inToken.mint, outToken.mint, slippageBps]);

  const flip = () => {
    setInToken(outToken);
    setOutToken(inToken);
    setQuote(null);
  };

  async function swapPersonal() {
    if (!publicKey || !quote) return;
    setSubmitting(true);
    setError(null);
    setSig(null);
    try {
      const tx = await getSwapTransaction(quote, publicKey.toBase58());
      const s = await sendTransaction(tx, connection);
      await connection.confirmTransaction(s, "confirmed");
      setSig(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function swapVault() {
    if (!publicKey || !quote || !multisig) return;
    setSubmitting(true);
    setError(null);
    setSig(null);
    try {
      const swapIxs = await getSwapInstructions(
        connection,
        quote,
        multisig.vault.toBase58(),
      );
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
        instructions: inner,
        memo: `Swap: ${fromBaseUnits(quote.inAmount, inToken.decimals)} ${inToken.symbol} → ${outToken.symbol}`,
      });
      const s = await sendTransaction(built.tx, connection);
      await connection.confirmTransaction(s, "confirmed");
      if (multisig) invalidateAfterTx(multisig.vault);
      setSig(s);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const submit = isPersonal ? swapPersonal : swapVault;
  const youAreSigner = publicKey && (isPersonal ||
    multisig?.members.some((m) => m.pubkey.equals(publicKey)));

  const outDisplay = quote ? fromBaseUnits(quote.outAmount, outToken.decimals) : "";
  const priceImpact = quote ? parseFloat(quote.priceImpactPct) * 100 : 0;
  const route = quote?.routePlan
    .map((r) => r.swapInfo.label)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" → ");

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Swap</Typography>

      <Card sx={{ maxWidth: 520, mx: "auto" }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h3">{isPersonal ? "Swap" : "Propose swap"}</Typography>
            <IconButton size="small" onClick={() => setShowSettings(!showSettings)}>
              <Settings fontSize="small" />
            </IconButton>
          </Box>

          {showSettings && (
            <Box
              sx={{
                p: 1.5, mb: 2, borderRadius: 1,
                bgcolor: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                Max slippage
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {[10, 50, 100, 300].map((bps) => (
                  <Chip
                    key={bps}
                    size="small"
                    label={`${(bps / 100).toFixed(bps < 100 ? 1 : 0)}%`}
                    variant={slippageBps === bps ? "filled" : "outlined"}
                    color={slippageBps === bps ? "primary" : "default"}
                    onClick={() => setSlippageBps(bps)}
                  />
                ))}
                <TextField
                  size="small"
                  type="number"
                  value={slippageBps / 100}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v) && v >= 0 && v <= 50) setSlippageBps(Math.round(v * 100));
                  }}
                  sx={{ width: 90 }}
                  slotProps={{ htmlInput: { step: "0.1", min: 0, max: 50 } }}
                />
                <Typography variant="caption" sx={{ color: "text.secondary" }}>%</Typography>
              </Stack>
            </Box>
          )}

          <Box
            sx={{
              p: 2, borderRadius: 1, mb: 1,
              bgcolor: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>From</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
              <TextField
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="0.0"
                fullWidth
                variant="standard"
                slotProps={{ input: { disableUnderline: true, style: { fontSize: 22, fontWeight: 600 } } }}
              />
              <TokenPicker token={inToken} onChange={setInToken} />
            </Stack>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "center", my: 0.5 }}>
            <IconButton onClick={flip} size="small" sx={{ bgcolor: "rgba(255,255,255,0.05)" }}>
              <SwapVert />
            </IconButton>
          </Box>

          <Box
            sx={{
              p: 2, borderRadius: 1, mb: 2,
              bgcolor: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>To (estimated)</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
              <Box sx={{ flex: 1, display: "flex", alignItems: "center" }}>
                {quoting && <CircularProgress size={16} sx={{ mr: 1 }} />}
                <Typography sx={{ fontSize: 22, fontWeight: 600, color: outDisplay ? "text.primary" : "text.disabled" }}>
                  {outDisplay || "0.0"}
                </Typography>
              </Box>
              <TokenPicker token={outToken} onChange={setOutToken} />
            </Stack>
          </Box>

          <Stack spacing={1} sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Privacy backend (dApp activity)</Typography>
              <Chip size="small" label={privacyPick?.displayName ?? privacyPickId} variant="outlined" />
            </Box>
            {quote && (
              <>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Rate</Typography>
                  <Typography variant="caption">
                    1 {inToken.symbol} ≈ {(parseFloat(quote.outAmount) / parseFloat(quote.inAmount) * (10 ** (inToken.decimals - outToken.decimals))).toFixed(6)} {outToken.symbol}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Price impact</Typography>
                  <Typography variant="caption" sx={{ color: priceImpact > 1 ? "warning.main" : "text.primary" }}>
                    {priceImpact.toFixed(3)}%
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Route</Typography>
                  <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: 11 }}>{route}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Min received</Typography>
                  <Typography variant="caption">
                    {fromBaseUnits(quote.otherAmountThreshold, outToken.decimals)} {outToken.symbol}
                  </Typography>
                </Box>
              </>
            )}
          </Stack>

          {quoteError && <Alert severity="error" sx={{ mb: 2 }}>{quoteError}</Alert>}
          {!publicKey && <Alert severity="warning" sx={{ mb: 2 }}>Connect your wallet to swap.</Alert>}
          {publicKey && !youAreSigner && !isPersonal && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Connected wallet is not a signer of this vault.
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {sig && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {isPersonal ? "Swap submitted: " : "Proposal created: "}
              <MuiLink href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener">
                view on Solscan
              </MuiLink>
              {!isPersonal && ". Vote from the Transactions tab to execute the swap."}
            </Alert>
          )}

          <Button
            variant="contained"
            fullWidth
            disabled={
              !publicKey || !youAreSigner || !quote || submitting ||
              !baseUnits || baseUnits === 0n
            }
            onClick={submit}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting
              ? (isPersonal ? "Swapping…" : "Submitting proposal…")
              : (isPersonal ? "Swap" : "Propose swap")}
          </Button>

          <Box
            sx={{
              mt: 2, p: 1.5, borderRadius: 1, display: "flex", gap: 1,
              bgcolor: "rgba(34,211,238,0.05)",
              border: "1px solid rgba(34,211,238,0.15)",
            }}
          >
            <InfoOutlined sx={{ color: "secondary.main", fontSize: 16, flexShrink: 0, mt: 0.25 }} />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Best price across every Solana DEX. <b>Redacted takes no swap fee.</b>
              {!isPersonal && " Vault swaps create a proposal that needs threshold approvals to execute."}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

function TokenPicker({ token, onChange }: { token: Token; onChange: (t: Token) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [customDec, setCustomDec] = useState("6");
  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={() => setOpen(true)}
        sx={{ flexShrink: 0, minWidth: 100 }}
      >
        {token.symbol}
      </Button>
      {open && (
        <Box
          onClick={() => setOpen(false)}
          sx={{
            position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,0.6)", zIndex: 1300,
            display: "flex", alignItems: "center", justifyContent: "center", p: 2,
          }}
        >
          <Card onClick={(e) => e.stopPropagation()} sx={{ maxWidth: 380, width: "100%" }}>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>Pick a token</Typography>
              <Stack spacing={0.5} sx={{ mb: 2 }}>
                {SWAP_TOKEN_PRESETS.map((t) => (
                  <MenuItem
                    key={t.mint}
                    onClick={() => { onChange(t); setOpen(false); }}
                    selected={t.mint === token.mint}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>{t.symbol}</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>{t.name}</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.disabled" }}>
                        {t.mint.slice(0, 4)}…{t.mint.slice(-4)}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
                Or paste a custom mint
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Mint address"
                  size="small"
                  fullWidth
                />
                <TextField
                  value={customDec}
                  onChange={(e) => setCustomDec(e.target.value)}
                  placeholder="Decimals"
                  size="small"
                  sx={{ width: 90 }}
                  type="number"
                />
              </Stack>
              <Button
                fullWidth
                variant="contained"
                sx={{ mt: 1.5 }}
                disabled={!custom.trim()}
                onClick={() => {
                  try {
                    new PublicKey(custom.trim());
                    onChange({
                      symbol: custom.trim().slice(0, 4),
                      name: "Custom",
                      mint: custom.trim(),
                      decimals: Math.max(0, parseInt(customDec, 10) || 0),
                    });
                    setOpen(false);
                  } catch {}
                }}
              >
                Use custom token
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}
    </>
  );
}
