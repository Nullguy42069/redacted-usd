"use client";
import {
  Box, Card, CardContent, Typography, Alert, TextField, Button, MenuItem,
  Stack, IconButton, Chip, CircularProgress, Link as MuiLink, Divider, Avatar, InputAdornment,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";
import { loadAssets, type AssetRow } from "@/lib/assets";
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
import { payPercentFee, percentFeeLamports, getSolUsdPrice, feeTransferIx, tokenUsdValue } from "@/lib/fees";
import { guardJupiterSwap } from "@/lib/tx-guard";
import PrivacyModeControl, { PRIVATE_BACKEND_ID } from "@/components/PrivacyModeControl";
import { hasLiveShield } from "@/lib/privacy-protocols";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

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
  // "Private" = after the swap, shield the output token into the Umbra encrypted
  // balance. Only meaningful in personal mode (Umbra signs with the wallet) and
  // when a live shield backend exists.
  const [swapPrivate, setSwapPrivate] = useState(false);
  const [shieldMsg, setShieldMsg] = useState<string | null>(null);
  // The connected wallet/vault's actual token holdings, so the picker shows what
  // you can trade (not just presets). Loaded lazily; failures fall back to [].
  const [walletTokens, setWalletTokens] = useState<AssetRow[] | null>(null);
  useEffect(() => {
    if (!activeOwner) { setWalletTokens(null); return; }
    let cancelled = false;
    loadAssets(connection, activeOwner)
      .then((rows) => { if (!cancelled) setWalletTokens(rows); })
      .catch(() => { if (!cancelled) setWalletTokens([]); });
    return () => { cancelled = true; };
  }, [connection, activeOwner]);

  // The Private switch shields the swap OUTPUT via Umbra — only possible in
  // personal mode (Umbra needs the wallet as signer) with a live shield backend,
  // and not when the output is native SOL (Umbra shields SPL/Token-2022).
  const outputShieldable = outToken.mint !== WSOL_MINT;
  const swapShieldAvailable = isPersonal && hasLiveShield() && outputShieldable;

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
    setShieldMsg(null);
    try {
      const tx = await getSwapTransaction(quote, publicKey.toBase58());
      // Don't blind-sign the provider's tx: enforce user-only signer + Jupiter
      // program allowlist (LUT-resolved) before it reaches the wallet.
      await guardJupiterSwap(connection, tx, publicKey.toBase58());
      const s = await sendTransaction(tx, connection);
      await connection.confirmTransaction(s, "confirmed");
      setSig(s);
      // Redacted fee: 0.1% of input value, capped at $0.99, in SOL — charged
      // AFTER the swap confirms so a failed/cancelled swap is never billed.
      // Best-effort: a fee/price failure must not surface as a swap error.
      try {
        const inUsd = await tokenUsdValue(inToken.mint, Number(quote.inAmount), inToken.decimals);
        await payPercentFee(connection, sendTransaction, publicKey, inUsd);
      } catch (feeErr) {
        console.warn("[fee] swap fee skipped:", feeErr);
      }
      // Private swap: shield the OUTPUT into the Umbra encrypted balance. We read
      // the actual on-chain output-token balance (exact base units, no slippage
      // guesswork) and shield that. Best-effort — a shield failure never undoes
      // the (already-confirmed) swap; the tokens just stay public.
      if (swapPrivate && swapShieldAvailable) {
        try {
          const accs = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(outToken.mint) });
          const raw = accs.value.reduce(
            (s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount ?? "0"),
            0n,
          );
          if (raw > 0n) {
            const { umbraShield } = await import("@/lib/umbra-shield");
            await umbraShield({ ownerBase58: publicKey.toBase58(), mintBase58: outToken.mint, amountBaseUnits: raw });
            setShieldMsg(`Shielded your ${outToken.symbol} into your Umbra encrypted balance.`);
            invalidateAfterTx(publicKey);
          }
        } catch (shErr) {
          setShieldMsg(`Swap succeeded, but shielding failed: ${shErr instanceof Error ? shErr.message : String(shErr)}. Your ${outToken.symbol} is in your public balance — shield it from the Assets tab.`);
        }
      }
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
      // Redacted fee: 0.1% of input value, capped at $0.99, paid in SOL by the
      // vault, composed into the same proposal.
      const inUsd = await tokenUsdValue(inToken.mint, Number(quote.inAmount), inToken.decimals);
      const feeLamports = percentFeeLamports(inUsd, await getSolUsdPrice());
      const inner = [
        ...(feeLamports > 0 ? [feeTransferIx(multisig.vault, feeLamports)] : []),
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
              <TokenPicker token={inToken} onChange={setInToken} walletTokens={walletTokens} />
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
              <TokenPicker token={outToken} onChange={setOutToken} walletTokens={walletTokens} />
            </Stack>
          </Box>

          <Stack spacing={1} sx={{ mb: 2 }}>
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>Private — shield output via Umbra</Typography>
                <PrivacyModeControl
                  value={swapPrivate ? PRIVATE_BACKEND_ID : null}
                  disabled={!swapShieldAvailable}
                  onChange={(id) => setSwapPrivate(id != null)}
                />
              </Box>
              {!swapShieldAvailable && (
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 11, display: "block", mt: 0.25 }}>
                  {!isPersonal
                    ? "Switch to Wallet mode to shield swap output — Umbra signs with your wallet, a vault PDA can't."
                    : !outputShieldable
                      ? "Native SOL output can't be shielded — choose an SPL output token."
                      : "Shielding is unavailable right now."}
                </Typography>
              )}
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
          {shieldMsg && (
            <Alert severity={shieldMsg.startsWith("Shielded") ? "success" : "warning"} sx={{ mb: 2 }}>
              {shieldMsg}
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
              Best price across every Solana DEX.
              {!isPersonal && " Vault swaps create a proposal that needs threshold approvals to execute."}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

function TokenPicker({
  token, onChange, walletTokens,
}: {
  token: Token;
  onChange: (t: Token) => void;
  walletTokens: AssetRow[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Your actual holdings (non-zero) first, then any presets you don't already
  // hold — so the list is "what you can trade" + the common targets.
  const held: { token: Token; amount: number; logoURI?: string }[] = (walletTokens ?? [])
    .filter((r) => r.amount > 0)
    .map((r) => ({
      token: { symbol: r.symbol, name: r.name, mint: r.mint, decimals: r.decimals },
      amount: r.amount,
      logoURI: r.logoURI,
    }));
  const heldMints = new Set(held.map((h) => h.token.mint));
  const presets = SWAP_TOKEN_PRESETS.filter((p) => !heldMints.has(p.mint)).map((p) => ({ token: p, amount: 0, logoURI: undefined as string | undefined }));

  const q = query.trim().toLowerCase();
  const matches = (e: { token: Token }) =>
    !q || e.token.symbol.toLowerCase().includes(q) || e.token.name.toLowerCase().includes(q) || e.token.mint.toLowerCase().includes(q);
  const heldFiltered = held.filter(matches);
  const presetsFiltered = presets.filter(matches);

  // If the query looks like a mint address with no list match, offer it directly.
  let pastedMint: Token | null = null;
  if (q && heldFiltered.length === 0 && presetsFiltered.length === 0) {
    try { pastedMint = { symbol: query.trim().slice(0, 6), name: "Custom token", mint: new PublicKey(query.trim()).toBase58(), decimals: 6 }; } catch { pastedMint = null; }
  }

  const Row = (e: { token: Token; amount: number; logoURI?: string }) => (
    <MenuItem key={e.token.mint} onClick={() => { onChange(e.token); setOpen(false); setQuery(""); }} selected={e.token.mint === token.mint}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, width: "100%" }}>
        <Avatar src={e.logoURI} sx={{ width: 26, height: 26 }}>{e.token.symbol[0]}</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>{e.token.symbol}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>{e.token.name}</Typography>
        </Box>
        {e.amount > 0 && (
          <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 600 }}>
            {e.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </Typography>
        )}
      </Box>
    </MenuItem>
  );

  return (
    <>
      <Button variant="outlined" size="small" onClick={() => setOpen(true)} sx={{ flexShrink: 0, minWidth: 100 }}>
        {token.symbol}
      </Button>
      {open && (
        <Box
          onClick={() => { setOpen(false); setQuery(""); }}
          sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,0.6)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}
        >
          <Card onClick={(e) => e.stopPropagation()} sx={{ maxWidth: 400, width: "100%" }}>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1.5 }}>Pick a token</Typography>
              <TextField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or paste a mint address"
                size="small"
                fullWidth
                autoFocus
                slotProps={{ input: { startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) } }}
                sx={{ mb: 1.5 }}
              />
              <Box sx={{ maxHeight: 340, overflowY: "auto" }}>
                {!walletTokens && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}><CircularProgress size={20} /></Box>
                )}
                {heldFiltered.length > 0 && (
                  <>
                    <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>Your tokens</Typography>
                    {heldFiltered.map(Row)}
                  </>
                )}
                {presetsFiltered.length > 0 && (
                  <>
                    {heldFiltered.length > 0 && <Divider sx={{ my: 0.5 }} />}
                    <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>Common tokens</Typography>
                    {presetsFiltered.map(Row)}
                  </>
                )}
                {pastedMint && Row({ token: pastedMint, amount: 0 })}
                {walletTokens && heldFiltered.length === 0 && presetsFiltered.length === 0 && !pastedMint && (
                  <Typography variant="caption" sx={{ color: "text.disabled", display: "block", textAlign: "center", py: 2 }}>
                    No matching token. Paste a valid mint address to use it.
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </>
  );
}
