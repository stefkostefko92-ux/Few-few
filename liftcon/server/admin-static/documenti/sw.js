// Service worker на документите (спецификация D7, D17): обвивката и кодът — в кеша (работят без връзка);
// каталогът и сесията — „мрежа, иначе кеш“; миниатюрите на снимките — „кеш, иначе мрежа“. Нищо друго от
// API-то не се кешира (документите са в IndexedDB). Кешът с данни се трие при изход (app.js).
const STATICO = "liftcon-doc-statico-v1";
const DATI = "liftcon-doc-dati-v1";
const LIB = ["tipi", "testi", "formato", "composto", "componi", "componi-sopralluogo", "componi-altri", "completezza", "nuovo"].map((m) => `/admin/static/lib/${m}.js`);
const APP = ["app", "ui", "db", "api", "sync", "foto", "campi", "etichette", "ed-sopralluogo", "ed-altri", "anteprima", "editor", "elenco"].map((m) => `/admin/static/documenti/${m}.js`);
const RISORSE = ["/admin/documenti/", "/admin/static/admin.css", "/admin/static/documenti/documenti.css", "/admin/static/logo.webp", "/admin/static/favicon.png", ...APP, ...LIB];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATICO).then((c) => Promise.all(RISORSE.map((u) => fetch(u, { credentials: "same-origin", cache: "no-cache" }).then((r) => (r.ok && !r.redirected ? c.put(u, r) : null)).catch(() => null)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("liftcon-doc-") && x !== STATICO && x !== DATI).map((x) => caches.delete(x)))).then(() => self.clients.claim()),
  );
});

async function reteOCache(req, cache, chiave = req) {
  try {
    const r = await fetch(req);
    if (r.ok && !r.redirected) (await caches.open(cache)).put(chiave, r.clone());
    return r;
  } catch {
    return (await caches.match(chiave)) ?? new Response(JSON.stringify({ errore: "offline" }), { status: 503, headers: { "content-type": "application/json" } });
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate" && url.pathname === "/admin/documenti/") return e.respondWith(reteOCache(req, STATICO, "/admin/documenti/"));
  if (url.pathname.startsWith("/admin/static/")) {
    // „кеш, после обновяване“: бързо и без връзка; новата версия идва при следващото зареждане
    return e.respondWith(
      caches.match(url.pathname).then((c) => {
        const net = fetch(req).then((r) => (r.ok ? caches.open(STATICO).then((k) => k.put(url.pathname, r.clone())).then(() => r) : r)).catch(() => c);
        return c ?? net;
      }),
    );
  }
  if (url.pathname === "/admin/api/catalogo" || url.pathname === "/admin/api/sessione") return e.respondWith(reteOCache(req, DATI));
  if (/^\/admin\/documenti\/[0-9a-f-]{36}\/foto\/[0-9a-f-]{36}$/.test(url.pathname) && url.searchParams.get("mini") === "1") {
    return e.respondWith(caches.match(req).then((c) => c ?? reteOCache(req, DATI)));
  }
});
