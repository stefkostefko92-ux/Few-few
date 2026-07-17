/* Carbon Stealth VCC — service worker (offline + fast repeat visits, PWA installable) */
const VERSION = 'cs-v1';
const CORE = ['/', '/manifest.webmanifest', '/logo.png', '/favicon.svg', '/offline.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.filter(Boolean))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // don't touch cross-origin (fonts, ipapi, etc.)
  if (url.pathname.startsWith('/api/')) return;          // never cache API / live data / SSE

  const isAsset = /\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg|ico|xml|txt|json)$/i.test(url.pathname) || url.pathname.startsWith('/assets/');

  if (isAsset) {
    // cache-first for hashed/static assets
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // network-first for navigations/HTML, fall back to cache, then offline page
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('/offline.html')))
  );
});
