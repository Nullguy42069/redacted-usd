"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, Chip, IconButton, Tooltip, Button, Dialog, DialogTitle, DialogContent, DialogActions, Avatar, Stack, Popover, Divider, List, ListItemButton, ListItemAvatar, ListItemText } from "@mui/material";
import { Refresh, Menu, Search, Notifications, Bolt, AccountBalanceWallet, ContentCopy, Check, ExpandMore, Edit as EditIcon, Add as AddIcon } from "@mui/icons-material";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { shortAddress } from "@/lib/squads";
import { useMultisig } from "./MultisigContext";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPanel } from "./NotificationsPanel";

import { BatchedTransactionsModal } from "./BatchedTransactionsModal";
import { WalletSelectionModal } from "./WalletSelectionModal";
import { loadVaults, updateVault, getLastSelectedVault, setLastSelectedVault, addVault } from "@/lib/vault-store";
import { discoverVaultsCreatedBy } from "@/lib/vault-discovery";
import { useEvmWallet, shortEvmAddress } from "./EvmWalletContext";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { multisig, refresh, loading, setAddress, mode, setMode, personalPublicKey, activeOwner } = useMultisig();
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();

  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [batchedOpen, setBatchedOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [vaultRefresh, setVaultRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  const [vaultMenuAnchor, setVaultMenuAnchor] = useState<HTMLElement | null>(null);
  const router = useRouter();

  // Restore last selected vault for the connected wallet (per-wallet "cookie" persistence)
  useEffect(() => {
    if (!connected || !publicKey) return;
    const w = publicKey.toBase58();
    const last = getLastSelectedVault(w);
    if (last) {
      const current = multisig?.address.toBase58();
      if (last !== current) {
        setAddress(last);
      }
    }
  }, [connected, publicKey?.toBase58(), multisig?.address?.toBase58(), setAddress]);

  // Persist the current vault for this wallet whenever it changes
  useEffect(() => {
    if (connected && publicKey && multisig) {
      const w = publicKey.toBase58();
      const v = multisig.address.toBase58();
      const prev = getLastSelectedVault(w);
      if (prev !== v) {
        setLastSelectedVault(w, v);
      }
    }
  }, [connected, publicKey?.toBase58(), multisig?.address?.toBase58()]);

  // One-time auto-discovery of vaults created by this wallet (so they preload on connect
  // even if localStorage was cleared or the user is on a new device/browser).
  useEffect(() => {
    if (!connected || !publicKey || !connection) return;

    const walletKey = publicKey.toBase58();
    const flagKey = `redacted-autosynced:${walletKey}`;

    // Only run once per wallet (user can still manually "Sync created vaults" later for newer ones)
    if (typeof window !== "undefined" && window.localStorage.getItem(flagKey)) {
      return;
    }

    // Fire and forget — we don't want to block UI or show spinners for the background preload
    (async () => {
      try {
        const found = await discoverVaultsCreatedBy(connection, publicKey, { limit: 120 });
        let addedAny = false;
        for (const address of found) {
          const before = loadVaults().length;
          addVault({ address, bookmarked: true, readOnly: false });
          if (loadVaults().length > before) addedAny = true;
        }
        // Always mark as attempted for this wallet after a scan so we don't
        // keep rescanning on every connect/refresh. User can manually re-sync
        // later if they create more vaults.
        if (typeof window !== "undefined") {
          window.localStorage.setItem(flagKey, Date.now().toString());
        }
      } catch {
        // Silent fail is fine for background auto-sync. Still mark attempted
        // to avoid hammering on a problematic wallet history.
        if (typeof window !== "undefined") {
          window.localStorage.setItem(flagKey, Date.now().toString());
        }
      }
    })();
  }, [connected, publicKey?.toBase58(), connection]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {/* Hamburger always in DOM for reliability; CSS hides on desktop so sidebar is never "deleted" from narrow windows or timing issues. */}
      <IconButton
        size="small"
        onClick={onMenuClick}
        sx={{ mr: 0.5, display: { xs: "inline-flex", md: "none" } }}
      >
        <Menu fontSize="small" />
      </IconButton>

      {/* Wallet / Vault mode toggle - allows using the site with just a connected personal wallet.
          When privacy layer is added later, this lets the app work as a general privacy tool
          without forcing multisig usage. */}
      <Stack direction="row" spacing={0.5} sx={{ mr: 1 }}>
        <Button
          size="small"
          variant={mode === 'personal' ? 'contained' : 'outlined'}
          onClick={() => setMode('personal')}
          sx={{ textTransform: 'none', px: 1, py: 0.25, minWidth: 0, fontSize: 12 }}
        >
          Wallet
        </Button>
        <Button
          size="small"
          variant={mode === 'vault' ? 'contained' : 'outlined'}
          onClick={() => setMode('vault')}
          sx={{ textTransform: 'none', px: 1, py: 0.25, minWidth: 0, fontSize: 12 }}
        >
          Vault
        </Button>
      </Stack>

      {/* Left side - current actor info (personal wallet or vault) */}
      {mode === 'personal' ? (
        <Typography sx={{ fontFamily: "monospace", fontSize: { xs: "0.8rem", sm: "1rem" }, color: connected ? 'text.primary' : 'text.secondary' }}>
          {connected && personalPublicKey ? shortAddress(personalPublicKey) : 'Connect wallet'}
        </Typography>
      ) : multisig ? (
        <>
          {/* Vault chip: three independent click zones —
              avatar → customize PFP, name → rename, chevron → switch vaults. */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              bgcolor: "rgba(255,255,255,0.04)",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            {/* Zone 1: avatar — click to customize PFP */}
            <Tooltip title="Customize vault avatar">
              <IconButton
                size="small"
                onClick={() => setAvatarDialogOpen(true)}
                sx={{ p: 0.5, borderRadius: 0 }}
              >
                <Avatar
                  sx={{ width: 28, height: 28, bgcolor: "secondary.main", opacity: 0.85, fontSize: 12 }}
                  src={(() => {
                    const saved = loadVaults().find((v) => v.address === multisig.address.toBase58());
                    return saved?.avatar || undefined;
                  })()}
                >
                  {(() => {
                    const saved = loadVaults().find((v) => v.address === multisig.address.toBase58());
                    return (saved?.name || multisig.address.toBase58())[0]?.toUpperCase();
                  })()}
                </Avatar>
              </IconButton>
            </Tooltip>

            {/* Zone 2: name + signers — click to rename */}
            <Tooltip title="Click to rename this vault">
              <Box
                onClick={() => {
                  if (!multisig) return;
                  const addr = multisig.address.toBase58();
                  const saved = loadVaults().find((v) => v.address === addr);
                  const newName = prompt("Vault name / label", saved?.name || "");
                  if (newName !== null) {
                    updateVault(addr, { name: newName || undefined });
                    setVaultRefresh((r) => r + 1);
                  }
                }}
                sx={{
                  px: 1.25, py: 0.5,
                  cursor: "pointer",
                  minWidth: 0,
                  "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                }}
              >
                <Typography sx={{ fontFamily: "monospace", fontSize: { xs: "0.75rem", sm: "0.85rem" }, lineHeight: 1.2 }} noWrap>
                  {(() => {
                    const saved = loadVaults().find((v) => v.address === multisig.address.toBase58());
                    return saved?.name || `solana:${shortAddress(multisig.address)}`;
                  })()}
                </Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1 }}>
                  {multisig.threshold}/{multisig.members.length} signers
                </Typography>
              </Box>
            </Tooltip>

            {/* Zone 3: chevron — open vault switcher dropdown */}
            <Tooltip title="Switch vault">
              <IconButton
                size="small"
                onClick={(e) => setVaultMenuAnchor(e.currentTarget)}
                sx={{ borderLeft: "1px solid", borderColor: "divider", borderRadius: 0, px: 0.5 }}
              >
                <ExpandMore fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Copy address icon — pulled out of the button so clicking copy
              doesn't also open the dropdown. */}
          <Tooltip title={copied ? "Copied!" : "Copy multisig address"}>
            <IconButton
              size="small"
              onClick={async () => {
                if (!multisig) return;
                await navigator.clipboard.writeText(multisig.address.toBase58());
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              sx={{ color: copied ? 'success.main' : 'text.secondary' }}
            >
              {copied ? <Check sx={{ fontSize: 16 }} /> : <ContentCopy sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh vault state">
            <IconButton size="small" onClick={refresh} disabled={loading}>
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Vault selector popover — opens on click of the vault button above */}
          <Popover
            open={Boolean(vaultMenuAnchor)}
            anchorEl={vaultMenuAnchor}
            onClose={() => setVaultMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{
              paper: { sx: { mt: 0.5, minWidth: 320, maxWidth: 400, borderRadius: 2 } },
            }}
          >
            <Box sx={{ px: 2, pt: 2, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
                Your vaults
              </Typography>
              <Tooltip title="Rename this vault">
                <IconButton
                  size="small"
                  onClick={() => {
                    if (!multisig) return;
                    const addr = multisig.address.toBase58();
                    const saved = loadVaults().find((v) => v.address === addr);
                    const newName = prompt('Vault name / label', saved?.name || '');
                    if (newName !== null) {
                      updateVault(addr, { name: newName || undefined });
                      setVaultRefresh((r) => r + 1);
                    }
                  }}
                >
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>

            <Divider />

            <List dense sx={{ py: 0, maxHeight: 360, overflow: "auto" }}>
              {loadVaults().length === 0 && (
                <Box sx={{ px: 2, py: 2, color: "text.secondary", fontSize: 13 }}>
                  No saved vaults. Add one or create a new one.
                </Box>
              )}
              {loadVaults().map((v) => {
                const isActive = v.address === multisig.address.toBase58();
                return (
                  <ListItemButton
                    key={v.address}
                    selected={isActive}
                    onClick={() => {
                      setAddress(v.address);
                      setVaultMenuAnchor(null);
                    }}
                    sx={{ py: 1 }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        sx={{ width: 32, height: 32, bgcolor: "secondary.main", opacity: 0.85, fontSize: 14 }}
                        src={v.avatar || undefined}
                      >
                        {(v.name || v.address)[0]?.toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography sx={{ fontFamily: "monospace", fontSize: 13 }} noWrap>
                          {v.name || `solana:${shortAddress(v.address)}`}
                        </Typography>
                      }
                      secondary={
                        <Typography sx={{ fontSize: 11, color: "text.secondary" }} noWrap>
                          {shortAddress(v.address, 6, 6)}
                        </Typography>
                      }
                    />
                    {isActive && (
                      <Chip size="small" label="Active" color="primary" sx={{ height: 18, fontSize: 10 }} />
                    )}
                  </ListItemButton>
                );
              })}
            </List>

            <Divider />

            <Box sx={{ p: 1, display: "flex", gap: 1 }}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  setVaultMenuAnchor(null);
                  router.push("/vaults");
                }}
                sx={{ textTransform: "none", flex: 1 }}
              >
                Manage vaults
              </Button>
            </Box>
          </Popover>
        </>
      ) : (
        <Button
          variant="outlined"
          size="small"
          onClick={() => router.push("/vaults")}
          sx={{ textTransform: "none" }}
        >
          No vault loaded — pick one
        </Button>
      )}

      <Box sx={{ flex: 1 }} />

      {/* === Safe-style Top Right Actions === */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {/* Icon buttons - Safe style dark circular buttons */}
        <IconButton
          size="small"
          onClick={() => setSearchOpen(true)}
          sx={{
            bgcolor: "rgba(255,255,255,0.06)",
            color: "text.secondary",
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
            width: 36,
            height: 36,
          }}
        >
          <Search fontSize="small" />
        </IconButton>

        <IconButton
          size="small"
          onClick={() => setNotificationsOpen(true)}
          sx={{
            bgcolor: "rgba(255,255,255,0.06)",
            color: "text.secondary",
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
            width: 36,
            height: 36,
          }}
        >
          <Notifications fontSize="small" />
        </IconButton>

        {/* 4th icon: Batched transactions (stacked layers) */}
        <IconButton
          size="small"
          onClick={() => setBatchedOpen(true)}
          sx={{
            bgcolor: "rgba(255,255,255,0.06)",
            color: "text.secondary",
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
            width: 36,
            height: 36,
          }}
        >
          {/* Stacked layers icon matching the reference */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="5" rx="1" />
            <rect x="3" y="10" width="18" height="5" rx="1" />
            <rect x="3" y="17" width="18" height="5" rx="1" />
          </svg>
        </IconButton>

        {/* Wallet Connect Buttons — Solana pill on top; EVM pill stacks
            beneath when a page (e.g. Bridge) declares EVM source needed. */}
        <Box sx={{ ml: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
          {connected && publicKey ? (
            <Button
              variant="contained"
              size="small"
              sx={{
                bgcolor: "rgba(255,255,255,0.08)",
                color: "text.primary",
                textTransform: "none",
                borderRadius: "999px",
                px: 2,
                py: 0.75,
                fontSize: "0.875rem",
                fontWeight: 500,
                "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
              }}
              startIcon={<Bolt sx={{ fontSize: 18 }} />}
            >
              {shortAddress(publicKey)}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              onClick={() => setWalletModalOpen(true)}
              sx={{
                bgcolor: "rgba(255,255,255,0.08)",
                color: "#FFFFFF",
                textTransform: "none",
                borderRadius: "999px",
                px: 2,
                py: 0.75,
                fontSize: "0.875rem",
                fontWeight: 500,
                "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
              startIcon={<AccountBalanceWallet sx={{ fontSize: 18 }} />}
            >
              Connect Wallet
            </Button>
          )}
          <EvmPill />
        </Box>
      </Box>

      {/* Search / Command Palette */}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Notifications Panel */}
      <NotificationsPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {/* Batched Transactions Modal */}
      <BatchedTransactionsModal
        open={batchedOpen}
        onClose={() => setBatchedOpen(false)}
      />

      {/* Wallet Selection Modal (Safe-style) */}
      <WalletSelectionModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />

      {/* Customize Vault Avatar Dialog */}
      <Dialog open={avatarDialogOpen} onClose={() => { setAvatarDialogOpen(false); setAvatarPreview(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Customize Vault Avatar</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
            <Avatar 
              src={avatarPreview || (() => {
                const saved = multisig ? loadVaults().find((v) => v.address === multisig.address.toBase58()) : null;
                return saved?.avatar || undefined;
              })()} 
              sx={{ width: 96, height: 96 }}
            >
              {multisig ? multisig.address.toBase58().slice(0,1) : '?'}
            </Avatar>

            <Button
              variant="outlined"
              component="label"
              size="small"
            >
              Upload Image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const resized = await resizeImage(file, 256);
                  setAvatarPreview(resized);
                }}
              />
            </Button>

            {avatarPreview && (
              <Button 
                size="small" 
                color="error" 
                onClick={() => setAvatarPreview(null)}
              >
                Remove uploaded
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAvatarDialogOpen(false); setAvatarPreview(null); }}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => {
              if (!multisig) return;
              const addr = multisig.address.toBase58();
              const newAvatar = avatarPreview || null;
              updateVault(addr, { avatar: newAvatar || undefined });
              setVaultRefresh(r => r + 1);
              setAvatarDialogOpen(false);
              setAvatarPreview(null);
            }}
          >
            Save
          </Button>
          {(() => {
            const saved = multisig ? loadVaults().find((v) => v.address === multisig.address.toBase58()) : null;
            return saved?.avatar ? (
              <Button 
                color="error" 
                onClick={() => {
                  if (!multisig) return;
                  updateVault(multisig.address.toBase58(), { avatar: undefined });
                  setVaultRefresh(r => r + 1);
                  setAvatarDialogOpen(false);
                  setAvatarPreview(null);
                }}
              >
                Remove custom
              </Button>
            ) : null;
          })()}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Simple client-side image resizer for PFP (keeps localStorage reasonable) */
async function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


// EVM connect pill. Stacks under the Solana wallet pill in the Topbar. Only
// renders when a page declares it needs an EVM wallet (e.g. Bridge with an
// EVM source). Uses window.ethereum directly — see EvmWalletContext.
function EvmPill() {
  const { required, available, address, connecting, connect, disconnect } = useEvmWallet();
  if (!required) return null;

  if (!available) {
    return (
      <Button
        component="a"
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener"
        size="small"
        sx={{
          bgcolor: "rgba(255,255,255,0.04)",
          color: "text.secondary",
          textTransform: "none",
          borderRadius: "999px",
          px: 1.5, py: 0.5,
          fontSize: "0.75rem",
          fontWeight: 500,
          border: "1px solid rgba(255,255,255,0.10)",
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
        }}
      >
        Install EVM wallet
      </Button>
    );
  }

  if (address) {
    return (
      <Button
        size="small"
        onClick={disconnect}
        title="Click to disconnect"
        sx={{
          bgcolor: "rgba(255,255,255,0.06)",
          color: "text.primary",
          textTransform: "none",
          borderRadius: "999px",
          px: 1.5, py: 0.5,
          fontSize: "0.75rem",
          fontWeight: 500,
          border: "1px solid rgba(255,255,255,0.10)",
          fontFamily: "monospace",
          "&:hover": { bgcolor: "rgba(255,255,255,0.10)" },
        }}
      >
        EVM · {shortEvmAddress(address)}
      </Button>
    );
  }

  return (
    <Button
      size="small"
      onClick={connect}
      disabled={connecting}
      sx={{
        background: "linear-gradient(90deg, #7C3AED 0%, #22D3EE 100%)",
        color: "#0A0A0F",
        textTransform: "none",
        borderRadius: "999px",
        px: 1.5, py: 0.5,
        fontSize: "0.75rem",
        fontWeight: 600,
        "&:hover": { filter: "brightness(1.08)" },
      }}
    >
      {connecting ? "Connecting…" : "Connect EVM wallet"}
    </Button>
  );
}
