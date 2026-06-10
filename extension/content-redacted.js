// Runs on Redacted pages in the ISOLATED world. Bridges:
//  - React app vault changes -> extension storage
//  - Background "incoming-propose" messages -> page's existing redacted-propose listener
// The presence flag (window.redactedExtensionInstalled) is set by main-redacted.js
// which runs in the MAIN world (this script can't touch page globals from isolated).

const TAG = '__REDACTED_BRIDGE__';

// React app -> extension: vault change announcements
window.addEventListener('message', (ev) => {
  if (ev.source !== window || !ev.data) return;
  const m = ev.data;
  if (m.source !== TAG) return;
  if (m.kind === 'vault-set') {
    chrome.runtime.sendMessage({ kind: 'vault-set', vault: m.vault || null });
  }
});

// 2b) Background -> Redacted page: propose payload arriving from a dApp tab.
//     We rewrite it as the legacy 'redacted-propose' postMessage the React
//     app already listens for (apps/page.tsx:325).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === 'incoming-propose') {
    window.postMessage({
      type: 'redacted-propose',
      vault: msg.vault,
      instructions: msg.instructions,
      dappOrigin: msg.dappOrigin,
      dappTitle: msg.dappTitle,
    }, location.origin);
  }
});
