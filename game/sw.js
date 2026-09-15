// Minimal service worker so the game is installable as a home-screen web app.
// Intentionally network-only (no caching) to keep deploys always fresh.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
