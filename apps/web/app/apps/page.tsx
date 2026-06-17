"use client";
import { useEffect, useState, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Chip,
  Stack,
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  Card,
  CardContent,
  CardActions,
  Avatar,
  Paper,
} from "@mui/material";
import { Add, ArrowBack, ArrowForward, Refresh, Delete, Close } from "@mui/icons-material";
import { useMultisig } from "@/components/MultisigContext";
import { DEFI_APPS, type DefiApp } from "@/lib/defi-apps";
import {
  loadUserApps,
  addCustomApp, // async version that tries to fetch manifest (Safe-style)
  addCustomAppSync,
  removeCustomApp,
  hideDefaultApp,
  showDefaultApp,
  fetchAndEnhanceApp,
  type UserApp,
} from "@/lib/user-apps-store";
import { setupSquadsIframeBridge } from "@/lib/squads-iframe-bridge";
import { buildProposeTransaction, loadMultisig } from "@/lib/squads";
import { invalidateAfterTx } from "@/lib/rpc-cache";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export default function AppsBrowserPage() {
  const { mode, personalPublicKey, multisig, activeOwner } = useMultisig();

  if (!activeOwner) {
    return <Alert severity="info">Connect a wallet or load a vault to use the in-app browser.</Alert>;
  }

  const owner = mode === 'personal' ? personalPublicKey! : multisig!.address;
  const isPersonal = mode === 'personal';

  return <WalletDependentBrowser owner={owner} isPersonal={isPersonal} />;
}

function WalletDependentBrowser({ owner, isPersonal = false }: { owner: PublicKey; isPersonal?: boolean }) {
  const initialUrl = "https://jup.ag";
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeError, setIframeError] = useState(false);
  const [isLoadingIframe, setIsLoadingIframe] = useState(false);
  const [customApps, setCustomApps] = useState<UserApp[]>([]);
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; app: DefiApp | null } | null>(null);
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [multisigEmbeddedMode, setMultisigEmbeddedMode] = useState(false);
  const [lastProposalSignature, setLastProposalSignature] = useState<string | null>(null);
  const [copiedVault, setCopiedVault] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSquadsXGuidance, setShowSquadsXGuidance] = useState(false);
  const [guidanceUrl, setGuidanceUrl] = useState<string>('');
  const [extensionInstalled, setExtensionInstalled] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const KNOWN_BLOCKED_DOMAINS = [
    'jup.ag', 'orca.so', 'drift.trade', 'raydium.io', 'meteora.ag',
    'kamino.finance', 'marginfi.com', 'save.finance', 'marinade.finance',
    'sanctum.so', 'jito.wtf', 'lulo.fi'
  ];

  const { connection } = useConnection();
  const { publicKey: connectedMember, sendTransaction } = useWallet();

  const ownerAddress = owner.toBase58();
  const connectedAddress = owner.toBase58();

  useEffect(() => {
    const data = loadUserApps(ownerAddress);
    setCustomApps(data.customApps);
    setHiddenDefaults(data.hiddenDefaults);
  }, [ownerAddress]);

  // Browser extension detection. The Redacted extension's content script injects
  // window.redactedExtensionInstalled and fires a `redacted-extension-ready`
  // CustomEvent at document_start. We check the flag and listen for the event
  // in case the extension loads after this component mounts (rare but possible
  // on slow networks).
  useEffect(() => {
    const w = window as any;
    if (w.redactedExtensionInstalled) {
      setExtensionInstalled(true);
      return;
    }
    const onReady = () => setExtensionInstalled(true);
    window.addEventListener('redacted-extension-ready', onReady);
    // Late re-check (covers race between content script and React mount)
    const t = setTimeout(() => {
      if ((window as any).redactedExtensionInstalled) setExtensionInstalled(true);
    }, 250);
    return () => {
      window.removeEventListener('redacted-extension-ready', onReady);
      clearTimeout(t);
    };
  }, []);

  // Push active vault to the extension whenever it changes (multisig mode only).
  // The extension stores it and broadcasts to its content scripts on every dApp
  // tab, so "Redacted Multisig" in the wallet list connects to the right vault.
  useEffect(() => {
    if (!extensionInstalled || isPersonal) return;
    window.postMessage({ source: '__REDACTED_BRIDGE__', kind: 'vault-set', vault: connectedAddress }, window.location.origin);
  }, [extensionInstalled, isPersonal, connectedAddress]);

  const visibleDefaults = DEFI_APPS.filter((app) => !hiddenDefaults.includes(app.name));

  const navigateTo = (url: string) => {
    if (!url.startsWith("http")) url = "https://" + url;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(url);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCurrentUrl(url);
    setIframeError(false);
    setIsLoadingIframe(true);
    setIframeKey((k) => k + 1);
    setTimeout(() => setIsLoadingIframe(false), 3000);
    setBrowserOpen(true);
  };

  const handleAddCurrent = async () => {
    try {
      const url = new URL(currentUrl);
      // The imported addCustomApp is the async one (fetches manifest like Safe for nice name/icon/desc)
      const updated = await addCustomApp(ownerAddress, url.href).catch(() =>
        addCustomAppSync(ownerAddress, url.href, url.hostname)
      );
      setCustomApps(updated.customApps);
    } catch {
      alert("Invalid URL");
    }
  };

  const copyVaultAddressForSquadsX = async () => {
    try {
      await navigator.clipboard.writeText(connectedAddress);
      setCopiedVault(true);
      setTimeout(() => setCopiedVault(false), 2000);
    } catch {
      alert("Failed to copy. Address: " + connectedAddress);
    }
  };

  const handleOpenExternally = (targetUrl?: string) => {
    const url = targetUrl || currentUrl;
    // Append marker so userscripts / bookmarklets that read location can prefer the intended vault from our link
    let externalUrl = url;
    if (!isPersonal) {
      try {
        const u = new URL(url);
        u.hash = (u.hash ? u.hash + '&' : '#') + 'redacted-vault=' + connectedAddress;
        externalUrl = u.toString();
      } catch {}
    }
    window.open(externalUrl, '_blank');
    // With the extension installed, the opened tab auto-injects "Redacted Multisig"
    // as a connect option — no guidance modal needed.
    if (!isPersonal && !extensionInstalled) {
      navigator.clipboard.writeText(connectedAddress).catch(() => {});
      setGuidanceUrl(externalUrl);
      setShowSquadsXGuidance(true);
    }
  };

  // NOTE: the legacy bookmarklet/userscript generators were removed in the
  // pre-open-source audit. They injected a fake wallet that posted proposals to
  // window.opener with targetOrigin '*' — a cross-origin drain primitive that
  // origin allow-listing alone could not close. The Redacted browser extension
  // (extension/) is the supported, same-origin replacement.

  const handleSearchAdd = async () => {
    const term = searchTerm.trim();
    if (!term) return;

    let target = term;
    if (!target.startsWith('http')) {
      if (target.includes('.')) {
        target = 'https://' + target;
      } else {
        // try match known app
        const match = DEFI_APPS.find(a =>
          a.name.toLowerCase().includes(term.toLowerCase()) ||
          a.url.toLowerCase().includes(term.toLowerCase())
        );
        if (match) {
          navigateTo(match.url);
          setBrowserOpen(true);
          setSearchTerm('');
          return;
        }
        // fallback: treat as custom domain
        target = `https://${term}.com`;
      }
    }

    try {
      const u = new URL(target);
      // async add (with manifest fetch for richer card like Safe Custom Apps)
      const updated = await addCustomApp(ownerAddress, u.href).catch(() =>
        addCustomAppSync(ownerAddress, u.href, u.hostname)
      );
      setCustomApps(updated.customApps);
      navigateTo(u.href);
      setBrowserOpen(true);
      setSearchTerm('');
    } catch {
      alert('Enter a valid URL (e.g. https://example.com) or app name');
    }
  };

  const openInEmbeddedBrowser = (url: string) => {
    navigateTo(url);
    setBrowserOpen(true);
  };

  const handleRemoveCustom = (url: string) => {
    const updated = removeCustomApp(ownerAddress, url);
    setCustomApps(updated.customApps);
  };

  const handleHideDefault = (name: string) => {
    const updated = hideDefaultApp(ownerAddress, name);
    setHiddenDefaults(updated.hiddenDefaults);
    setContextMenu(null);
  };

  const handleContextMenu = (event: React.MouseEvent, app: DefiApp) => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6, app });
  };

  const handleCloseContext = () => setContextMenu(null);

  useEffect(() => {
    if (!connectedMember || !multisigEmbeddedMode || isPersonal) return;
    const vaultPubkey = owner;

    // Pass the iframeRef so the communicator can do strict "message came from THIS iframe" validation
    // (modeled on Safe's AppCommunicator which checks iframeRef.current.contentWindow === event.source)
    const comm = setupSquadsIframeBridge({
      iframeRef,
      // Restrict to the loaded dApp's origin (the communicator also checks the
      // message came from THIS iframe). The decode+confirm gate below is the real
      // protection against a hostile embedded dApp.
      allowedOrigins: (() => { try { return [new URL(currentUrl).origin]; } catch { return ["*"]; } })(),
      getCurrentVault: () => vaultPubkey,
      onProposeTransaction: async (instructions, vault) => {
        if (!connectedMember) throw new Error("No wallet connected");
        // SECURITY: never auto-sign instructions from the embedded dApp — show
        // the user the decoded program list and require explicit confirmation.
        if (!confirmProposalReview(instructions, "the in-app dApp browser")) {
          throw new Error("Proposal cancelled.");
        }
        try {
          const view = await loadMultisig(connection, vaultPubkey);
          const { tx } = await buildProposeTransaction({
            conn: connection,
            multisigPda: vaultPubkey,
            view,
            creator: connectedMember,
            instructions,
            memo: "Via in-app browser",
          });
          const sig = await sendTransaction(tx, connection);
          await connection.confirmTransaction(sig, "confirmed");
          if (!isPersonal) invalidateAfterTx(owner);
          setLastProposalSignature(sig);
        } catch (e: any) {
          alert("Failed to create proposal: " + e.message);
        }
      },
    });

    return () => {
      // Best-effort cleanup (the class has .clear but the helper returns the instance)
      try { (comm as any).clear?.(); } catch {}
    };
  }, [owner, connectedMember, connection, sendTransaction, multisigEmbeddedMode, isPersonal, iframeRef]);

  // Better detection for iframe blocks (many dApps like Jupiter set X-Frame-Options or CSP that prevent embedding;
  // onError doesn't always fire for cross-origin "refused to connect", so probe on load + pre-check known blockers)
  useEffect(() => {
    if (!currentUrl || !browserOpen) return;
    setIsLoadingIframe(true);
    setIframeError(false);

    const hostname = (() => {
      try { return new URL(currentUrl).hostname.toLowerCase(); } catch { return ''; }
    })();
    const isKnownBlocked = KNOWN_BLOCKED_DOMAINS.some(d => hostname.includes(d));

    if (isKnownBlocked) {
      setTimeout(() => {
        setIsLoadingIframe(false);
        setIframeError(true);
      }, 50);
      return;
    }

    // For others, the iframe onLoad will handle probing
  }, [currentUrl, browserOpen]);

  // SECURITY (decode + confirm gate): the ONLY legitimate sender of a
  // redacted-propose message is the Redacted extension's content script, which
  // posts SAME-ORIGIN (the handler enforces event.origin === our origin). We
  // still never auto-build+sign — we decode the program list and require explicit
  // confirmation. Function declaration so it's hoisted for the bridge effect above.
  function confirmProposalReview(
    ixs: { programId: PublicKey; data: Buffer | number[] }[],
    source: string,
  ): boolean {
    const lines = ixs.map((ix, i) => {
      const pid = ix.programId.toBase58();
      const d = ix.data as any;
      let extra = "";
      if (pid === "11111111111111111111111111111111" && Number(d[0]) === 2) {
        let lamports = 0;
        for (let k = 11; k >= 4; k--) lamports = lamports * 256 + Number(d[k]);
        extra = ` — transfer ${(lamports / 1e9).toFixed(6)} SOL`;
      }
      return `  ${i + 1}. ${pid}${extra}`;
    });
    return window.confirm(
      `A request from ${source} wants to create a proposal in YOUR vault with ${ixs.length} instruction(s):\n\n${lines.join("\n")}\n\nOnly approve if you initiated this action. Create the proposal?`,
    );
  }

  // Redacted-extension propose channel (same-origin only).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Hard origin gate: only accept messages posted from THIS page's origin
      // (the extension's content-redacted.js relays with location.origin). This
      // alone closes the old cross-origin window.opener proposal-injection vector.
      if (event.origin !== window.location.origin) return;
      if (event.source !== window) return;
      if (!event.data || event.data.type !== "redacted-propose") return;
      const { vault, instructions } = event.data;
      // Only our currently-selected vault, and only a valid instruction array.
      if (vault !== connectedAddress) return;
      if (!Array.isArray(instructions) || instructions.length === 0) return;
      if (!connectedMember) {
        alert("Connect your member wallet (the one that can propose) to create proposals from external dApps.");
        return;
      }
      let ixs: TransactionInstruction[];
      try {
        ixs = instructions.map((ix: any) => new TransactionInstruction({
          programId: new PublicKey(ix.programId),
          keys: ix.keys.map((k: any) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(ix.data),
        }));
      } catch {
        alert("Rejected a malformed external proposal request.");
        return;
      }
      if (!confirmProposalReview(ixs, event.origin || "an external site")) return;
      (async () => {
        try {
          const view = await loadMultisig(connection, new PublicKey(vault));
          const { tx } = await buildProposeTransaction({
            conn: connection,
            multisigPda: new PublicKey(vault),
            view,
            creator: connectedMember,
            instructions: ixs,
            memo: "Via Redacted extension",
          });
          const sig = await sendTransaction(tx, connection);
          await connection.confirmTransaction(sig, "confirmed");
          if (!isPersonal) invalidateAfterTx(owner);
          alert(`Proposal created! Tx: ${sig}. Review it in the Transactions tab.`);
          setLastProposalSignature(sig);
        } catch (e: any) {
          alert("Failed to create proposal from external dApp: " + (e.message || e));
        }
      })();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [connectedAddress, connectedMember, connection, sendTransaction, isPersonal, owner]);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Website search bar + apps grid (back to sensible apps page) */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>Apps</Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleSearchAdd().catch(() => {}); } }}
            size="small"
            fullWidth
            placeholder="Search dApps or type any website URL (e.g. orca.so) — adds it and opens via our embedded iframe"
            sx={{ bgcolor: 'background.paper' }}
          />
          <Button variant="contained" onClick={() => handleSearchAdd().catch(() => {})} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Add / Open</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Click any card to open. Embeddable dApps open in the in-app browser; others open in a new tab with the Redacted extension injecting "Redacted Multisig" into the connect-wallet list.
        </Typography>
      </Box>

      {/* Extension install banner — disappears once the Redacted extension is detected. */}
      {!isPersonal && !extensionInstalled && (
        <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'primary.main', borderRadius: 1, bgcolor: 'rgba(124,58,237,0.08)' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ color: 'primary.main', fontWeight: 600 }}>
                One-time setup: install the Redacted extension
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                After install, every dApp shows "Redacted Multisig" in its connect-wallet list — no extra steps per dApp. Transactions route back here for vault approval.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button
                variant="contained"
                href="/install"
              >
                Install extension
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Subtle indicator once the extension is active (multisig mode only). */}
      {!isPersonal && extensionInstalled && (
        <Box sx={{ mb: 2 }}>
          <Chip
            size="small"
            label="Redacted extension active — dApps will see your vault as 'Redacted Multisig'"
            sx={{ bgcolor: 'rgba(34,211,238,0.12)', color: '#22D3EE', borderColor: '#22D3EE' }}
            variant="outlined"
          />
        </Box>
      )}

      {/* My Apps cards */}
      <Typography variant="subtitle1" sx={{ mb: 1, color: 'text.secondary' }}>My Apps</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 4 }}>
        {customApps.length === 0 && <Typography variant="body2" color="text.secondary">No custom apps yet. Use search bar to add any site (opens in our iframe browser).</Typography>}
        {customApps.map((app) => {
          const host = (() => { try { return new URL(app.url).hostname; } catch { return app.url; } })();
          // Prefer manifest icon (Safe-style) if we fetched one when adding; else google favicon fallback
          const logo = app.iconUrl || `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
          return (
            <Paper key={app.url} sx={{ width: 200, p: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar src={logo} sx={{ width: 28, height: 28 }} />
                <Typography variant="subtitle2" noWrap title={app.url}>{app.name || host}</Typography>
              </Box>
              {app.description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 1, overflow: 'hidden', mb: 0.5, fontSize: 11 }}>{app.description}</Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.url}</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => openInEmbeddedBrowser(app.url)} sx={{ flex: 1 }}>Open</Button>
                <IconButton size="small" onClick={() => handleRemoveCustom(app.url)}><Delete fontSize="small" /></IconButton>
              </Stack>
            </Paper>
          );
        })}
      </Box>

      {/* Discover cards */}
      <Typography variant="subtitle1" sx={{ mb: 1, color: 'text.secondary' }}>Discover</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {visibleDefaults.map((app) => {
          const logo = app.logo || `https://www.google.com/s2/favicons?domain=${new URL(app.url).hostname}&sz=64`;
          return (
            <Paper key={app.name} sx={{ width: 200, p: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar src={logo} sx={{ width: 28, height: 28 }} />
                <Typography variant="subtitle2" noWrap>{app.name}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, overflow: 'hidden', mb: 1, fontSize: 11, minHeight: 32 }}>{app.desc}</Typography>
              { KNOWN_BLOCKED_DOMAINS.some(d => app.url.includes(d)) ? (
                <Button
                  size="small"
                  variant="contained"
                  fullWidth
                  disabled={!isPersonal && !extensionInstalled}
                  title={!isPersonal && !extensionInstalled ? 'Install the Redacted extension above to open this dApp with vault signing.' : undefined}
                  onClick={() => handleOpenExternally(app.url)}
                >
                  Open
                </Button>
              ) : (
                <Button size="small" variant="contained" fullWidth onClick={() => openInEmbeddedBrowser(app.url)}>Open</Button>
              )}
            </Paper>
          );
        })}
      </Box>
      {/* Our embedded iframe browser (with bar, controls, multisig support) as an overlay layer when an app is opened.
          This way the main apps page with search bar + cards is clean and makes sense. */}
      {browserOpen && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
          {/* Browser Bar */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
            <IconButton size="small" disabled={historyIndex === 0} onClick={() => {
              const prev = history[historyIndex - 1]!;
              setHistoryIndex(historyIndex - 1);
              setCurrentUrl(prev);
              setIframeError(false);
              setIsLoadingIframe(true);
              setIframeKey(k => k + 1);
            }}>
              <ArrowBack fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={historyIndex === history.length - 1} onClick={() => {
              const next = history[historyIndex + 1]!;
              setHistoryIndex(historyIndex + 1);
              setCurrentUrl(next);
              setIframeError(false);
              setIsLoadingIframe(true);
              setIframeKey(k => k + 1);
            }}>
              <ArrowForward fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => {
              setIframeError(false);
              setIsLoadingIframe(true);
              setIframeKey(k => k + 1);
            }}>
              <Refresh fontSize="small" />
            </IconButton>

            <TextField
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && navigateTo(currentUrl)}
              size="small"
              fullWidth
              placeholder="Enter URL..."
              sx={{ flex: 1, fontSize: 14 }}
            />

            <Button variant="contained" size="small" startIcon={<Add />} onClick={handleAddCurrent}>
              Add to My Apps
            </Button>

            {!isPersonal && (
              <Button variant="outlined" size="small" onClick={copyVaultAddressForSquadsX} sx={{ fontSize: "12px", textTransform: "none" }}>
                {copiedVault ? "Copied!" : "Copy vault address"}
              </Button>
            )}

            {!isPersonal && (
              <Chip label="Full Multisig Support" color={multisigEmbeddedMode ? "primary" : "default"} onClick={() => setMultisigEmbeddedMode(!multisigEmbeddedMode)} clickable size="small" />
            )}

            <IconButton size="small" onClick={() => setBrowserOpen(false)} sx={{ ml: 'auto' }}><Close /></IconButton>
          </Box>

          {/* Note */}
          <Box sx={{ px: 2, py: 0.6, bgcolor: "rgba(255,255,255,0.03)", borderBottom: "1px solid", borderColor: "divider", fontSize: "12px", color: "text.secondary", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            Most dApps block iframes. The "Open externally" option below auto-copies your vault address and opens guidance. Install the Redacted extension once and "Redacted Multisig" will appear automatically in any dApp's connect-wallet list — your vault, not the personal wallet you signed in with.
            {!isPersonal && multisigEmbeddedMode && <Chip size="small" label="Multisig Mode ON" color="primary" sx={{ height: 20 }} />}
          </Box>

          {/* Iframe - our version */}
          <Box sx={{ flex: 1, overflow: "hidden", bgcolor: "#111", position: "relative" }}>
            {!isPersonal && multisigEmbeddedMode && (
              <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10, bgcolor: 'primary.main', color: 'white', px: 1.5, py: 0.5, borderRadius: 1, fontSize: 12, fontWeight: 500 }}>
                Full Multisig Support Active
              </Box>
            )}

            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={currentUrl}
              style={{ width: "100%", height: "100%", border: "none", background: "white", display: iframeError ? 'none' : 'block' }}
              sandbox="allow-scripts allow-popups allow-forms allow-storage-access-by-user-activation"
              allow="clipboard-write; clipboard-read"
              onLoad={() => {
                setIsLoadingIframe(false);
                // Probe after short delay for security blocks (cross-origin "refused to connect" often doesn't trigger onError)
                setTimeout(() => {
                  const el = iframeRef.current;
                  if (!el) return;
                  try {
                    const cw = el.contentWindow;
                    const cd = el.contentDocument || (cw && cw.document);
                    if (!cd || !cw || cd.URL === 'about:blank' ||
                        (cd.body && (cd.body.textContent || '').toLowerCase().includes('refused to connect')) ||
                        (cd.body && (cd.body.textContent || '').toLowerCase().includes('not available'))) {
                      setIframeError(true);
                    }
                  } catch (e) {
                    // SecurityError or cross-origin block -> treat as refused
                    setIframeError(true);
                  }
                }, 700);
              }}
              onError={() => { setIsLoadingIframe(false); setIframeError(true); }}
            />

            <Button variant="outlined" size="small" onClick={() => handleOpenExternally()} sx={{ position: "absolute", top: 12, right: 12, bgcolor: "background.paper", fontSize: "12px", px: 1.5, py: 0.25 }}>
              Open externally (force vault)
            </Button>

            {isLoadingIframe && <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.6)", color: "white" }}><Typography>Loading…</Typography></Box>}

            {iframeError && (
              <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 4, textAlign: "center", bgcolor: "rgba(17,17,17,0.95)", color: "text.secondary" }}>
                <Typography variant="h6" sx={{ mb: 1 }}>{new URL(currentUrl).hostname} refused to connect in our embedded browser.</Typography>
                <Typography variant="body2" sx={{ maxWidth: 520, mb: 2 }}>
                  Expected (X-Frame-Options/CSP). Click below to open externally. With the Redacted extension installed, the vault will be available as "Redacted Multisig" in the dApp's connect-wallet list — not the personal wallet you signed in with.
                </Typography>
                <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
                  <Button variant="contained" onClick={() => handleOpenExternally()}>
                    Open externally (force multisig vault)
                  </Button>
                  {!isPersonal && (
                    <Button variant="outlined" onClick={copyVaultAddressForSquadsX}>
                      {copiedVault ? "Copied vault address!" : "Copy vault address"}
                    </Button>
                  )}
                </Stack>
                <Typography variant="caption" sx={{ maxWidth: 560 }}>
                  1. Install the Redacted extension (one-time, from the Apps page banner). 2. In the opened dApp tab, disconnect any personal wallet. 3. Connect → "Redacted Multisig" appears → select it (vault address shows as connected). Transactions become proposals here.
                </Typography>
                <Button variant="text" size="small" sx={{ mt: 1 }} onClick={() => { setIframeError(false); setIframeKey(k => k + 1); }}>
                  Retry embed
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Guidance Dialog — opens after "Open externally" if the Redacted extension isn't installed. */}
      <Dialog open={showSquadsXGuidance} onClose={() => setShowSquadsXGuidance(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Connect this dApp to your vault</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            By default the new tab uses whatever personal wallet is active in your browser (the one you signed into Redacted with). Use one of the options below so the dApp sees the multisig vault address instead.
          </Typography>

          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Vault (auto-copied to clipboard):</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
            {connectedAddress}
            <Button size="small" onClick={copyVaultAddressForSquadsX}>{copiedVault ? 'Copied!' : 'Copy'}</Button>
          </Box>

          <Typography sx={{ fontWeight: 700, mb: 0.5, color: 'primary.main' }}>Install the Redacted extension once:</Typography>
          <Typography sx={{ mb: 0.5, fontSize: 13 }}>
            One-time install. After that, "Redacted Multisig" appears in every dApp's connect-wallet list automatically. Find the install banner on the main Apps page.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 2, fontSize: 12 }}>
            Once installed, dApp actions (swap, deposit, …) post a proposal here instead of signing with your personal key. Approve in the Transactions tab.
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => { window.open(guidanceUrl || currentUrl, '_blank'); }}>
              Re-open dApp tab
            </Button>
            <Button variant="contained" fullWidth onClick={() => setShowSquadsXGuidance(false)}>
              Got it — vault will be used
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Context menu */}
      <Menu open={Boolean(contextMenu)} onClose={() => setContextMenu(null)} anchorReference="anchorPosition" anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}>
        {contextMenu?.app && (
          <MenuItem onClick={() => handleHideDefault(contextMenu.app!.name)}>Remove from Discover</MenuItem>
        )}
      </Menu>
    </Box>
  );
}
