// MV3 service worker. Holds active vault, routes propose payloads from dApp
// tabs into the Redacted tab (opens one if none exists).

const STORAGE_KEY = 'activeVault';

// Allowed Redacted URLs (must match manifest content_scripts redacted match list).
// Canonical app domain is redacted-usd.xyz — we deliberately do NOT trust
// .com/.pro here: pointing the wallet bridge (vault selection + propose relay)
// at domains the project may not own would let whoever controls them drive the
// extension. localhost is dev-only.
const REDACTED_URLS = [
  'http://localhost:3000/*',
  'https://redacted-usd.xyz/*',
  'https://*.redacted-usd.xyz/*',
];

// Production app URL used when we have to open a new tab from scratch.
const REDACTED_APP_URL = 'https://redacted-usd.xyz/apps';

// Origins permitted to drive privileged messages (vault-set). A sender must be a
// Redacted tab, not an arbitrary dApp content script.
const REDACTED_ORIGIN_RE = /^(https:\/\/(.*\.)?redacted-usd\.xyz|http:\/\/localhost:3000)$/;

function senderIsRedacted(sender) {
  try {
    const u = sender?.origin || (sender?.url ? new URL(sender.url).origin : null);
    return !!u && REDACTED_ORIGIN_RE.test(u);
  } catch {
    return false;
  }
}

async function getVault() {
  const { [STORAGE_KEY]: vault } = await chrome.storage.local.get(STORAGE_KEY);
  return vault || null;
}

async function setVault(vault) {
  await chrome.storage.local.set({ [STORAGE_KEY]: vault || null });
  broadcastVault(vault);
}

async function findRedactedTab() {
  const tabs = await chrome.tabs.query({ url: REDACTED_URLS });
  if (!tabs.length) return null;
  // Prefer the most recently focused
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function focusOrOpenRedacted() {
  const tab = await findRedactedTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    return tab;
  }
  return chrome.tabs.create({ url: REDACTED_APP_URL, active: true });
}

function broadcastVault(vault) {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id == null) continue;
      chrome.tabs.sendMessage(t.id, { kind: 'vault-update', vault }).catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.kind === 'vault-get') {
        sendResponse({ vault: await getVault() });
      } else if (msg.kind === 'vault-set') {
        // Only a genuine Redacted tab may set the active vault. Without this, any
        // content script could repoint which vault the extension reports/uses.
        if (!senderIsRedacted(sender)) {
          sendResponse({ ok: false, error: 'unauthorized-origin' });
          return;
        }
        await setVault(msg.vault);
        sendResponse({ ok: true });
      } else if (msg.kind === 'open-redacted') {
        await focusOrOpenRedacted();
        sendResponse({ ok: true });
      } else if (msg.kind === 'propose') {
        // Always use the extension's own stored vault — NEVER the vault a dApp
        // content script supplies. A dApp must not get to choose which of the
        // user's vaults a proposal targets.
        const vault = await getVault();
        if (!vault) {
          await focusOrOpenRedacted();
          sendResponse({ ok: false, error: 'No active vault. Open Redacted and pick one.' });
          return;
        }
        const tab = await focusOrOpenRedacted();
        // Wait briefly for new tabs to mount their content script before relaying.
        const relay = () => chrome.tabs.sendMessage(tab.id, {
          kind: 'incoming-propose',
          vault,
          instructions: msg.instructions,
          dappOrigin: msg.dappOrigin,
          dappTitle: msg.dappTitle,
        }).catch(() => {});
        relay();
        setTimeout(relay, 1500);
        setTimeout(relay, 3500);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'unknown-kind' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // async response
});

// Click toolbar icon when no popup or as a shortcut: open Redacted.
chrome.action.onClicked.addListener(() => focusOrOpenRedacted().catch(() => {}));
