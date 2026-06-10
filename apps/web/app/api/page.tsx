"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Divider,
  TextField,
  Chip,
  IconButton,
  Alert,
} from "@mui/material";
import { ContentCopy, Delete, Add } from "@mui/icons-material";
import { loadVaults, SavedVault } from "@/lib/vault-store";

interface ApiKey {
  key?: string;           // only present right after creation
  vaults: string[];
  createdAt: string;
  label?: string;
}

export default function APIPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [vaults, setVaults] = useState<SavedVault[]>([]);
  const [selectedVaults, setSelectedVaults] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user's saved vaults (for choosing which vaults to grant access to)
  useEffect(() => {
    const saved = loadVaults();
    setVaults(saved);
  }, []);

  // Load existing API keys
  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/v1/keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (e) {
      setError("Failed to load API keys");
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const createKey = async () => {
    if (selectedVaults.length === 0) {
      setError("Please select at least one vault");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaults: selectedVaults,
          label: newLabel.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create key");

      const data = await res.json();

      // Show the key only once
      setNewlyCreatedKey(data.key);

      // Refresh the list (the returned object won't have the full key anymore)
      await fetchKeys();

      // Reset form
      setNewLabel("");
      setSelectedVaults([]);
    } catch (e: any) {
      setError(e.message || "Failed to create API key");
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (key: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/v1/keys?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to revoke key");

      await fetchKeys();
    } catch (e) {
      setError("Failed to revoke key");
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    // Could add a toast later
  };

  const toggleVault = (address: string) => {
    setSelectedVaults((prev) =>
      prev.includes(address)
        ? prev.filter((a) => a !== address)
        : [...prev, address]
    );
  };

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", py: 6, px: 2 }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
        API & Agent Access
      </Typography>
      <Typography sx={{ color: "text.secondary", mb: 4 }}>
        Create API keys so external agents and programs can interact with your vaults.
      </Typography>

      {/* Create new key */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Create New API Key
        </Typography>

        <Stack spacing={2}>
          <TextField
            label="Key Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Trading Agent"
            fullWidth
          />

          <Box>
            <Typography sx={{ mb: 1, fontWeight: 500 }}>
              Grant access to these vaults:
            </Typography>
            {vaults.length === 0 && (
              <Typography color="text.secondary">No vaults saved yet.</Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {vaults.map((vault) => (
                <Chip
                  key={vault.address}
                  label={vault.name || shortAddress(vault.address)}
                  clickable
                  color={selectedVaults.includes(vault.address) ? "primary" : "default"}
                  onClick={() => toggleVault(vault.address)}
                  sx={{ mb: 1 }}
                />
              ))}
            </Stack>
          </Box>

          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={createKey}
            disabled={loading || selectedVaults.length === 0}
            sx={{ alignSelf: "flex-start" }}
          >
            {loading ? "Creating..." : "Create API Key"}
          </Button>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Paper>

      {/* Newly created key (show only once) */}
      {newlyCreatedKey && (
        <Paper sx={{ p: 3, mb: 4, border: "1px solid", borderColor: "success.main" }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This key will only be shown once. Copy it now and store it securely.
          </Alert>
          <Typography sx={{ fontFamily: "monospace", fontSize: 15, wordBreak: "break-all", mb: 2 }}>
            {newlyCreatedKey}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<ContentCopy />}
            onClick={() => copyKey(newlyCreatedKey)}
          >
            Copy Key
          </Button>
          <Button sx={{ ml: 2 }} onClick={() => setNewlyCreatedKey(null)}>
            Done
          </Button>
        </Paper>
      )}

      {/* Existing Keys */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Your API Keys
        </Typography>

        {keys.length === 0 ? (
          <Typography color="text.secondary">No API keys yet.</Typography>
        ) : (
          <Stack spacing={2}>
            {keys.map((key, index) => (
              <Box
                key={index}
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 500 }}>
                    {key.label || "Unnamed Key"}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "monospace",
                      fontSize: 13,
                      color: "text.secondary",
                      mt: 0.5,
                    }}
                  >
                    {key.key ? key.key : "••••••••••••••••••••••••"}
                  </Typography>

                  <Box sx={{ mt: 1 }}>
                    {key.vaults.map((addr, i) => (
                      <Chip
                        key={i}
                        label={shortAddress(addr)}
                        size="small"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  {key.key && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ContentCopy />}
                      onClick={() => copyKey(key.key!)}
                    >
                      Copy
                    </Button>
                  )}
                  <IconButton
                    color="error"
                    onClick={() => revokeKey(key.key!)}
                    size="small"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      {/* API Reference */}
      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          API Reference
        </Typography>
        <Typography sx={{ color: "text.secondary", mb: 2 }}>
          Base URL: same origin (e.g. https://your-site). All routes require a valid API key.
        </Typography>

        <Typography sx={{ fontWeight: 600, mt: 2, mb: 0.5 }}>Authentication</Typography>
        <Box
          sx={{
            p: 1.5,
            bgcolor: "background.default",
            borderRadius: 1,
            fontFamily: "monospace",
            fontSize: 13,
            mb: 2,
          }}
        >
          Authorization: Bearer rdu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* GET /api/v1/vaults */}
        <Typography sx={{ fontWeight: 600 }}>GET /api/v1/vaults</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          List all vaults this API key can access.
        </Typography>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 1 }}>
          curl -H "Authorization: Bearer $KEY" /api/v1/vaults
        </Box>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 2 }}>
          {`fetch("/api/v1/vaults", { headers: { Authorization: "Bearer " + key } }).then(r => r.json())`}
        </Box>

        {/* GET /api/v1/vaults/[address] */}
        <Typography sx={{ fontWeight: 600 }}>GET /api/v1/vaults/:address</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Vault metadata: threshold, members, current transaction index, vault PDA and lamports.
        </Typography>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 1 }}>
          curl -H "Authorization: Bearer $KEY" /api/v1/vaults/YourMultisigAddress
        </Box>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 2 }}>
          {`fetch("/api/v1/vaults/" + addr, { headers: { Authorization: "Bearer " + key } })`}
        </Box>

        {/* GET /api/v1/vaults/[address]/assets */}
        <Typography sx={{ fontWeight: 600 }}>GET /api/v1/vaults/:address/assets</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Current token + SOL balances with USD prices.
        </Typography>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 1 }}>
          curl -H "Authorization: Bearer $KEY" /api/v1/vaults/YourMultisigAddress/assets
        </Box>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 2 }}>
          {`fetch("/api/v1/vaults/" + addr + "/assets", { headers: { Authorization: "Bearer " + key } })`}
        </Box>

        {/* GET /api/v1/vaults/[address]/transactions */}
        <Typography sx={{ fontWeight: 600 }}>GET /api/v1/vaults/:address/transactions</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Recent proposals (up to 25). Queue = Draft/Active/Approved. Includes approvals/rejections.
        </Typography>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 1 }}>
          curl -H "Authorization: Bearer $KEY" /api/v1/vaults/YourMultisigAddress/transactions
        </Box>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 2 }}>
          {`fetch("/api/v1/vaults/" + addr + "/transactions", { headers: { Authorization: "Bearer " + key } })`}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* POST propose */}
        <Typography sx={{ fontWeight: 600 }}>POST /api/v1/vaults/:address/propose</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Build a real on-chain proposal (SOL transfer for v1). Returns a serialized tx you must sign with a member wallet (the "creator").
          After submission the proposal appears in the UI with 1 approval already.
        </Typography>
        <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "background.default", p: 1, borderRadius: 1, mb: 1, whiteSpace: "pre" }}>
{`curl -X POST \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"recipient":"...","amountLamports":"1000000000","creator":"MEMBER_PUBKEY","memo":"agent payout"}' \\
  /api/v1/vaults/YourMultisigAddress/propose`}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Note: "creator" must be one of the current multisig members. The returned serializedTx is signed by that member and broadcast.
        </Typography>
      </Paper>
    </Box>
  );
}

function shortAddress(address: string) {
  return address.slice(0, 4) + "..." + address.slice(-4);
}
