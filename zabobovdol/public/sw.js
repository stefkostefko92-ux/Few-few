// Service worker за „За Бобов дол“ — дава ОФЛАЙН достъп до най-важното за
// възрастните хора (телефони, дежурна аптека) при слаб сигнал, и прави
// приложението инсталируемо (PWA/TWA).
//
// Стратегия:
//  • Навигации (HTML): „мрежа първо“ с резерв от кеша → офлайн пак виждаш
//    последно заредените страници (или началната като резерв).
//  • Статични ресурси (икони, manifest): „кеш първо“.
//  • POST/API и всичко извън GET: само мрежа (не се кешира).

const VERSION = "v1";
const CACHE = `zbd-${VERSION}`;

// Опитваме да предзаредим ключовите страници; ако някоя липсва, не проваляме
// инсталацията.
const PRECACHE = [
  "/",
  "/uslugi",
  "/dezhurna-apteka",
  "/izmami",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Изчистваме стари версии на кеша.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Само GET се кешира; останалото (вкл. /api, форми) минава директно.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) {
    return;
  }

  // Навигации: мрежа първо, резерв от кеша (или началната страница).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match("/")) ||
            new Response(
              "<!doctype html><meta charset=utf-8><title>Няма връзка</title>" +
                "<body style='font-family:system-ui;padding:2rem;text-align:center'>" +
                "<h1>Няма интернет връзка</h1><p>Опитайте отново, когато се " +
                "появи сигнал.</p></body>",
              { headers: { "content-type": "text/html; charset=utf-8" } },
            )
          );
        }
      })(),
    );
    return;
  }

  // Статични ресурси: кеш първо, после мрежа (и попълваме кеша).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok && fresh.type === "basic") cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
