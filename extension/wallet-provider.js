// Wallet Standard provider for "Redacted Multisig".
// Runs in MAIN world at document_start on every dApp page so it registers
// before the dApp's wallet adapter initializes. Signing requests are forwarded
// via window.postMessage -> content-bridge.js (ISOLATED) -> background ->
// Redacted tab, which creates the multisig proposal.

(() => {
  if (window.__redactedInjected) return;
  window.__redactedInjected = true;

  const REDACTED = '__REDACTED_BRIDGE__';
  let activeVault = null;
  const pendingSign = new Map();
  let reqSeq = 0;

  // ---- tiny base58 -> 32-byte decoder (no deps; only used for pubkey bytes) ----
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58Decode(s) {
    const out = new Uint8Array(32);
    if (!s) return out;
    let bytes = [0];
    for (const ch of s) {
      const idx = B58.indexOf(ch);
      if (idx < 0) return out;
      let carry = idx;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    for (const ch of s) { if (ch !== '1') break; bytes.push(0); }
    bytes.reverse();
    const start = Math.max(0, bytes.length - 32);
    for (let i = 0; i < 32 && start + i < bytes.length; i++) out[i + (32 - (bytes.length - start))] = bytes[start + i];
    return out;
  }

  function pubkeyBytes() {
    return activeVault ? base58Decode(activeVault) : new Uint8Array(32);
  }

  // ---- extract instructions from a Transaction or VersionedTransaction ----
  function extractIxs(tx) {
    const ixs = [];
    try {
      if (tx?.instructions?.length) {
        for (const ix of tx.instructions) {
          ixs.push({
            programId: ix.programId?.toBase58?.() ?? String(ix.programId),
            keys: (ix.keys || []).map(k => ({
              pubkey: k.pubkey?.toBase58?.() ?? String(k.pubkey),
              isSigner: !!k.isSigner,
              isWritable: !!k.isWritable,
            })),
            data: Array.from(ix.data || []),
          });
        }
      } else if (tx?.message?.compiledInstructions) {
        // NOTE: this reads STATIC account keys only — it can't resolve Address
        // Lookup Tables in the MAIN world without web3.js. For LUT-using txs the
        // extracted keys are incomplete; the Redacted app re-decodes + LUT-resolves
        // and the user reviews program IDs before the proposal is created
        // (apps/page.tsx confirmProposalReview). Full LUT resolution here is a
        // follow-up (serialize + forward raw, like the Uint8Array path below).
        const msg = tx.message;
        const ak = msg.getAccountKeys?.()?.staticAccountKeys || msg.staticAccountKeys || [];
        const sgn = msg.header?.numRequiredSignatures || 0;
        const ro = msg.header?.numReadonlySignedAccounts || 0;
        for (const ci of msg.compiledInstructions) {
          const prog = ak[ci.programIdIndex];
          ixs.push({
            programId: prog?.toBase58?.() ?? String(prog),
            keys: ci.accountKeyIndexes.map((idx) => ({
              pubkey: ak[idx]?.toBase58?.() ?? String(ak[idx]),
              isSigner: idx < sgn,
              isWritable: idx < (ak.length - ro),
            })),
            data: Array.from(ci.data || []),
          });
        }
      } else if (tx instanceof Uint8Array) {
        // Serialized — we can't decode without web3.js here. Forward raw bytes;
        // background will create a proposal that re-decodes server-side.
        ixs.push({ raw: Array.from(tx) });
      }
    } catch (e) { console.warn('[Redacted] ix extract error', e); }
    return ixs;
  }

  function sendSignRequest(tx) {
    const id = ++reqSeq;
    return new Promise((resolve, reject) => {
      pendingSign.set(id, { resolve, reject });
      window.postMessage({
        source: REDACTED,
        kind: 'sign-request',
        id,
        vault: activeVault,
        instructions: extractIxs(tx),
      }, window.location.origin);
    });
  }

  const ICON =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjN0MzQUVEIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMjJEM0VFIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyOCIgZmlsbD0idXJsKCNnKSIvPjx0ZXh0IHg9IjY0IiB5PSI4OCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNzIiIGZvbnQtd2VpZ2h0PSI4MDAiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlI8L3RleHQ+PC9zdmc+';

  // ---- Wallet Standard objects ----
  const account = () => ({
    address: activeVault || '11111111111111111111111111111111',
    publicKey: pubkeyBytes(),
    chains: ['solana:mainnet'],
    features: ['solana:signTransaction', 'solana:signAndSendTransaction'],
    label: activeVault ? 'Redacted Vault' : 'Redacted Multisig',
    icon: ICON,
  });

  const eventListeners = { change: new Set() };

  function fireChange() {
    for (const l of eventListeners.change) {
      try { l({ accounts: [account()] }); } catch {}
    }
  }

  const wallet = {
    version: '1.0.0',
    name: 'Redacted Multisig',
    icon: ICON,
    chains: ['solana:mainnet'],
    get accounts() { return [account()]; },
    features: {
      // NOTE (security follow-up): connect auto-returns the active vault account
      // with no per-origin user approval. Impact is low — the vault address is a
      // public on-chain pubkey, no funds move, and every actual transaction still
      // routes through the Redacted app for explicit multisig approval (and the
      // background only ever proposes into the user's own stored vault). A
      // per-origin connect allow-list is the planned hardening here.
      'standard:connect': {
        version: '1.0.0',
        connect: async () => ({ accounts: [account()] }),
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => {},
      },
      'standard:events': {
        version: '1.0.0',
        on: (event, listener) => {
          (eventListeners[event] ||= new Set()).add(listener);
          return () => eventListeners[event]?.delete(listener);
        },
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: async (...inputs) => {
          for (const input of inputs) await sendSignRequest(input.transaction);
          throw new Error('Redacted: proposal created in your vault. Approve & execute in the Redacted app.');
        },
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signAndSendTransaction: async (...inputs) => {
          for (const input of inputs) await sendSignRequest(input.transaction);
          throw new Error('Redacted: proposal created in your vault. Approve & execute in the Redacted app.');
        },
      },
    },
  };

  // ---- Wallet Standard registration (the actual handshake) ----
  // Spec:
  //   - Wallet fires `wallet-standard:register-wallet` with detail = (api) => api.register(wallet).
  //     Apps already loaded will call the callback.
  //   - App fires `wallet-standard:app-ready` with detail = { register }.
  //     Wallets that load later listen and call register(wallet).
  //   - There's also `window.navigator.wallets` queue some adapters drain.
  function register(api) {
    try { api.register(wallet); } catch (e) { console.warn('[Redacted] register err', e); }
  }
  function announce() {
    try {
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
    } catch (e) { console.warn('[Redacted] dispatch err', e); }
  }
  window.addEventListener('wallet-standard:app-ready', (ev) => {
    try { ev.detail?.register?.(wallet); } catch (e) { console.warn('[Redacted] app-ready err', e); }
  });
  // navigator.wallets queue (used by some older Solana adapters)
  try {
    const nav = window.navigator;
    if (!nav.wallets) nav.wallets = [];
    if (Array.isArray(nav.wallets)) nav.wallets.push({ register });
  } catch {}
  // Announce now and again shortly after, in case the adapter scripts haven't bound yet.
  announce();
  setTimeout(announce, 100);
  setTimeout(announce, 500);
  setTimeout(announce, 1500);

  // ---- Legacy Phantom-style provider (older dApps still check window.solana) ----
  const legacy = {
    isRedacted: true,
    isPhantom: false,
    get publicKey() {
      const v = activeVault;
      if (!v) return null;
      return { toBase58: () => v, toString: () => v, toBytes: () => pubkeyBytes(), equals: (o) => o?.toBase58?.() === v };
    },
    get isConnected() { return !!activeVault; },
    connect: async () => {
      if (!activeVault) {
        window.postMessage({ source: REDACTED, kind: 'open-redacted' }, window.location.origin);
        throw new Error('Redacted: open the Redacted app and select a vault.');
      }
      return { publicKey: legacy.publicKey };
    },
    disconnect: async () => {},
    signTransaction: async (tx) => {
      await sendSignRequest(tx);
      throw new Error('Redacted: proposal created. Approve & execute in the Redacted app.');
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) await sendSignRequest(tx);
      throw new Error('Redacted: proposals created. Approve & execute in the Redacted app.');
    },
    on: () => legacy,
    off: () => legacy,
    removeListener: () => legacy,
  };
  try { window.redactedMultisig = legacy; } catch {}

  // ---- Bridge messages from content-bridge.js ----
  window.addEventListener('message', (ev) => {
    // Same-window + same-origin only. ev.origin is the page origin for the
    // content-bridge's pinned postMessage; reject anything else.
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    if (!ev.data || ev.data.source !== REDACTED) return;
    const m = ev.data;
    if (m.kind === 'vault-update') {
      const prev = activeVault;
      activeVault = m.vault || null;
      if (prev !== activeVault) { fireChange(); announce(); }
    } else if (m.kind === 'sign-ack' && pendingSign.has(m.id)) {
      const p = pendingSign.get(m.id);
      pendingSign.delete(m.id);
      m.ok ? p.resolve(m) : p.reject(new Error(m.error || 'sign rejected'));
    }
  });

  // Ask bridge for the current vault on load
  window.postMessage({ source: REDACTED, kind: 'vault-request' }, window.location.origin);

  console.log('%c[Redacted Multisig] provider registered (Wallet Standard)', 'color:#7C3AED;font-weight:600');
})();
