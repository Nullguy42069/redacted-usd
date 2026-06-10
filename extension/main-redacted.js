// Runs in MAIN world on Redacted URLs at document_start.
// Sole job: set window.redactedExtensionInstalled before the React app mounts,
// so the apps page detects the extension synchronously and hides the install banner.
// (Avoiding the content-script -> <script> injection path keeps us out of the
// page CSP's reach.)
(() => {
  if (window.redactedExtensionInstalled) return;
  window.redactedExtensionInstalled = true;
  window.redactedExtensionVersion = '0.1.0';
  try {
    window.dispatchEvent(new CustomEvent('redacted-extension-ready', { detail: { version: '0.1.0' } }));
  } catch {}
})();
