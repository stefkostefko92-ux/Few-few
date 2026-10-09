// MedQR service worker — офлайн достъп до съществените екрани.
// Сценарий: няма сигнал (метро, сграда, планина). Запазено копие на личния
// SOS екран и таблото на собственика (чистят се при изход) и статичните ресурси.
// Спешният профил на ДРУГ човек (/e/<токен>) никога не се кешира на устройството.
const VERSION = 'v6';
const SHELL = `medqr-shell-${VERSION}`;
const RUNTIME = `medqr-runtime-${VERSION}`;
const PRIVATE = `medqr-private-${VERSION}`; // чувствителни лични екрани — чистят се при изход

const SHELL_ASSETS = [
  '/',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon-48.png',
  '/logo-112.webp',
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

// Само СТАТИЧНИ ресурси се кешират трайно. Динамични QR/етикети (/qr.png, /label.svg)
// съдържат спешния токен и НЕ са статични.
const STATIC_RE =
  /^\/(?!qr\.png|label\.svg|e\/)[^?]*\.(?:css|js|woff2|svg|png|jpe?g|webp|webmanifest)$/i;
// Публичен маркетингов/правен контент — безопасен за общия кеш.
const PUBLIC_PAGE_RE = /^\/(?:about|contact|privacy|cookies|terms|accessibility)?\/?$/i;
// Лични екрани на самия собственик — отделен кеш, който се чисти при изход/изтриване.
const PRIVATE_RE = /^\/(?:sos|dashboard)\/?$/i;
// ВСЕ ОСТАНАЛО (/e/<токен> — чужд медицински профил на телефона на спасителя, /profile/*,
// /card, /login, /2fa …) НЕ се кешира никога: иначе чувствителни данни остават на устройство,
// което може да не е на собственика, и не се чистят (GDPR чл. 5(1)(е), чл. 32).

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

  // Навигации: network-first. Кешираме само публични страници и личните /sos, /dashboard.
  if (request.mode === 'navigate') {
    const cacheName = PRIVATE_RE.test(url.pathname)
      ? PRIVATE
      : PUBLIC_PAGE_RE.test(url.pathname)
        ? RUNTIME
        : null;
    if (!cacheName) return; // без кеш и без офлайн копие — браузърът ходи директно в мрежата
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
