"use client";
import {
  Box, Card, CardContent, Typography, Stack, Alert, IconButton, Snackbar,
  Tabs, Tab, Avatar, Button, Tooltip, Link as MuiLink, Switch, FormControlLabel, Chip, TextField,
} from "@mui/material";
import { ContentCopy, OpenInNew, InfoOutlined, Edit, Delete, GroupAdd } from "@mui/icons-material";
import React, { useMemo, useState } from "react";
import { useMultisig } from "@/components/MultisigContext";
import { shortAddress } from "@/lib/squads";
import { invalidateAfterTx } from "@/lib/rpc-cache";
import { ManageSignersDialog } from "@/components/ManageSignersDialog";
import { SpendingLimitDialog } from "@/components/SpendingLimitDialog";
import { TimeLockDialog } from "@/components/TimeLockDialog";
import { useThemeMode } from "@/components/ThemeModeContext";
import {
  listSpendingLimits,
  buildRemoveSpendingLimitProposal,
  loadMultisig,
  humanizeSeconds,
  type SpendingLimitView,
} from "@/lib/squads";
import { getSigner } from "@/lib/signer-store";
import { EditSignerDialog } from "@/components/EditSignerDialog";
import {
  buildExport,
  summarize,
  applyImport,
  defaultExportFilename,
  type ImportMode,
  type ImportResult,
} from "@/lib/data-export";
import {
  ENV_OVERRIDE_KEYS,
  ENV_DEFAULTS,
  SQUADS_PROGRAM_ID,
  type EnvOverrideKey,
} from "@/lib/env";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  notificationPermission,
  requestNotificationPermission,
  registerServiceWorker,
  serviceWorkerStatus,
  loadPrefs as loadNotifPrefs,
  setMasterEnabled,
  getVaultEnabled,
  setVaultEnabled,
  setEventEnabled,
  EVENT_LABEL,
  fireTestNotification,
  vaultsWithNotifications,
  vaultDisplayName,
  vaultAvatarUrl,
  type EventType,
} from "@/lib/notifications";
import { loadVaults } from "@/lib/vault-store";
import { useEffect } from "react";

// Mirrors Safe's settings nav with Redacted-specific renames:
// - Security removed for now (deferred until the on-chain recovery program ships)
// Privacy is per-transaction — the Private/Public toggle on Assets + Swap — not a
// settings tab.
const TABS = [
  "Setup",
  "Appearance",
  "Notifications",
  "Modules",
  "Data",
  "Environment",
] as const;
type TabName = typeof TABS[number];

// Redacted v1 user-facing version. The actual on-chain program ID is sourced
// from lib/env's SQUADS_PROGRAM_ID (with localStorage / env override support)
// so the Setup tab "View program" link always points to whatever is actually
// in use rather than a hard-coded constant that can drift.
const REDACTED_VERSION = "Redacted v1";

export default function SettingsPage() {
  const { multisig, mode, personalPublicKey } = useMultisig();
  const [tab, setTab] = useState<TabName>("Setup");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
  };

  if (mode === "personal") {
    return (
      <Box>
        <Typography variant="h2" sx={{ mb: 3 }}>Settings</Typography>
        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 2 }}>Personal Wallet Mode</Typography>
            <Typography sx={{ color: "text.secondary", mb: 2 }}>
              You are currently using a personal (non-multisig) wallet.
              Switch to Vault mode in the top bar to manage multisig settings, signers, and thresholds.
            </Typography>
            {personalPublicKey && (
              <Box>
                <Typography sx={{ color: "text.secondary", fontSize: 12, mb: 0.5 }}>Connected wallet</Typography>
                <Typography sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  {personalPublicKey.toBase58()}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (!multisig) return <Alert severity="info">Load a vault first.</Alert>;

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 2 }}>Settings</Typography>

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            "& .MuiTab-root": { textTransform: "none", fontSize: 14, minHeight: 40 },
            "& .Mui-selected": { color: "primary.main" },
            "& .MuiTabs-indicator": { backgroundColor: "primary.main", height: 2 },
          }}
        >
          {TABS.map((t) => <Tab key={t} value={t} label={t} />)}
        </Tabs>
      </Box>

      {tab === "Setup"        && <SetupTab onCopy={copy} />}
      {tab === "Appearance"   && <AppearanceTab />}
      {tab === "Notifications"&& <NotificationsTab onCopy={copy} />}
      {tab === "Modules"      && <ModulesTab onCopy={copy} />}
      {tab === "Data"         && <DataTab />}
      {tab === "Environment"  && <EnvironmentTab />}

      <Snackbar
        open={copied !== null}
        autoHideDuration={1500}
        onClose={() => setCopied(null)}
        message={`${copied ?? ""} copied`}
      />
    </Box>
  );
}

// ─── Setup tab ───────────────────────────────────────────────────────────────
function SetupTab({ onCopy }: { onCopy: (label: string, value: string) => void }) {
  const { multisig } = useMultisig();
  const [manageOpen, setManageOpen] = useState(false);
  const [editSignerPubkey, setEditSignerPubkey] = useState<string | null>(null);
  const [signerRefresh, setSignerRefresh] = useState(0);
  if (!multisig) return null;

  const nonce = Number(multisig.transactionIndex);
  const programUrl = `https://solscan.io/account/${SQUADS_PROGRAM_ID}`;
  const explorerAddrUrl = (a: string) => `https://solscan.io/account/${a}`;

  const exportSignersCsv = () => {
    const rows = [
      ["address", "permissions_mask"],
      ...multisig.members.map((m) => [m.pubkey.toBase58(), String(m.permissions)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signers-${multisig.address.toBase58().slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack spacing={2}>
      <SectionCard
        title="Vault nonce"
        info="The next transaction index on this vault. Increments by 1 for every proposal created."
      >
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>Current nonce</Typography>
        <Typography sx={{ fontSize: 24, fontWeight: 600 }}>{nonce}</Typography>
      </SectionCard>

      <SectionCard
        title="Voting mode"
        info="How proposal approvals are recorded on chain."
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Chip size="small" label="Public" color="default" variant="outlined" />
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Approvals are standard public votes — every signer&apos;s vote is visible on chain.
        </Typography>
      </SectionCard>

      <SectionCard title="Program version">
        <Typography sx={{ fontSize: 22, fontWeight: 600, mb: 1 }}>{REDACTED_VERSION}</Typography>
        <MuiLink
          href={programUrl}
          target="_blank"
          rel="noopener"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "primary.main", fontSize: 13 }}
        >
          View program on Solscan <OpenInNew sx={{ fontSize: 14 }} />
        </MuiLink>
        <Box
          sx={{
            mt: 2, p: 2, borderRadius: 1, display: "flex", gap: 1.5,
            bgcolor: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)",
          }}
        >
          <InfoOutlined sx={{ color: "primary.main", flexShrink: 0, mt: 0.25 }} />
          <Box>
            <Typography sx={{ fontWeight: 600, mb: 0.5 }}>You are on Redacted v1</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              v1 ships the multisig core. Redacted v2 adds the privacy layer (Umbra / Arcium shielded balances and transfers) and will be a different product entirely.
            </Typography>
          </Box>
        </Box>
      </SectionCard>

      <SectionCard
        title="Members"
        contentHeader={
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Box>
              <Typography variant="h3" sx={{ mb: 0.5 }}>Signers</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Signers have full control over the vault. They propose, sign, and execute transactions, as well as reject them.
              </Typography>
            </Box>
            <MuiLink
              component="button"
              onClick={exportSignersCsv}
              sx={{ color: "primary.main", fontSize: 13, flexShrink: 0 }}
            >
              Export as CSV
            </MuiLink>
          </Box>
        }
      >
        <Button
          startIcon={<GroupAdd />}
          variant="outlined"
          size="small"
          onClick={() => setManageOpen(true)}
          sx={{ mb: 2, alignSelf: "flex-start" }}
        >
          Manage signers
        </Button>
        <ManageSignersDialog open={manageOpen} onClose={() => setManageOpen(false)} />
        {editSignerPubkey && (
          <EditSignerDialog
            open={!!editSignerPubkey}
            onClose={() => setEditSignerPubkey(null)}
            pubkey={editSignerPubkey}
            onSaved={() => setSignerRefresh((r) => r + 1)}
          />
        )}
        <Stack spacing={1}>
          {multisig.members.map((m) => {
            const a = m.pubkey.toBase58();
            // signerRefresh keeps this expression re-evaluating after edits.
            const info = signerRefresh >= 0 ? getSigner(a) : {};
            return (
              <Box
                key={a}
                sx={{
                  display: "flex", alignItems: "center", gap: 1.5,
                  p: 1.25, borderRadius: 1,
                  bgcolor: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {info.avatar ? (
                  <Avatar src={info.avatar} sx={{ width: 32, height: 32, fontSize: 14 }}>
                    {(info.name || a)[0]?.toUpperCase()}
                  </Avatar>
                ) : (
                  <SignerAvatar address={a} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {info.name && (
                    <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }} noWrap>
                      {info.name}
                    </Typography>
                  )}
                  <Typography sx={{ fontFamily: "monospace", fontSize: 13 }}>
                    <Box component="span" sx={{ color: "text.secondary" }}>solana:</Box>
                    {shortAddress(a, 8, 8)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Permissions: {permissionsLabel(m.permissions)}
                  </Typography>
                </Box>
                <Tooltip title="Copy address"><IconButton size="small" onClick={() => onCopy("Signer", a)}>
                  <ContentCopy fontSize="small" />
                </IconButton></Tooltip>
                <Tooltip title="View on Solscan"><IconButton size="small" component="a" href={explorerAddrUrl(a)} target="_blank" rel="noopener">
                  <OpenInNew fontSize="small" />
                </IconButton></Tooltip>
                <Tooltip title="Customize name & avatar">
                  <IconButton size="small" onClick={() => setEditSignerPubkey(a)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
          Removing a signer requires a multisig vote — use <strong>Manage signers</strong> above.
        </Typography>
        <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Required confirmations</Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 600 }}>
            {multisig.threshold}
            <Box component="span" sx={{ opacity: 0.6, fontSize: "0.6em", ml: 1 }}>
              out of {multisig.members.length} signers
            </Box>
          </Typography>
        </Box>
      </SectionCard>
    </Stack>
  );
}

// ─── Environment tab ────────────────────────────────────────────────────────
// Lets users override the default Solana RPC and program IDs without
// rebuilding. Stored in localStorage. Applied on next refresh (module-scope
// env resolution happens once at import).

const ENV_FIELDS: { key: EnvOverrideKey; label: string; defaultValue: string; placeholder?: string; note?: string }[] = [
  {
    key: "rpcUrl",
    label: "Solana RPC URL",
    defaultValue: ENV_DEFAULTS.rpcUrl,
    placeholder: "https://mainnet.helius-rpc.com/?api-key=...",
    note: "Default Helius / Triton / QuickNode endpoints all work. Mainnet by default.",
  },
  {
    key: "squadsProgramId",
    label: "Multisig program ID",
    defaultValue: ENV_DEFAULTS.squadsProgramId,
    placeholder: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
    note: "Almost always the mainnet v4 program. Only change if you are testing against a custom multisig deployment.",
  },
];

function EnvironmentTab() {
  // Read once on mount so the inputs reflect what's in localStorage.
  const [values, setValues] = useState<Record<EnvOverrideKey, string>>(() => {
    const out = {} as Record<EnvOverrideKey, string>;
    for (const f of ENV_FIELDS) {
      out[f.key] = (typeof window !== "undefined"
        ? window.localStorage.getItem(ENV_OVERRIDE_KEYS[f.key])
        : null) ?? "";
    }
    return out;
  });
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Initial state (the moment the tab mounted). Used to detect "dirty" so the
  // Save button only enables when something actually changed.
  const initialRef = React.useRef(values);
  const isDirty = ENV_FIELDS.some((f) => values[f.key] !== initialRef.current[f.key]);

  const onChange = (key: EnvOverrideKey, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSavedAt(null);
  };

  const save = () => {
    if (typeof window === "undefined") return;
    for (const f of ENV_FIELDS) {
      const v = values[f.key].trim();
      if (v.length === 0) {
        window.localStorage.removeItem(ENV_OVERRIDE_KEYS[f.key]);
      } else {
        window.localStorage.setItem(ENV_OVERRIDE_KEYS[f.key], v);
      }
    }
    initialRef.current = { ...values };
    setSavedAt(new Date());
  };

  const resetAll = () => {
    if (typeof window === "undefined") return;
    const cleared = {} as Record<EnvOverrideKey, string>;
    for (const f of ENV_FIELDS) {
      window.localStorage.removeItem(ENV_OVERRIDE_KEYS[f.key]);
      cleared[f.key] = "";
    }
    setValues(cleared);
    initialRef.current = cleared;
    setSavedAt(new Date());
  };

  return (
    <Stack spacing={2}>
      <SectionCard title="Environment variables">
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Override Redacted's default endpoints and program IDs. Stored in this browser only. <b>Refresh the page after saving</b> for changes to take effect — endpoint values are resolved once at app start.
        </Typography>

        <Stack spacing={2}>
          {ENV_FIELDS.map((f) => (
            <Box key={f.key}>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{f.label}</Typography>
              <TextField
                value={values[f.key]}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                fullWidth
                size="small"
                sx={{ "& input": { fontFamily: "monospace", fontSize: 13 } }}
              />
              <Typography
                variant="caption"
                sx={{ display: "block", mt: 0.5, color: "text.secondary", fontFamily: "monospace" }}
              >
                Default: {f.defaultValue || "(none)"}
              </Typography>
              {f.note && (
                <Typography variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
                  {f.note}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>

        <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
          <Button variant="contained" onClick={save} disabled={!isDirty}>
            Save
          </Button>
          <Button variant="outlined" onClick={resetAll}>
            Reset to defaults
          </Button>
          {savedAt && (
            <Typography variant="caption" sx={{ color: "text.secondary", alignSelf: "center", ml: 1 }}>
              Saved {savedAt.toLocaleTimeString()} — refresh page to apply
            </Typography>
          )}
        </Box>
      </SectionCard>

      <SectionCard title="Currently in use" info="Resolved values this page is running with. If you save changes above, refresh to see these update.">
        <Stack spacing={1}>
          <ActiveRow label="Solana RPC" value={ENV_DEFAULTS.rpcUrl} mask />
          <ActiveRow label="Multisig program" value={SQUADS_PROGRAM_ID} />
        </Stack>
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
          API keys in RPC URLs are masked here to keep screenshots safe — but they are not secret in the cryptographic sense. They travel in every browser request to the RPC and are visible in DevTools → Network. Any abuse just costs RPC quota; nothing it can sign or steal.
        </Typography>
      </SectionCard>
    </Stack>
  );
}

// Mask any `api-key=<token>` query parameter in a URL so screenshots and
// over-the-shoulder reads don't expose the key. Not a security boundary — the
// key is visible in browser network requests — just a UX hygiene step.
function maskApiKeyInUrl(url: string): string {
  return url.replace(
    /([?&]api-key=)([^&\s]+)/i,
    (_m, prefix, key) => `${prefix}${key.slice(0, 4)}…${key.slice(-4)}`,
  );
}

function ActiveRow({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const hasApiKey = /[?&]api-key=/i.test(value || "");
  const shown = mask && hasApiKey && !revealed ? maskApiKeyInUrl(value) : value;
  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { sm: "center" }, gap: 1 }}>
      <Typography variant="body2" sx={{ color: "text.secondary", minWidth: 140 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", flex: 1 }}>
        {shown || "(unset)"}
      </Typography>
      {mask && hasApiKey && (
        <Button
          size="small"
          variant="text"
          onClick={() => setRevealed((v) => !v)}
          sx={{ minWidth: 0, py: 0, px: 1, fontSize: 11, textTransform: "none" }}
        >
          {revealed ? "Hide" : "Reveal"}
        </Button>
      )}
    </Box>
  );
}

// ─── Data tab ───────────────────────────────────────────────────────────────
// Local-data export + import. Mirrors Safe's Data tab — bundles every
// Redacted-owned localStorage key into a downloadable JSON, and round-trips
// it back via drag-and-drop or file picker.

function DataTab() {
  const [exp, setExp] = useState(() => buildExport());
  const [filename] = useState(() => defaultExportFilename());
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const summary = useMemo(() => summarize(exp), [exp]);

  const refreshExport = () => setExp(buildExport());

  const downloadExport = () => {
    const blob = new Blob([JSON.stringify(exp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setImportError(null);
    setImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const r = applyImport(parsed, importMode);
      setImportResult(r);
      refreshExport();   // re-summarize after writes
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <Stack spacing={2}>
      <SectionCard title="Data export">
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Download your local Redacted data: saved vaults, address book, watchlist customizations, notification + privacy preferences, theme. Nothing sensitive — no keys, no signatures, just preferences.
        </Typography>

        <Box
          sx={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            p: 1.5, borderRadius: 1, mb: 2,
            bgcolor: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <Box
              sx={{
                width: 32, height: 32, borderRadius: 1, flexShrink: 0,
                display: "grid", placeItems: "center",
                bgcolor: "rgba(124,58,237,0.15)",
              }}
            >
              <InfoOutlined sx={{ color: "primary.main", fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: "text.primary" }}>
              {filename}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={downloadExport}
            disabled={summary.totalKeys === 0}
          >
            Download
          </Button>
        </Box>

        <Stack spacing={0.75}>
          <ExportRow label="Saved vaults" count={summary.vaultCount} />
          <ExportRow label="Address book entries" count={summary.addressBookCount} />
          <ExportRow label="Custom dApps" count={summary.customAppsCount} />
          <ExportRow label="Per-wallet selections" count={summary.perWalletSelections} />
          <ExportRow label="Watchlist customizations" count={summary.watchlistCustomizations} />
          <ExportRow label="Total keys" count={summary.totalKeys} />
        </Stack>
      </SectionCard>

      <SectionCard title="Data import">
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Import a Redacted export from another browser or device. Drag-and-drop a JSON file, or click below to pick one.
        </Typography>

        <Box
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          sx={{
            p: 4, mb: 2, borderRadius: 1, textAlign: "center", cursor: "pointer",
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : "divider",
            bgcolor: dragOver ? "rgba(124,58,237,0.05)" : "transparent",
            transition: "all 0.15s",
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {dragOver ? "Drop to import" : (
              <>
                Drag and drop a JSON file or <Box component="span" sx={{ color: "primary.main", textDecoration: "underline" }}>choose a file</Box>
              </>
            )}
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";   // allow re-pick of the same file
            }}
          />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Mode:</Typography>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                checked={importMode === "replace"}
                onChange={(e) => setImportMode(e.target.checked ? "replace" : "merge")}
              />
            }
            label={
              <Typography variant="body2">
                {importMode === "replace" ? "Replace" : "Merge"}
              </Typography>
            }
          />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {importMode === "merge"
              ? "Skips keys already present locally. Safer."
              : "Wipes existing Redacted data before importing. Use when moving devices."}
          </Typography>
        </Box>

        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
          Only JSON files exported from Redacted can be imported.
        </Typography>

        {importError && <Alert severity="error" sx={{ mt: 2 }}>{importError}</Alert>}
        {importResult && (
          <Alert severity={importResult.errors.length ? "warning" : "success"} sx={{ mt: 2 }}>
            Applied {importResult.applied} · Skipped {importResult.skipped}
            {importMode === "replace" && ` · Removed ${importResult.removed} prior`}
            {importResult.errors.length > 0 && (
              <Box component="ul" sx={{ m: 0, mt: 1, pl: 2, fontSize: 12 }}>
                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </Box>
            )}
            <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
              Refresh the page to see imported vaults / watchlist / theme reflected in the UI.
            </Typography>
          </Alert>
        )}
      </SectionCard>
    </Stack>
  );
}

function ExportRow({ label, count }: { label: string; count: number }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{count}</Typography>
    </Box>
  );
}

// ─── Modules tab ────────────────────────────────────────────────────────────
// Solana analog of Safe's Modules + Guards + Fallback handler tab. Sections:
//   1. Spending limits  — Squads-native bounded delegation
//   2. Time lock        — global delay on all proposals
//   3. Program modules  — external programs added as multisig members
//                         (placeholder until the Recovery program ships)

function ModulesTab({ onCopy }: { onCopy: (label: string, value: string) => void }) {
  const { multisig } = useMultisig();
  const { connection } = useConnection();
  const { publicKey: connectedMember, sendTransaction } = useWallet();
  const [limits, setLimits] = useState<SpendingLimitView[]>([]);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  const [tlOpen, setTlOpen] = useState(false);
  const [removingPda, setRemovingPda] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!multisig) return;
    setLoadingLimits(true);
    setLimitsError(null);
    listSpendingLimits(connection, multisig.address)
      .then((arr) => { if (!cancelled) setLimits(arr); })
      .catch((e) => { if (!cancelled) setLimitsError(e?.message ?? String(e)); })
      .finally(() => { if (!cancelled) setLoadingLimits(false); });
    return () => { cancelled = true; };
  }, [multisig?.address.toBase58(), connection, refreshTick]);

  if (!multisig) return null;

  const removeLimit = async (pda: PublicKey) => {
    if (!connectedMember) { setRemoveError("Connect a signer wallet first."); return; }
    setRemovingPda(pda.toBase58());
    setRemoveError(null);
    try {
      const view = await loadMultisig(connection, multisig.address);
      const built = await buildRemoveSpendingLimitProposal({
        conn: connection,
        multisigPda: multisig.address,
        view,
        creator: connectedMember,
        spendingLimitPda: pda,
        memo: `Remove spending limit ${shortAddress(pda)}`,
      });
      const sig = await sendTransaction(built.tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      if (multisig) invalidateAfterTx(multisig.vault);
      setRefreshTick((t) => t + 1);
    } catch (e: any) {
      setRemoveError(e?.message ?? String(e));
    } finally {
      setRemovingPda(null);
    }
  };

  return (
    <Stack spacing={2}>
      {/* ── Spending limits ─────────────────────────────────────────── */}
      <SectionCard
        title="Spending limits"
        info="Allows specific signers to move up to a capped amount per period without a full multisig vote."
      >
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Bounded delegations. Native to the vault — useful for ops accounts that need fast spend authority without your whole multisig signing every time.
        </Typography>

        <Button
          startIcon={<GroupAdd />}
          variant="outlined"
          size="small"
          onClick={() => setSpendOpen(true)}
          sx={{ mb: 2, alignSelf: "flex-start" }}
        >
          Add spending limit
        </Button>
        <SpendingLimitDialog open={spendOpen} onClose={() => { setSpendOpen(false); setRefreshTick(t => t + 1); }} />

        {removeError && <Alert severity="error" sx={{ mb: 2 }}>{removeError}</Alert>}
        {limitsError && <Alert severity="error" sx={{ mb: 2 }}>Failed to load: {limitsError}</Alert>}
        {loadingLimits && <Typography variant="body2" sx={{ color: "text.secondary" }}>Loading…</Typography>}

        {!loadingLimits && limits.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
            No spending limits set on this vault.
          </Typography>
        )}

        <Stack spacing={1}>
          {limits.map((l) => <SpendingLimitRow key={l.pda.toBase58()} l={l} onCopy={onCopy} onRemove={removeLimit} removing={removingPda === l.pda.toBase58()} />)}
        </Stack>
      </SectionCard>

      {/* ── Time lock ───────────────────────────────────────────────── */}
      <SectionCard
        title="Time lock"
        info="Delays every proposal between approval and execution. Acts as a global safety window."
      >
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>Current</Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 600, mb: 2 }}>
          {humanizeSeconds(multisig.timeLockSeconds)}
        </Typography>
        <Button variant="outlined" size="small" onClick={() => setTlOpen(true)} sx={{ alignSelf: "flex-start" }}>
          Change time lock
        </Button>
        <TimeLockDialog open={tlOpen} onClose={() => setTlOpen(false)} />
      </SectionCard>

      {/* ── Program modules ─────────────────────────────────────────── */}
      <SectionCard
        title="Program modules"
        info="External Solana programs added as members with controlled execution paths."
      >
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          External code granted controlled access. On Solana, these are programs added as multisig members with restricted permissions.
        </Typography>
        <Box
          sx={{
            p: 2, borderRadius: 1, border: "1px dashed",
            borderColor: "divider", color: "text.secondary",
          }}
        >
          <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>None installed</Typography>
          <Typography variant="caption">
            Recovery (timelocked owner-change) and Umbra (Arcium) shielded balances will appear here as separate program modules in v2.
          </Typography>
        </Box>
      </SectionCard>
    </Stack>
  );
}

function SpendingLimitRow({
  l, onCopy, onRemove, removing,
}: {
  l: SpendingLimitView;
  onCopy: (label: string, value: string) => void;
  onRemove: (pda: PublicKey) => void;
  removing: boolean;
}) {
  const isSol = l.mint.equals(PublicKey.default);
  const mintLabel = isSol ? "SOL" : shortAddress(l.mint, 6, 6);
  // SOL has 9 decimals; without a token registry we assume 6 for non-SOL (matches USDC).
  // This is a display heuristic only — the on-chain amount is exact.
  const decimals = isSol ? 9 : 6;
  const display = (Number(l.amount) / Math.pow(10, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
  const remaining = (Number(l.remaining) / Math.pow(10, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
  const pdaStr = l.pda.toBase58();
  return (
    <Box
      sx={{
        p: 1.25, borderRadius: 1,
        bgcolor: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>
            {display} {mintLabel} · {l.periodLabel}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Remaining: {remaining} {mintLabel} · {l.members.length} signer{l.members.length === 1 ? "" : "s"} · {l.destinations.length === 0 ? "any destination" : `${l.destinations.length} destination${l.destinations.length === 1 ? "" : "s"}`}
          </Typography>
        </Box>
        <Tooltip title="Copy spending limit PDA">
          <IconButton size="small" onClick={() => onCopy("Spending limit PDA", pdaStr)}>
            <ContentCopy fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="View on Solscan">
          <IconButton size="small" component="a" href={`https://solscan.io/account/${pdaStr}`} target="_blank" rel="noopener">
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={removing ? "Submitting…" : "Remove (creates proposal)"}>
          <span>
            <IconButton size="small" onClick={() => onRemove(l.pda)} disabled={removing}>
              <Delete fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}

// ─── Notifications tab (v2) ─────────────────────────────────────────────────
function NotificationsTab({ onCopy }: { onCopy: (label: string, value: string) => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [swStatus, setSwStatus] = useState<ReturnType<typeof serviceWorkerStatus>>("registering");

  useEffect(() => {
    setPerm(notificationPermission());
    registerServiceWorker().then(() => setSwStatus(serviceWorkerStatus()));
  }, []);

  const prefs = loadNotifPrefs();
  const explorerAddrUrl = (a: string) => `https://solscan.io/account/${a}`;
  const savedVaults = loadVaults();
  const activeCount = vaultsWithNotifications().length;

  const ensurePermission = async (): Promise<boolean> => {
    const p = await requestNotificationPermission();
    setPerm(p);
    return p === "granted";
  };

  const onToggleMaster = async (next: boolean) => {
    if (next && !(await ensurePermission())) return;
    setMasterEnabled(next);
    refresh();
  };

  const onToggleVault = async (vault: string, next: boolean) => {
    if (next && !(await ensurePermission())) return;
    setVaultEnabled(vault, next);
    refresh();
  };

  const onToggleEvent = (e: EventType, next: boolean) => {
    setEventEnabled(e, next);
    refresh();
  };

  return (
    <Stack spacing={2}>
      <SectionCard title="Push notifications (v2)">
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Get a desktop notification when a vault you watch has a new proposal, when a proposal reaches the threshold, or when one executes. Notifications use the vault avatar and signer nicknames you set elsewhere.
        </Typography>

        {perm === "denied" && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Notifications are blocked at the browser level. Re-enable them for this site in your browser settings, then refresh.
          </Alert>
        )}
        {perm === "unsupported" && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Your browser doesn&apos;t support web notifications.
          </Alert>
        )}

        {/* Status row: SW + permission + active count */}
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Chip
            size="small"
            label={
              swStatus === "active" ? "Service Worker: active"
              : swStatus === "registering" ? "Service Worker: starting…"
              : swStatus === "unsupported" ? "Service Worker: unsupported"
              : "Service Worker: failed"
            }
            color={swStatus === "active" ? "success" : "default"}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Permission: ${perm}`}
            color={perm === "granted" ? "success" : perm === "denied" ? "error" : "default"}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`${activeCount} vault${activeCount === 1 ? "" : "s"} watched`}
            variant="outlined"
          />
        </Box>

        {/* Master switch */}
        <Box sx={{ p: 2, borderRadius: 1, bgcolor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>All notifications</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Master switch. Turn off to mute everything without losing per-vault picks.
            </Typography>
          </Box>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                checked={prefs.enabled && perm === "granted"}
                disabled={perm === "denied" || perm === "unsupported"}
                onChange={(e) => onToggleMaster(e.target.checked)}
              />
            }
            label={<Typography variant="caption">{prefs.enabled && perm === "granted" ? "On" : "Off"}</Typography>}
          />
        </Box>

        {/* Event type prefs */}
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
          Notify me when…
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {(Object.keys(EVENT_LABEL) as EventType[]).map((ev) => (
            <Box key={ev} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 0.5 }}>
              <Typography variant="body2">{EVENT_LABEL[ev]}</Typography>
              <Switch
                size="small"
                checked={prefs.events[ev]}
                disabled={!prefs.enabled || perm !== "granted"}
                onChange={(e) => onToggleEvent(ev, e.target.checked)}
              />
            </Box>
          ))}
        </Stack>

        {/* Per-vault list */}
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
          Vaults
        </Typography>
        {savedVaults.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", py: 1.5 }}>
            No vaults saved. Add one from the Vaults page to enable notifications.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {savedVaults.map((v) => {
              const addr = v.address;
              const enabled = getVaultEnabled(addr);
              const avatar = vaultAvatarUrl(addr);
              const dname = vaultDisplayName(addr);
              return (
                <Box
                  key={addr}
                  sx={{
                    display: "flex", alignItems: "center", gap: 1.5,
                    p: 1.25, borderRadius: 1,
                    bgcolor: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <Avatar src={avatar} sx={{ width: 32, height: 32, bgcolor: "secondary.main", opacity: 0.85, fontSize: 14 }}>
                    {dname[0]?.toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontFamily: "monospace", fontSize: 13 }} noWrap>
                      {dname}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {shortAddress(addr, 6, 6)}
                    </Typography>
                  </Box>
                  <Tooltip title="Copy address"><IconButton size="small" onClick={() => onCopy("Vault address", addr)}>
                    <ContentCopy fontSize="small" />
                  </IconButton></Tooltip>
                  <Tooltip title="View on Solscan"><IconButton size="small" component="a" href={explorerAddrUrl(addr)} target="_blank" rel="noopener">
                    <OpenInNew fontSize="small" />
                  </IconButton></Tooltip>
                  <Tooltip title="Send a test notification">
                    <span>
                      <Button
                        size="small"
                        variant="text"
                        onClick={async () => {
                          if (!(await ensurePermission())) return;
                          await fireTestNotification(addr);
                        }}
                        disabled={perm === "denied" || perm === "unsupported"}
                        sx={{ minWidth: 0, px: 1 }}
                      >
                        Test
                      </Button>
                    </span>
                  </Tooltip>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        checked={enabled && perm === "granted" && prefs.enabled}
                        disabled={perm === "denied" || perm === "unsupported" || !prefs.enabled}
                        onChange={(e) => onToggleVault(addr, e.target.checked)}
                      />
                    }
                    label={<Typography variant="caption" sx={{ color: "text.secondary", minWidth: 24 }}>{enabled ? "On" : "Off"}</Typography>}
                  />
                </Box>
              );
            })}
          </Stack>
        )}

        <Box
          sx={{
            mt: 2, p: 1.5, borderRadius: 1,
            bgcolor: "rgba(34,211,238,0.06)",
            border: "1px solid rgba(34,211,238,0.20)",
            display: "flex", gap: 1.5,
          }}
        >
          <InfoOutlined sx={{ color: "secondary.main", flexShrink: 0, mt: 0.25 }} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            <b>v2 status:</b> Service Worker is registered — notifications survive tab background. True push-without-tab requires a backend service that watches Solana events; coming in a follow-up. For now the watcher runs in any open Redacted tab.
          </Typography>
        </Box>
      </SectionCard>
    </Stack>
  );
}

// ─── Appearance tab ──────────────────────────────────────────────────────────
function AppearanceTab() {
  const { mode, setMode } = useThemeMode();
  return (
    <Stack spacing={2}>
      <SectionCard title="Theme">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {mode === "dark" ? "Dark mode" : "Light mode"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Saved to this browser. Applies across the whole app.
            </Typography>
          </Box>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                checked={mode === "dark"}
                onChange={(e) => setMode(e.target.checked ? "dark" : "light")}
              />
            }
            label=""
          />
        </Box>
      </SectionCard>
    </Stack>
  );
}

// ─── Other tabs (stubs — fill in 1-by-1) ────────────────────────────────────
function ComingSoonTab({ name }: { name: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h3" sx={{ mb: 1 }}>{name}</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          This tab is not built yet — show me Safe's <b>{name}</b> screen and we'll fill it in 1-by-1.
        </Typography>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SectionCard({
  title, info, contentHeader, children,
}: {
  title: string;
  info?: string;
  contentHeader?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Safe's 2-column layout: section label left, content right.
  return (
    <Card>
      <CardContent sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "240px 1fr" }, gap: 3 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="h3" sx={{ fontSize: 18 }}>{title}</Typography>
            {info && (
              <Tooltip title={info}>
                <InfoOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
              </Tooltip>
            )}
          </Box>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {contentHeader}
          {children}
        </Box>
      </CardContent>
    </Card>
  );
}

function SignerAvatar({ address }: { address: string }) {
  // Deterministic color from address — mirrors Safe's per-signer pixel avatars
  // without pulling in a real generator library.
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) % 360;
    return h;
  }, [address]);
  return (
    <Avatar sx={{
      width: 32, height: 32,
      background: `linear-gradient(135deg, hsl(${hue}, 70%, 55%) 0%, hsl(${(hue + 60) % 360}, 70%, 45%) 100%)`,
      fontSize: 12, fontWeight: 700,
    }}>
      {address.slice(0, 2).toUpperCase()}
    </Avatar>
  );
}

// Permissions are a bitmask: 1=initiate, 2=vote, 4=execute. 7 = all.
function permissionsLabel(mask: number): string {
  if (mask === 7) return "Initiate · Vote · Execute (all)";
  const parts: string[] = [];
  if (mask & 1) parts.push("Initiate");
  if (mask & 2) parts.push("Vote");
  if (mask & 4) parts.push("Execute");
  return parts.length ? parts.join(" · ") : "None";
}
