// Runs on every dApp page in the ISOLATED world.
// Sits between wallet-provider.js (MAIN world, can't see chrome.*) and the
// extension background (which knows the active vault + routes propose flow).
//
// Flow:
//   wallet-provider.js -> postMessage(sign-request) -> here -> chrome.runtime
//     -> background -> opens Redacted tab + posts redacted-propose
//   background -> here -> postMessage(vault-update) -> wallet-provider.js

const REDACTED = '__REDACTED_BRIDGE__';

function send(kind, data) {
  window.postMessage({ source: REDACTED, kind, ...data }, '*');
}

function pushVault(vault) {
  send('vault-update', { vault: vault || null });
}

// Bootstrap: ask background for the current vault as soon as we load.
chrome.runtime.sendMessage({ kind: 'vault-get' }, (resp) => {
  if (chrome.runtime.lastError) return;
  pushVault(resp?.vault);
});

// Receive vault updates pushed from background (when user switches vault in Redacted)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === 'vault-update') pushVault(msg.vault);
});

// Forward sign-requests from the page provider to background
window.addEventListener('message', (ev) => {
  if (ev.source !== window || !ev.data || ev.data.source !== REDACTED) return;
  const m = ev.data;
  if (m.kind === 'sign-request') {
    chrome.runtime.sendMessage({
      kind: 'propose',
      vault: m.vault,
      instructions: m.instructions,
      dappOrigin: location.origin,
      dappTitle: document.title || location.hostname,
    }, (resp) => {
      send('sign-ack', { id: m.id, ok: !!resp?.ok, error: resp?.error });
    });
  } else if (m.kind === 'vault-request') {
    chrome.runtime.sendMessage({ kind: 'vault-get' }, (resp) => {
      if (!chrome.runtime.lastError) pushVault(resp?.vault);
    });
  } else if (m.kind === 'open-redacted') {
    chrome.runtime.sendMessage({ kind: 'open-redacted' });
  }
});
