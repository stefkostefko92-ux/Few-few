// MedQR service worker — офлайн достъп до съществените екрани.
// Сценарий: няма сигнал (метро, сграда, планина). Запазено копие на личния
// SOS екран, таблото, спешния изглед и статичните ресурси работи и офлайн.
const VERSION = 'v3';
const SHELL = `medqr-shell-${VERSION}`;
const RUNTIME = `medqr-runtime-${VERSION}`;
const PRIVATE = `medqr-private-${VERSION}`; // чувствителни лични екрани — чистят се при изход

const SHELL_ASSETS = [
  '/',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/fonts/inter-cyrillic-400-normal.woff2',
  '/fonts/inter-latin-400-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => ![SHELL, RUNTIME, PRIVATE].includes(k)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Изчистване на личния кеш при изход (съобщение от страницата).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'clear-private') caches.delete(PRIVATE);
});

const STATIC_RE = /\.(?:css|js|woff2|svg|png|jpe?g|webmanifest)$/;
const PRIVATE_RE = /^\/(sos|dashboard|e\/)/;

// Записът в кеша задължително минава през waitUntil, за да не бъде прекъснат
// преди да завърши (service worker-ът може да заспи след respondWith).
function cachePut(e, cacheName, request, response) {
  e.waitUntil(caches.open(cacheName).then((c) => c.put(request, response)));
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Статични ресурси: stale-while-revalidate — връщаме кеша веднага (бързо и
  // офлайн), но паралелно дърпаме свежо копие, така че следващото зареждане е
  // актуално дори без ръчно вдигане на версията на кеша.
  if (STATIC_RE.test(url.pathname)) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cachePut(e, SHELL, request, res.clone());
            return res;
          })
          .catch(() => null);
        if (cached) {
          e.waitUntil(network);
          return cached;
        }
        return (await network) || fetch(request);
      })()
    );
    return;
  }

  // Навигации: network-first, резерва от кеша при липса на връзка.
  if (request.mode === 'navigate') {
    const cacheName = PRIVATE_RE.test(url.pathname) ? PRIVATE : RUNTIME;
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) cachePut(e, cacheName, request, res.clone());
          return res;
        } catch {
          const hit = await caches.match(request);
          return hit || (await caches.match('/'));
        }
      })()
    );
  }
});
