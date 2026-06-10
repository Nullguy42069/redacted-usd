"use client";
import { Box, Card, CardContent, Typography, Button, Stack, Alert, Avatar } from "@mui/material";
import { ArrowUpward, ArrowDownward, SwapHoriz } from "@mui/icons-material";
import { useMultisig } from "@/components/MultisigContext";
import { shortAddress } from "@/lib/squads";
import { SendDialog } from "@/components/SendDialog";
import { ReceiveDialog } from "@/components/ReceiveDialog";
import { VaultsListPage } from "@/components/VaultsListPage";
import { Watchlist } from "@/components/Watchlist";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { loadAssets, totalUsd, type AssetRow } from "@/lib/assets";

export default function OverviewPage() {
  const { multisig, error, loading, mode, activeOwner, personalPublicKey } = useMultisig();
  const { connection } = useConnection();
  const [sendOpen, setSendOpen] = useState(false);
  const [recvOpen, setRecvOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[] | null>(null);

  useEffect(() => {
    if (!activeOwner) {
      setAssets(null);
      return;
    }
    let cancelled = false;
    setAssets(null);
    loadAssets(connection, activeOwner)
      .then((rows) => { if (!cancelled) setAssets(rows); })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [activeOwner, connection]);

  // Only force the vaults list when in vault mode and no vault is selected.
  // In personal mode (or when a vault is loaded), we can use the site with the connected wallet.
  if (mode === 'vault' && !multisig) {
    return (
      <>
        <VaultsListPage />
        {loading && (
          <Typography sx={{ textAlign: "center", color: "text.secondary", mt: 2 }}>
            Loading…
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ maxWidth: 560, mx: "auto", mt: 2 }}>
            {error}
          </Alert>
        )}
      </>
    );
  }

  if (!activeOwner) {
    return (
      <Typography sx={{ color: 'text.secondary', textAlign: 'center', mt: 4 }}>
        Connect a wallet to use the site in personal mode, or select a vault.
      </Typography>
    );
  }

  const isPersonal = mode === 'personal';
  const displayAddress = isPersonal ? personalPublicKey : (multisig ? multisig.address : null);
  // For personal mode the SOL amount comes from the assets list (first row is SOL).
  const sol = isPersonal
    ? (assets && assets[0] && assets[0].mint === 'So11111111111111111111111111111111111111112' ? assets[0].amount : 0)
    : (multisig ? multisig.vaultLamports / 1e9 : 0);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 3,
        alignItems: { md: "flex-start" },
        height: "100%",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack spacing={3}>
          {/* Safe-style top balance + actions — now more Phantom-like for Wallet mode */}
          <Box>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>
              Total balance
            </Typography>
            <Typography variant="h1" sx={{ fontWeight: 700, lineHeight: 1, fontSize: { xs: 36, sm: 42 } }}>
              {assets
                ? `$${totalUsd(assets).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : "—"}
            </Typography>
            {/* Show SOL balance only if > 0 (avoids "0 SOL" clutter when wallet holds mostly tokens) */}
            {assets && sol > 0 && (
              <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.5 }}>
                {sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL
              </Typography>
            )}

            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<ArrowUpward />}
                onClick={() => setSendOpen(true)}
                sx={{ px: 3 }}
              >
                Send
              </Button>
              <Button variant="outlined" startIcon={<ArrowDownward />} onClick={() => setRecvOpen(true)}>
                Receive
              </Button>
              <Button variant="outlined" startIcon={<SwapHoriz />} disabled>
                Swap
              </Button>
            </Stack>
          </Box>

          {/* Top assets - Safe style */}
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2">{isPersonal ? "Tokens" : "Top assets"}</Typography>
                <Link href="/assets" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>
                  View all →
                </Link>
              </Box>

              {assets && assets.length > 0 ? (
                assets.slice(0, 6).map((asset, index) => {
                  const change = asset.priceChange24h;
                  const changeColor = change != null ? (change >= 0 ? "success.main" : "error.main") : "text.secondary";
                  const changeText = change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "";
                  return (
                    <Box
                      key={index}
                      sx={{
                        px: 2,
                        py: 1.5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: index < Math.min(assets.length, 6) - 1 ? "1px solid" : "none",
                        borderColor: "divider",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
                        <Avatar
                          src={asset.logoURI}
                          sx={{ width: 36, height: 36, fontSize: 14, flexShrink: 0 }}
                        >
                          {asset.symbol?.[0] || "?"}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }} noWrap>
                            {asset.name && asset.name !== "Unknown" ? asset.name : asset.symbol}
                          </Typography>
                          <Typography sx={{ color: "text.secondary", fontSize: 12, lineHeight: 1.2 }} noWrap>
                            {asset.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.symbol}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                          {asset.valueUsd != null
                            ? `$${asset.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                            : "—"}
                        </Typography>
                        {change != null && (
                          <Typography sx={{ color: changeColor, fontSize: 11, fontWeight: 500 }}>
                            {changeText}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })
              ) : (
                <Box sx={{ px: 2, py: 2, color: "text.secondary", fontSize: 13 }}>No assets yet</Box>
              )}
            </CardContent>
          </Card>

          {/* Top positions - Safe style (placeholder for now) */}
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2">Top positions</Typography>
                <Link href="/earn" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>
                  View all →
                </Link>
              </Box>

              <Box sx={{ px: 2, py: 2, color: "text.secondary", fontSize: 13 }}>No positions yet</Box>
            </CardContent>
          </Card>

          {/* Only show vault metadata when in vault mode */}
          {!isPersonal && multisig && (
            <Card>
              <CardContent>
                <Typography variant="h3" sx={{ mb: 2 }}>Vault</Typography>
                <Typography sx={{ fontFamily: "monospace", color: "text.secondary", wordBreak: "break-all" }}>
                  {multisig.vault.toBase58()}
                </Typography>
                <Typography sx={{ mt: 2, color: "text.secondary" }}>
                  Threshold: <b>{multisig.threshold}</b> of <b>{multisig.members.length}</b> signers
                </Typography>
                <Typography sx={{ mt: 1, color: "text.secondary" }}>
                  Next transaction index: <b>{(multisig.transactionIndex + 1n).toString()}</b>
                </Typography>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Box>

      {/* Watchlist right column — now full height of content area so boxes can stretch all the way to bottom */}
      <Box sx={{ width: { xs: "100%", md: 360 }, flexShrink: 0, height: { md: "100%" }, minHeight: { md: 520 } }}>
        <Watchlist />
      </Box>

      <SendDialog open={sendOpen} onClose={() => setSendOpen(false)} />
      <ReceiveDialog open={recvOpen} onClose={() => setRecvOpen(false)} />
    </Box>
  );
}
