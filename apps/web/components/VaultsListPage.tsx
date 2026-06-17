"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  Alert,
  Divider,
} from "@mui/material";
import {
  Add,
  Search,
  Bookmark,
  BookmarkBorder,
  MoreVert,
  Download,
  Upload,
  ContentCopy,
  Sync,
} from "@mui/icons-material";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  addVault,
  exportVaults,
  importVaults,
  loadVaults,
  removeVault,
  updateVault,
  setLastSelectedVault,
  type SavedVault,
} from "@/lib/vault-store";
import { shortAddress } from "@/lib/squads";
import { useMultisig } from "./MultisigContext";
import { AddVaultDialog } from "./AddVaultDialog";
import { CreateVaultDialog } from "./CreateVaultDialog";
import { discoverVaultsCreatedBy } from "@/lib/vault-discovery";

// This is the public component used throughout the app.
// It automatically restores the last selected vault for the current wallet.
export function VaultsListPage() {
  const { connection } = useConnection();
  const { setAddress, setMode } = useMultisig();
  const [vaults, setVaults] = useState<SavedVault[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const { publicKey: connectedWallet } = useWallet();

  useEffect(() => {
    setVaults(loadVaults());
  }, []);

  // Refresh balances in the background — best-effort, ignore failures.
  // Sequential with small delays to avoid hammering the RPC and triggering 429s
  // (especially noticeable on Helius free tier when you have several saved vaults).
  useEffect(() => {
    if (vaults.length === 0) return;
    let cancelled = false;
    (async () => {
      const out: SavedVault[] = [];
      for (const v of vaults) {
        if (cancelled) break;
        try {
          const bal = await connection.getBalance(new PublicKey(v.address));
          out.push({ ...v, lastBalanceLamports: bal, lastSeenAt: new Date().toISOString() });
        } catch {
          out.push(v);
        }
        // Tiny delay between balances so we don't create a thundering herd of RPC calls.
        if (!cancelled) await new Promise(r => setTimeout(r, 60));
      }
      if (!cancelled) {
        for (const v of out) updateVault(v.address, v);
        setVaults(loadVaults());
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults.length, connection]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vaults;
    return vaults.filter(
      (v) =>
        v.address.toLowerCase().includes(q) || (v.name ?? "").toLowerCase().includes(q),
    );
  }, [vaults, search]);

  // Bookmarked first, then by addedAt desc.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.bookmarked !== b.bookmarked) return a.bookmarked ? -1 : 1;
      return a.addedAt > b.addedAt ? -1 : 1;
    });
  }, [filtered]);

  const handleAdd = (address: string, name?: string) => {
    const next = addVault({ address, name, bookmarked: true, readOnly: false });
    setVaults(next);
    setAddOpen(false);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const next = importVaults(text, "merge");
      setVaults(next);
      setImportMsg(`Imported — ${next.length} vault${next.length === 1 ? "" : "s"} total.`);
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleExport = () => {
    const blob = new Blob([exportVaults()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `redacted-vaults-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleSyncCreated = async () => {
    if (!connectedWallet) {
      setSyncMsg("Connect a wallet first to discover vaults you created.");
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      // Deeper scan on manual button so users can recover older vaults even if they have done many txs since creation.
      const found = await discoverVaultsCreatedBy(connection, connectedWallet, { limit: 600 });
      let newlyAdded = 0;
      for (const address of found) {
        const before = loadVaults().length;
        addVault({ address, bookmarked: true, readOnly: false });
        const after = loadVaults().length;
        if (after > before) newlyAdded++;
      }
      setVaults(loadVaults());
      if (newlyAdded > 0) {
        setSyncMsg(`Found ${newlyAdded} new vault${newlyAdded === 1 ? "" : "s"} created by (or interacted with by) this wallet.`);
      } else if (found.length > 0) {
        setSyncMsg(`All ${found.length} matching vault${found.length === 1 ? "" : "s"} were already in your list.`);
      } else {
        setSyncMsg("No new vaults in recent history. Try the wallet used as fee payer at creation time, or use + Add with the exact address.");
      }
    } catch (e) {
      setSyncMsg(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
      // Auto-clear the message after a bit (keep errors a little longer)
      setTimeout(() => setSyncMsg(null), 8000);
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", py: 4 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h2">Vaults</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add
          </Button>
          <Button
            variant="outlined"
            startIcon={<Sync />}
            onClick={handleSyncCreated}
            disabled={syncing || !connectedWallet}
          >
            {syncing ? "Syncing..." : "Sync created vaults"}
          </Button>
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Create vault
          </Button>
        </Stack>
      </Stack>

      <TextField
        fullWidth
        placeholder="Search by name or address"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 3 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      {importMsg && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setImportMsg(null)}>
          {importMsg}
        </Alert>
      )}

      {syncMsg && (
        <Alert
          severity={syncMsg.toLowerCase().includes("fail") ? "error" : "success"}
          sx={{ mb: 2 }}
          onClose={() => setSyncMsg(null)}
        >
          {syncMsg}
        </Alert>
      )}

      {sorted.length === 0 && !search && (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Bookmark sx={{ fontSize: 36, opacity: 0.4, mb: 1 }} />
          <Typography sx={{ mb: 1 }}>No saved vaults yet.</Typography>
          <Typography sx={{ fontSize: 13 }}>
            Use <b>Add</b> to bookmark an existing vault, or <b>Create vault</b> to spin up a new one.
          </Typography>
        </Box>
      )}

      {sorted.length > 0 && (
        <Stack spacing={1.5}>
          {sorted.map((v) => (
            <VaultRow
              key={v.address}
              vault={v}
              onOpen={() => {
                setAddress(v.address);
                setMode('vault');
              }}
              onBookmark={() => {
                updateVault(v.address, { bookmarked: !v.bookmarked });
                setVaults(loadVaults());
              }}
              onRemove={() => {
                setVaults(removeVault(v.address));
              }}
              onRename={(name: string) => {
                updateVault(v.address, { name });
                setVaults(loadVaults());
              }}
            />
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" spacing={2}>
        <Button variant="outlined" startIcon={<Upload />} onClick={() => document.getElementById("import-vaults")?.click()}>
          Import
        </Button>
        <input
          id="import-vaults"
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            (e.target as HTMLInputElement).value = "";
          }}
        />
        <Button variant="outlined" startIcon={<Download />} onClick={handleExport}>
          Export
        </Button>
      </Stack>

      <AddVaultDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAdd} />
      <CreateVaultDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Auto-selector runs in the background and is safe because it's a child of the providers */}
    </Box>
  );
}


// Minimal VaultRow component (extracted/adapted from original)
function VaultRow({ vault, onOpen, onBookmark, onRemove, onRename }: any) {
  return (
    <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Box>
        <Typography sx={{ fontWeight: 600 }}>{vault.name || shortAddress(vault.address)}</Typography>
        <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: "text.secondary" }}>
          {shortAddress(vault.address)}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <IconButton onClick={onBookmark} size="small">
          {vault.bookmarked ? <Bookmark fontSize="small" /> : <BookmarkBorder fontSize="small" />}
        </IconButton>
        <Button onClick={onOpen} size="small" variant="contained" color="primary">
          Open
        </Button>
        <IconButton onClick={onRemove} size="small" color="error">
          <MoreVert fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
