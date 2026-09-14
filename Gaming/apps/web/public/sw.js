/*
 * АСО — app-shell service worker (dependency-free, runtime caching).
 *
 * No build-time precache list: the SW caches on first fetch, so it survives
 * hashed asset names without a Workbox step. Strategy:
 *   • navigations → network-first, fall back to the cached shell when offline;
 *   • hashed static assets → cache-first (they're immutable);
 *   • /api and /socket.io → never touched (always live).
 * Bump VERSION to invalidate all caches on the next activation.
 */
const VERSION = "aso-v1";
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_CACHE = `${VERSION}-shell`;

self.addEventListener("install", () => {
  // Take over as soon as installed; the page decides when to reload (update toast).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isImmutableAsset = (pathname) =>
  pathname.includes("/assets/") || /\.(?:js|css|woff2?|png|jpe?g|svg|webp|gif|ico|mp3|ogg)$/.test(pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone
  if (url.pathname.startsWith("/api") || url.pathname.includes("/socket.io")) return; // always live

  // App navigations: network-first so players get fresh HTML, cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const shell =
            (await cache.match(req)) ||
            (await cache.match(new URL("index.html", self.registration.scope).href)) ||
            (await cache.match(self.registration.scope));
          return shell || Response.error();
        }
      })(),
    );
    return;
  }

  // Immutable static assets: cache-first, fill the cache on first hit.
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
  }
});
