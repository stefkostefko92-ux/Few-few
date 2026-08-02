// Service worker — САМО за да се инсталира като приложение на телефона и да
// зареди обвивката офлайн. НИКОГА не кешира /api/ — данните за сървъра трябва да
// са живи, а кеширан отговор от контролен панел е опасно подвеждащ.
const CACHE = 'csd-shell-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/ui.js', '/ansi.js', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API и потоци — винаги по мрежата, никакъв кеш.
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  // Обвивката: мрежата е с предимство, кешът е резерв (за да не сервираме стар JS).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
