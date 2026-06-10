// Redacted Service Worker — v2.1.
//
// Two jobs:
//   1. Receive `push` events from a future Web Push backend and turn them into
//      desktop notifications (works even when no Redacted tab is open).
//   2. Handle clicks on notifications: focus an existing Redacted tab if one
//      exists, otherwise open a new one at the relevant deep link.
//
// HARDENING (Fable 5 audit 2026-06-10):
//   - Removed skipWaiting() — a bad/hijacked deploy now waits for users to close
//     all tabs before activating, instead of instantly taking over open sessions
//     with a fake signing dialog.
//   - notificationclick now allowlists the href to same-origin paths only. An
//     attacker who can craft a notification payload can no longer redirect the
//     user to an external phishing page.

self.addEventListener("install", (event) => {
  // INTENTIONALLY do NOT call self.skipWaiting() — see audit note above.
  // The next SW version waits for the user to close all controlled tabs
  // before activating. That brief friction is the safety property.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event: the server will (in v2.2) send a JSON payload with
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

// Restrict navigation target to same-origin paths. Any href that resolves to a
// different origin (i.e. starts with a different scheme/host) is clamped to "/".
// Belt-and-suspenders: also drop javascript: and data: schemes regardless.
function sanitizeNavHref(rawHref) {
  if (!rawHref || typeof rawHref !== "string") return "/";
  try {
    const u = new URL(rawHref, self.location.origin);
    if (u.origin !== self.location.origin) return "/";
    // Strip any protocol that snuck through (URL normalizes most of these).
    if (u.protocol !== "https:" && u.protocol !== "http:") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = sanitizeNavHref(event.notification.data?.href);
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer focusing an existing Redacted tab — saves the user a tab spawn.
      for (const c of all) {
        if (c.url.startsWith(self.location.origin)) {
          await c.focus();
          if ("navigate" in c) await c.navigate(href);
          return;
        }
      }
      await self.clients.openWindow(href);
    })(),
  );
});
