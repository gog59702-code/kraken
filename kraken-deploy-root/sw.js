/* Kraken - service worker minimal : reception des notifications systeme */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find(w => w.url.includes("index.html")) || wins[0];
    if (open) return open.focus();
    return self.clients.openWindow("./index.html");
  })());
});