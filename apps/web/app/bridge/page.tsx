"use client";
import {
  Box, Card, CardContent, Typography, Alert, TextField, Button,
  Stack, Chip, CircularProgress, Link as MuiLink, IconButton, InputBase,
  Dialog, DialogContent,
} from "@mui/material";
import { SwapVert, KeyboardArrowDown, Search, Close, OpenInNew, InfoOutlined } from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import { invalidateAfterTx } from "@/lib/rpc-cache";
import {
  BRIDGE_DESTINATIONS, SOLANA_CHAIN, SOLANA_CHAIN_ID,
  getChain, getTokens,
  quoteBridge, createBridgeTx, decodeSolanaTx, inboundLink,
  toBaseUnits, fromBaseUnits,
  type DebridgeQuote, type DebridgeChain, type TokenPreset,
} from "@/lib/debridge";
import { buildProposeTransaction, loadMultisig } from "@/lib/squads";
import { getBackendIdFor, ACTIVITIES, backendsForActivity } from "@/lib/privacy-prefs";
import { useEvmWallet } from "@/components/EvmWalletContext";
import { payPercentFee, tokenUsdValue } from "@/lib/fees";
import { guardBridge } from "@/lib/tx-guard";

type Side = "pay" | "receive";

export default function BridgePage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { multisig, mode, activeOwner, refresh } = useMultisig();
  const isPersonal = mode === "personal";

  // Source = "You pay". Default Solana USDC.
  const [srcChainId, setSrcChainId] = useState<number>(SOLANA_CHAIN_ID);
  const [srcToken, setSrcToken] = useState<TokenPreset>(
    getTokens(SOLANA_CHAIN_ID).find((t) => t.symbol === "USDC")!,
  );
  // Destination = "You receive". Default Base USDC.
  const [dstChainId, setDstChainId] = useState<number>(8453);
  const [dstToken, setDstToken] = useState<TokenPreset>(
    getTokens(8453).find((t) => t.symbol === "USDC")!,
  );

  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [useCustomRecipient, setUseCustomRecipient] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<Side | null>(null);
  const [quote, setQuote] = useState<DebridgeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const srcChain = getChain(srcChainId)!;
  const dstChain = getChain(dstChainId)!;
  const isSvmSource = srcChain.vmKind === "SVM";
  const isInbound = dstChainId === SOLANA_CHAIN_ID && !isSvmSource;

  // Declare EVM wallet need to the Topbar pill. Only relevant in Wallet mode —
  // EVM source is intentionally blocked in Vault mode (a Solana multisig
  // cannot sign EVM transactions). Cleared on unmount.
  const evm = useEvmWallet();
  useEffect(() => {
    const need = !isSvmSource && isPersonal;
    evm.setRequired(need);
    return () => { evm.setRequired(false); };
  }, [isSvmSource, isPersonal]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Privacy chip — same activity pick as Send (Token transfers)
  const vaultKey = activeOwner ? activeOwner.toBase58() : "__default__";
  const privacyPickId = getBackendIdFor(vaultKey, "transfers");
  const transfersActivity = ACTIVITIES.find((a) => a.key === "transfers")!;
  const privacyPick = backendsForActivity(transfersActivity).find((b) => b.id === privacyPickId);

  // Cross-VM bridges (SVM ↔ EVM) always need a destination address — the
  // user's source-chain wallet isn't usable on the other VM. Same-VM bridges
  // (EVM → EVM) default to "send to my own address" with an opt-in toggle
  // for sending elsewhere.
  const isCrossVm = srcChain.vmKind !== dstChain.vmKind;

  // Auto-fill recipient based on destination VM. SVM dest → use the active
  // wallet/vault. EVM dest → use the connected EVM wallet (when present).
  // User can always overwrite the field manually.
  useEffect(() => {
    if (useCustomRecipient) return;
    if (dstChain.vmKind === "SVM" && activeOwner) {
      setRecipient(activeOwner.toBase58());
    } else if (dstChain.vmKind === "EVM" && evm.address) {
      setRecipient(evm.address);
    }
  }, [dstChain.vmKind, activeOwner, evm.address, useCustomRecipient]);

  const baseUnits = useMemo(
    () => toBaseUnits(amount, srcToken.decimals),
    [amount, srcToken.decimals],
  );

  // Debounced quote (only when SVM source — EVM sources are stubbed today)
  useEffect(() => {
    if (!isSvmSource || !baseUnits || baseUnits === 0n) { setQuote(null); setQuoteError(null); return; }
    setQuoting(true);
    setQuoteError(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await quoteBridge({
          srcChainTokenIn: srcToken.address,
          srcChainTokenInAmount: baseUnits,
          dstChainId,
          dstChainTokenOut: dstToken.address,
        });
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) { setQuote(null); setQuoteError(e instanceof Error ? e.message : String(e)); }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isSvmSource, baseUnits, srcToken.address, dstChainId, dstToken.address]);

  // Flip src ↔ dst (and tokens if compatible)
  const flip = () => {
    const oldSrc = { chain: srcChainId, token: srcToken };
    const oldDst = { chain: dstChainId, token: dstToken };
    setSrcChainId(oldDst.chain);
    setSrcToken(getTokens(oldDst.chain).find((t) => t.symbol === oldDst.token.symbol) ?? getTokens(oldDst.chain)[0] ?? oldDst.token);
    setDstChainId(oldSrc.chain);
    setDstToken(getTokens(oldSrc.chain).find((t) => t.symbol === oldSrc.token.symbol) ?? getTokens(oldSrc.chain)[0] ?? oldSrc.token);
    setQuote(null);
  };

  const outDisplay = quote ? fromBaseUnits(quote.estimation.dstChainTokenOut.amount, dstToken.decimals) : "";

  async function submitOutbound() {
    if (!publicKey || !baseUnits || !recipient.trim() || !isSvmSource) return;
    setSubmitting(true); setSubmitError(null); setSig(null);
    try {
      const srcAuthority = isPersonal ? publicKey.toBase58() : multisig!.vault.toBase58();
      const result = await createBridgeTx({
        srcChainTokenIn: srcToken.address,
        srcChainTokenInAmount: baseUnits,
        dstChainId,
        dstChainTokenOut: dstToken.address,
        srcChainOrderAuthorityAddress: srcAuthority,
        dstChainTokenOutRecipient: recipient.trim(),
        dstChainOrderAuthorityAddress: recipient.trim(),
      });
      const tx = decodeSolanaTx(result);
      if (isPersonal) {
        // Don't blind-sign deBridge's tx: enforce the user-only signer invariant
        // (LUT-resolved) before it reaches the wallet.
        await guardBridge(connection, tx, publicKey.toBase58());
        const s = await sendTransaction(tx, connection);
        await connection.confirmTransaction(s, "confirmed");
        setSig(s);
      } else {
        const msg = tx.message;
        // Resolve any Address Lookup Tables so LUT-loaded accounts (indexes past
        // the static keys) reconstruct correctly — otherwise the rebuilt proposal
        // instructions get undefined pubkeys / wrong writability. Use the
        // message's own isAccountWritable/isAccountSigner (LUT-aware) rather than
        // a header heuristic.
        const lookups = msg.addressTableLookups ?? [];
        const luts = await Promise.all(
          lookups.map(async (l) => {
            const res = await connection.getAddressLookupTable(l.accountKey);
            if (!res.value) {
              throw new Error(`Bridge tx references a lookup table that couldn't be loaded (${l.accountKey.toBase58()}).`);
            }
            return res.value;
          }),
        );
        const keys = msg.getAccountKeys({ addressLookupTableAccounts: luts });
        const inner = msg.compiledInstructions.map((ci) => {
          const programId = keys.get(ci.programIdIndex);
          if (!programId) throw new Error("Bridge tx has an unresolvable program account.");
          return {
            programId,
            keys: ci.accountKeyIndexes.map((idx: number) => {
              const pubkey = keys.get(idx);
              if (!pubkey) throw new Error(`Bridge tx references an unresolvable account index ${idx}.`);
              return { pubkey, isSigner: msg.isAccountSigner(idx), isWritable: msg.isAccountWritable(idx) };
            }),
            data: Buffer.from(ci.data),
          };
        });
        const view = await loadMultisig(connection, multisig!.address);
        const built = await buildProposeTransaction({
          conn: connection,
          multisigPda: multisig!.address,
          view,
          creator: publicKey,
          instructions: inner,
          memo: `Bridge ${amount} ${srcToken.symbol} → ${dstToken.symbol} on ${dstChain.shortName}`,
        });
        const s = await sendTransaction(built.tx, connection);
        await connection.confirmTransaction(s, "confirmed");
        if (multisig) invalidateAfterTx(multisig.vault);
        setSig(s); refresh();
      }
      // Redacted fee: 0.1% of the bridged value, capped at $0.99, in SOL (paid by
      // the connected Solana wallet). Charged AFTER the bridge action lands so a
      // failed/cancelled bridge is never billed. Best-effort — a fee/price
      // failure must not surface as a bridge error. EVM-sourced inbound bridges
      // have no SOL outflow here, so this applies to Solana-source only.
      try {
        const bridgedUsd = await tokenUsdValue(srcToken.address, Number(baseUnits), srcToken.decimals);
        await payPercentFee(connection, sendTransaction, publicKey, bridgedUsd);
      } catch (feeErr) {
        console.warn("[fee] bridge fee skipped:", feeErr);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const youAreSigner = publicKey && (isPersonal ||
    multisig?.members.some((m: any) => m.pubkey.equals(publicKey)));

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Bridge</Typography>

      <Card sx={{ maxWidth: 540, mx: "auto" }}>
        <CardContent>
          {/* You pay */}
          <PaySection
            label="You pay"
            balanceText="Balance: —"
            chain={srcChain}
            token={srcToken}
            amount={amount}
            onAmountChange={setAmount}
            onClickToken={() => setPickerOpen("pay")}
          />

          {/* Flip */}
          <Box sx={{ display: "flex", justifyContent: "center", my: 1 }}>
            <IconButton onClick={flip} size="small" sx={{ bgcolor: "rgba(255,255,255,0.04)", border: "1px solid", borderColor: "divider" }}>
              <SwapVert fontSize="small" />
            </IconButton>
          </Box>

          {/* You receive */}
          <PaySection
            label="You receive"
            balanceText={`Balance: 0 ${dstToken.symbol}`}
            chain={dstChain}
            token={dstToken}
            amount={outDisplay || (quoting ? "" : "0")}
            onAmountChange={() => {}}
            readOnly
            quoting={quoting}
            onClickToken={() => setPickerOpen("receive")}
          />

          {/* Meta row */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
            <Chip
              size="small"
              label={`Privacy: ${privacyPick?.displayName.split(" ")[0] ?? privacyPickId}`}
              variant="outlined"
              sx={{ fontSize: 11 }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              ETA: {quote?.order?.approximateFulfillmentDelay ? `~${Math.round(quote.order.approximateFulfillmentDelay)}s` : "—"}
            </Typography>
          </Box>

          {/* Recipient toggle */}
          <Box sx={{ mt: 2 }}>
            {/* Cross-VM bridges always need a recipient (your source-chain key
                doesn't work on the other VM). Same-VM bridges keep the
                "Trade and send to another address" opt-in. */}
            {!isCrossVm && (
              <Box
                onClick={() => setUseCustomRecipient(!useCustomRecipient)}
                sx={{
                  display: "inline-flex", alignItems: "center", gap: 0.75,
                  cursor: "pointer", color: "text.secondary",
                  fontSize: 12,
                }}
              >
                <Box
                  sx={{
                    width: 14, height: 14, borderRadius: 0.5,
                    border: "1px solid",
                    borderColor: useCustomRecipient ? "primary.main" : "divider",
                    bgcolor: useCustomRecipient ? "primary.main" : "transparent",
                    display: "grid", placeItems: "center",
                    fontSize: 10, color: "#0A0A0F", fontWeight: 700,
                  }}
                >
                  {useCustomRecipient ? "✓" : ""}
                </Box>
                Trade and send to another address
              </Box>
            )}
            {(isCrossVm || useCustomRecipient) && (
              <Box sx={{ mt: isCrossVm ? 0 : 1 }}>
                <TextField
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setUseCustomRecipient(true); }}
                  placeholder={
                    dstChain.vmKind === "SVM"
                      ? "Enter Solana address"
                      : `Enter ${dstChain.name} address (0x…)`
                  }
                  label={`Recipient on ${dstChain.name}`}
                  fullWidth
                  size="small"
                  slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 13 } } }}
                />
                {isCrossVm && (
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5, fontSize: 11 }}>
                    {dstChain.vmKind === "SVM"
                      ? "Defaults to your active wallet/vault — paste a different address to send elsewhere."
                      : evm.address
                        ? "Defaults to your connected EVM wallet — paste a different address to send elsewhere."
                        : "Connect an EVM wallet (pill above) to auto-fill, or paste any EVM address."}
                  </Typography>
                )}
              </Box>
            )}
          </Box>

          {/* Status alerts */}
          {!isSvmSource && !isPersonal && (
            <Alert severity="info" sx={{ mt: 2, fontSize: 12 }}>
              EVM source chains are only available in <b>Wallet</b> mode. Solana multisigs can&apos;t sign EVM transactions — switch to Wallet mode at the top to bridge from {srcChain.name}.
            </Alert>
          )}
          {quoteError && <Alert severity="error" sx={{ mt: 2, fontSize: 12 }}>{quoteError}</Alert>}
          {!publicKey && isSvmSource && <Alert severity="warning" sx={{ mt: 2, fontSize: 12 }}>Connect your wallet.</Alert>}
          {publicKey && !youAreSigner && !isPersonal && isSvmSource && (
            <Alert severity="error" sx={{ mt: 2, fontSize: 12 }}>Connected wallet is not a signer of this vault.</Alert>
          )}
          {submitError && <Alert severity="error" sx={{ mt: 2, fontSize: 12 }}>{submitError}</Alert>}
          {sig && (
            <Alert severity="success" sx={{ mt: 2, fontSize: 12 }}>
              {isPersonal ? "Bridge submitted: " : "Proposal created: "}
              <MuiLink href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener">view tx</MuiLink>
              {!isPersonal && ". Vote in Transactions to execute."}
            </Alert>
          )}

          {/* Main action */}
          <Box sx={{ mt: 2 }}>
            {isSvmSource ? (
              <Button
                variant="contained"
                fullWidth
                size="large"
                disabled={!publicKey || !youAreSigner || !quote || !recipient.trim() || submitting || !baseUnits || baseUnits === 0n}
                onClick={submitOutbound}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {submitting
                  ? (isPersonal ? "Submitting…" : "Submitting proposal…")
                  : (isPersonal ? "Confirm trade" : "Propose trade")}
              </Button>
            ) : !isPersonal ? (
              <Button variant="contained" fullWidth size="large" disabled>
                Switch to Wallet mode for EVM source
              </Button>
            ) : isInbound ? (
              <Button
                component="a"
                href={recipient.trim() ? inboundLink({ recipient: recipient.trim(), fromChain: srcChain, toToken: dstToken.address }) : "#"}
                target="_blank"
                rel="noopener"
                variant="contained"
                fullWidth
                size="large"
                disabled={!recipient.trim() || !evm.address}
                endIcon={<OpenInNew fontSize="small" />}
              >
                {evm.address
                  ? `Bridge ${srcChain.shortName} → Solana`
                  : "Connect EVM wallet (pill above)"}
              </Button>
            ) : (
              <Button
                component="a"
                href={recipient.trim() && evm.address
                  ? `https://app.debridge.finance/?inputChain=${srcChainId}&outputChain=${dstChainId}&inputCurrency=${srcToken.address}&outputCurrency=${dstToken.address}&recipient=${recipient.trim()}`
                  : "#"}
                target="_blank"
                rel="noopener"
                variant="contained"
                fullWidth
                size="large"
                disabled={!recipient.trim() || !evm.address}
                endIcon={<OpenInNew fontSize="small" />}
              >
                {evm.address
                  ? `Bridge ${srcChain.shortName} → ${dstChain.shortName}`
                  : "Connect EVM wallet (pill above)"}
              </Button>
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
              Once on Solana, your funds inherit the privacy backend you picked for "Token transfers".
              {!isSvmSource && " EVM source chains route through an external wallet today — native multi-chain signing ships soon."}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Token + chain selection modal */}
      <TokenChainPicker
        open={pickerOpen !== null}
        side={pickerOpen ?? "pay"}
        currentChainId={pickerOpen === "pay" ? srcChainId : dstChainId}
        onPick={(chainId, token) => {
          if (pickerOpen === "pay")     { setSrcChainId(chainId); setSrcToken(token); }
          else                          { setDstChainId(chainId); setDstToken(token); }
          setQuote(null);
          setPickerOpen(null);
        }}
        onClose={() => setPickerOpen(null)}
      />
    </Box>
  );
}

// ─── You pay / You receive panel ────────────────────────────────────────────
function PaySection({
  label, balanceText, chain, token, amount, onAmountChange, onClickToken,
  readOnly, quoting,
}: {
  label: string; balanceText: string;
  chain: DebridgeChain; token: TokenPreset;
  amount: string; onAmountChange: (v: string) => void;
  onClickToken: () => void;
  readOnly?: boolean; quoting?: boolean;
}) {
  return (
    <Box
      sx={{
        p: 2, borderRadius: 1.5,
        bgcolor: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>{balanceText}</Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button
          onClick={onClickToken}
          endIcon={<KeyboardArrowDown />}
          sx={{
            textTransform: "none",
            color: "text.primary",
            bgcolor: "rgba(255,255,255,0.04)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
            px: 1.25, py: 0.75,
            flexShrink: 0,
          }}
        >
          <ChainDot chain={chain} size={20} />
          <Box sx={{ ml: 1, textAlign: "left" }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1 }}>{token.symbol}</Typography>
            <Typography sx={{ fontSize: 9, color: "text.secondary", lineHeight: 1.1 }}>{chain.shortName}</Typography>
          </Box>
        </Button>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          {quoting && <CircularProgress size={14} sx={{ mr: 1 }} />}
          <InputBase
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0"
            readOnly={readOnly}
            sx={{
              "& input": {
                fontSize: 26, fontWeight: 600, textAlign: "right",
                p: 0, color: amount ? "text.primary" : "text.disabled",
              },
            }}
            inputProps={{ inputMode: "decimal" }}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ─── Token + chain picker modal ─────────────────────────────────────────────
function TokenChainPicker({
  open, side, currentChainId, onPick, onClose,
}: {
  open: boolean; side: Side;
  currentChainId: number;
  onPick: (chainId: number, token: TokenPreset) => void;
  onClose: () => void;
}) {
  const [chainSearch, setChainSearch] = useState("");
  const [tokenSearch, setTokenSearch] = useState("");
  const [pickedChain, setPickedChain] = useState<number>(currentChainId);

  useEffect(() => { if (open) setPickedChain(currentChainId); }, [open, currentChainId]);

  const chains = useMemo(() => {
    const q = chainSearch.toLowerCase().trim();
    if (!q) return BRIDGE_DESTINATIONS;
    return BRIDGE_DESTINATIONS.filter((c) => c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q));
  }, [chainSearch]);

  const tokens = useMemo(() => {
    const ts = getTokens(pickedChain);
    const q = tokenSearch.toLowerCase().trim();
    if (!q) return ts;
    return ts.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q));
  }, [pickedChain, tokenSearch]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h3" sx={{ fontSize: 16 }}>
          {side === "pay" ? "Select a token you pay" : "Select a token you receive"}
        </Typography>
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </Box>
      <DialogContent sx={{ p: 2 }}>
        {/* Chain search */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)", border: "1px solid", borderColor: "divider", mb: 1.5 }}>
          <Search sx={{ fontSize: 16, color: "text.secondary" }} />
          <InputBase
            value={chainSearch}
            onChange={(e) => setChainSearch(e.target.value)}
            placeholder="Search by chain name"
            sx={{ flex: 1, fontSize: 13 }}
          />
        </Box>

        {/* Chain grid */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0.75,
            mb: 2,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {chains.map((c) => {
            const active = c.id === pickedChain;
            return (
              <Box
                key={c.id}
                onClick={() => setPickedChain(c.id)}
                sx={{
                  cursor: "pointer",
                  p: 1, borderRadius: 1.5,
                  display: "flex", alignItems: "center", gap: 1,
                  bgcolor: active ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                  border: "1px solid",
                  borderColor: active ? "primary.main" : "rgba(255,255,255,0.05)",
                  transition: "all 0.12s",
                  "&:hover": { borderColor: active ? "primary.main" : "rgba(255,255,255,0.20)" },
                }}
              >
                <ChainDot chain={c} size={20} />
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{c.shortName}</Typography>
              </Box>
            );
          })}
        </Box>

        {/* Token search */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)", border: "1px solid", borderColor: "divider", mb: 1.5 }}>
          <Search sx={{ fontSize: 16, color: "text.secondary" }} />
          <InputBase
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            placeholder="Search by name or paste address"
            sx={{ flex: 1, fontSize: 13 }}
          />
        </Box>

        {/* Token list */}
        <Box sx={{ maxHeight: 280, overflowY: "auto" }}>
          {tokens.map((t) => (
            <Box
              key={t.address}
              onClick={() => onPick(pickedChain, t)}
              sx={{
                cursor: "pointer",
                p: 1, borderRadius: 1,
                display: "flex", alignItems: "center", gap: 1.25,
                "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
              }}
            >
              <TokenDot symbol={t.symbol} logoURI={t.logoURI} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t.symbol}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                  {t.name}{!t.isNative && ` · ${t.address.slice(0, 4)}…${t.address.slice(-4)}`}
                </Typography>
              </Box>
            </Box>
          ))}
          {tokens.length === 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary", fontStyle: "italic", display: "block", textAlign: "center", py: 2 }}>
              No tokens match the search. You can paste a custom address above.
            </Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tiny visuals: chain dot + token dot ────────────────────────────────────
// Both render the brand logo when available, fall back to a colored initial
// if the image fails to load (offline, CDN hiccup, missing logo).
function ChainDot({ chain, size = 18 }: { chain: DebridgeChain; size?: number }) {
  const [errored, setErrored] = useState(false);
  if (chain.logoURI && !errored) {
    return (
      <Box
        component="img"
        src={chain.logoURI}
        alt={chain.name}
        loading="lazy"
        onError={() => setErrored(true)}
        sx={{
          width: size, height: size, borderRadius: "50%",
          flexShrink: 0,
          objectFit: "cover",
          bgcolor: chain.color,                 // shows while image loads
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: "50%",
        flexShrink: 0,
        bgcolor: chain.color,
        display: "grid", placeItems: "center",
        color: "white", fontSize: Math.round(size * 0.5), fontWeight: 700,
      }}
    >
      {chain.shortName.charAt(0)}
    </Box>
  );
}

function TokenDot({ symbol, logoURI, size = 24 }: { symbol: string; logoURI?: string; size?: number }) {
  const [errored, setErrored] = useState(false);
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360;
    return h;
  }, [symbol]);
  if (logoURI && !errored) {
    return (
      <Box
        component="img"
        src={logoURI}
        alt={symbol}
        loading="lazy"
        onError={() => setErrored(true)}
        sx={{
          width: size, height: size, borderRadius: "50%",
          flexShrink: 0,
          objectFit: "cover",
          bgcolor: "rgba(255,255,255,0.04)",     // shows while image loads
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: "50%",
        flexShrink: 0,
        background: `linear-gradient(135deg, hsl(${hue},70%,55%) 0%, hsl(${(hue+60)%360},70%,45%) 100%)`,
        display: "grid", placeItems: "center",
        color: "white", fontSize: Math.round(size * 0.42), fontWeight: 700,
      }}
    >
      {symbol.charAt(0)}
    </Box>
  );
}
