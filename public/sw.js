// Minimal service worker — network-first, required for PWA installability
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  // Network-first passthrough; analyses require connectivity anyway
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
