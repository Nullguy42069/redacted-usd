// Redacted Service Worker — v2.
//
// Two jobs:
//   1. Receive `push` events from a future Web Push backend and turn them into
//      desktop notifications (works even when no Redacted tab is open).
//   2. Handle clicks on notifications: focus an existing Redacted tab if one
//      exists, otherwise open a new one at the relevant deep link.

self.addEventListener("install", (event) => {
  // Activate immediately — no skip-waiting limbo state for users.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event: the server will (in v2.1) send a JSON payload with
// { title, body, icon, tag, href, data }. For now this handler is wired so
// that when the backend ships, the browser is already set up to receive.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Redacted", body: event.data?.text?.() ?? "" };
  }
  const {
    title = "Redacted",
    body = "",
    icon = "/icon-128.png",
    badge = "/favicon-16.png",
    tag,
    href,
    data,
    requireInteraction = false,
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { ...(data || {}), href },
      requireInteraction,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer focusing an existing Redacted tab — saves the user a tab spawn.
      for (const c of all) {
        if (c.url.includes(self.location.origin)) {
          await c.focus();
          if ("navigate" in c) await c.navigate(href);
          return;
        }
      }
      await self.clients.openWindow(href);
    })(),
  );
});
