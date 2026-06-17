"use client";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Box,
  CircularProgress,
  Avatar,
  Alert,
  Chip,
  Stack,
  Snackbar,
} from "@mui/material";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMultisig } from "@/components/MultisigContext";
import { loadAssets, totalUsd, type AssetRow } from "@/lib/assets";
import { getDeFiPositionApps, type DefiApp } from "@/lib/defi-apps";
import { fetchDeFiPositions } from "@/lib/defi-positions/fetch";
import { DeFiPosition } from "@/lib/defi-positions/types";
import PrivacyModeControl, { PRIVATE_BACKEND_ID } from "@/components/PrivacyModeControl";
import { hasLiveShield } from "@/lib/privacy-protocols";
import { invalidateAfterTx } from "@/lib/rpc-cache";

export default function AssetsPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { mode, activeOwner, multisig, refresh } = useMultisig();
  // Is any shield backend actually live + verified? Drives the toggle's enabled
  // state (Umbra is currently gated in-development → false).
  const shieldAvailable = hasLiveShield();
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [defiPositions, setDefiPositions] = useState<DeFiPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-asset shield selection (backend id, or null = public). Reflects the
  // toggle state; only stays "private" after the compress tx is submitted.
  const [shield, setShield] = useState<Record<string, string | null>>({});
  // Mint currently being compressed (drives the spinner / disabled state).
  const [pendingMint, setPendingMint] = useState<string | null>(null);
  // Toast for compress success / errors.
  const [toast, setToast] = useState<{ severity: "success" | "error" | "info"; msg: string } | null>(null);

  // Flip a single asset's toggle to Public. Used to revert on any failure so a
  // failed compress never leaves a misleading "Private" chip.
  function revertToPublic(mint: string) {
    setShield((s) => ({ ...s, [mint]: null }));
  }

  // Driven by the PrivacyModeControl onChange. id===PRIVATE_BACKEND_ID means the
  // user just flipped this asset to Private → actually compress it.
  async function handlePrivacyToggle(row: AssetRow, id: string | null) {
    const turningOn = id != null;
    // Prior toggle state — restore it if the shield/unshield fails so the chip
    // never lies about whether the asset is actually shielded.
    const priorId = turningOn ? null : PRIVATE_BACKEND_ID;

    // Hard gate: never route through a shield backend that isn't live + verified.
    // The toggle is also visually disabled, but this is the enforcement point.
    if (turningOn && !hasLiveShield()) {
      setToast({ severity: "info", msg: "Private shielding isn't available yet — coming once the Umbra path is verified." });
      return;
    }

    // Optimistically reflect the toggle; we revert on failure.
    setShield((s) => ({ ...s, [row.mint]: id }));

    if (!activeOwner || !publicKey) {
      setToast({ severity: "error", msg: "Connect a wallet first." });
      setShield((s) => ({ ...s, [row.mint]: priorId }));
      return;
    }
    // Umbra uses the connected wallet as its signer (it derives the master seed
    // via signMessage), so shielding is personal-mode only — a vault PDA can't
    // sign that. Block vault mode cleanly rather than fail mid-flow.
    if (mode !== "personal") {
      setToast({ severity: "error", msg: "Umbra shielding is available in personal mode only for now." });
      setShield((s) => ({ ...s, [row.mint]: priorId }));
      return;
    }

    // Exact on-chain base units — never the lossy display float.
    const amountBase = BigInt(row.amountBaseUnits);
    if (amountBase <= 0n) {
      setToast({ severity: "info", msg: "Nothing to shield — zero balance." });
      setShield((s) => ({ ...s, [row.mint]: priorId }));
      return;
    }

    setPendingMint(row.mint);
    try {
      // Dynamic import keeps the heavy Umbra + snarkjs bundle client-only and
      // lazy (never in the server bundle, only loaded when a user shields).
      const { umbraShield, umbraUnshield } = await import("@/lib/umbra-shield");
      const params = {
        ownerBase58: publicKey.toBase58(),
        mintBase58: row.mint,
        amountBaseUnits: amountBase,
      };
      if (turningOn) {
        await umbraShield(params);
        setToast({ severity: "success", msg: `Shielded ${row.symbol} via Umbra.` });
      } else {
        await umbraUnshield(params);
        setToast({ severity: "success", msg: `Unshielded ${row.symbol} — back in your public balance.` });
      }
      invalidateAfterTx(publicKey);
    } catch (e) {
      setToast({ severity: "error", msg: e instanceof Error ? e.message : String(e) });
      setShield((s) => ({ ...s, [row.mint]: priorId }));
    } finally {
      setPendingMint(null);
    }
  }

  useEffect(() => {
    if (!activeOwner) return;

    let cancelled = false;
    setRows(null);
    setDefiPositions(null);
    setError(null);

    (async () => {
      try {
        const [assets, positions] = await Promise.all([
          loadAssets(connection, activeOwner),
          fetchDeFiPositions(activeOwner),
        ]);
        if (!cancelled) {
          setRows(assets);
          setDefiPositions(positions);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, activeOwner]);

  if (!activeOwner) {
    return <Alert severity="info">Connect a wallet or load a vault to view assets.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Assets</Typography>
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, mb: 2 }}>
            <Typography sx={{ color: "text.secondary" }}>Total assets value</Typography>
            <Typography variant="h2">
              {rows ? `$${totalUsd(rows).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
            </Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!rows && !error && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          )}
          {rows && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Asset</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell align="right">24h</TableCell>
                  <TableCell align="right">Privacy</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const ch = r.priceChange24h;
                  const chColor = ch != null ? (ch >= 0 ? "success.main" : "error.main") : "text.secondary";
                  return (
                    <TableRow key={r.mint}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Avatar src={r.logoURI} sx={{ width: 28, height: 28 }}>
                            {r.symbol[0]}
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 600 }}>{r.name && r.name !== "Unknown" ? r.name : r.symbol}</Typography>
                            <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                              {r.symbol}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {r.priceUsd != null
                          ? `$${r.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                          : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {r.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {r.symbol}
                      </TableCell>
                      <TableCell align="right">
                        {r.valueUsd != null
                          ? `$${r.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell align="right" sx={{ color: chColor }}>
                        {ch != null ? `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%` : "—"}
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
                          {pendingMint === r.mint && <CircularProgress size={16} />}
                          <PrivacyModeControl
                            value={shield[r.mint] ?? null}
                            disabled={!shieldAvailable}
                            onChange={(id) => { if (pendingMint == null) void handlePrivacyToggle(r, id); }}
                          />
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* DeFi Positions */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, mb: 2 }}>
            <Typography sx={{ color: "text.secondary" }}>DeFi Positions</Typography>
            <Typography variant="h6" sx={{ color: "text.secondary" }}>
              {defiPositions ? defiPositions.length : 0}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
              Total DeFi value
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {defiPositions
                ? `$${defiPositions.reduce((sum, p) => sum + Math.abs(p.valueUsd), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "$0"}
            </Typography>
          </Box>

          {!defiPositions ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : defiPositions.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Protocol</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell align="right">PnL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {defiPositions.map((pos) => (
                  <TableRow key={pos.id}>
                    <TableCell sx={{ fontWeight: 500 }}>{pos.protocol}</TableCell>
                    <TableCell>
                      <Chip label={pos.type} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                    </TableCell>
                    <TableCell>{pos.position}</TableCell>
                    <TableCell align="right">
                      ${Math.abs(pos.valueUsd).toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ color: (pos.pnlUsd ?? 0) >= 0 ? "success.main" : "error.main" }}>
                      {pos.pnlUsd != null ? `${pos.pnlUsd >= 0 ? "+" : ""}$${pos.pnlUsd}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            // Empty state with supported protocols
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Protocol</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell align="right">PnL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4 }}>
                    <Box sx={{ textAlign: "center", mb: 2 }}>
                      <Typography sx={{ color: "text.secondary", mb: 1.5 }}>
                        No active DeFi positions yet.
                      </Typography>
                      <Typography variant="body2" sx={{ color: "text.disabled", mb: 1.5 }}>
                        Supported protocols
                      </Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "center" }}>
                        {getDeFiPositionApps().map((app: DefiApp) => (
                          <Chip
                            key={app.name}
                            label={app.name}
                            size="small"
                            sx={{
                              bgcolor: "rgba(255,255,255,0.06)",
                              fontSize: 12,
                              height: 24,
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>
                    <Typography variant="caption" sx={{ color: "text.disabled", display: "block", textAlign: "center" }}>
                      Kamino is live. More protocols (Drift, Save, Marginfi...) coming soon.
                      <br />
                      Add new apps in <code>lib/defi-apps.ts</code>.
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Snackbar
        open={toast != null}
        autoHideDuration={8000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert onClose={() => setToast(null)} severity={toast.severity} sx={{ width: "100%" }}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
