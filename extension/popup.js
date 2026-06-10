document.getElementById('ver').textContent = chrome.runtime.getManifest().version;

const vaultEl = document.getElementById('vault');

chrome.runtime.sendMessage({ kind: 'vault-get' }, (resp) => {
  const v = resp?.vault;
  if (v) {
    vaultEl.textContent = v;
    vaultEl.classList.remove('empty');
  }
});

document.getElementById('open').addEventListener('click', () => {
  chrome.runtime.sendMessage({ kind: 'open-redacted' });
  window.close();
});
