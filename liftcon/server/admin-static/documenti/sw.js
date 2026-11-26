// Service worker на приложението LiftCon (PWA, обхват /admin/). Сървърът го праща като /admin/sw.js и слага
// версията (отпечатък на файловете): нов деплой → нов кеш на кода, без смесени версии; старият се трие.
// Кешира само: обвивката на документите и кода (без лични данни), каталога („мрежа, иначе кеш“) и
// миниатюрите на снимките на отворените документи. Другите страници на панела НЕ се кешират — без връзка
// показват кратка страница с път към документите (които работят офлайн). Данните се трият при изход (app.js).
const VERSIONE = "__VERSIONE__";
const STATICO = `liftcon-statico-${VERSIONE}`;
const DATI = "liftcon-doc-dati";
const SHELL = "/admin/documenti/";
const LIB = ["tipi", "testi", "formato", "composto", "componi", "componi-sopralluogo", "componi-altri", "completezza", "nuovo"].map((m) => `/admin/static/lib/${m}.js`);
const APP = ["app", "ui", "db", "api", "sync", "foto", "campi", "etichette", "ed-sopralluogo", "ed-altri", "anteprima", "editor", "elenco", "installa"].map((m) => `/admin/static/documenti/${m}.js`);
const RISORSE = [SHELL, "/admin/static/admin.css", "/admin/static/admin.js", "/admin/static/documenti/documenti.css", "/admin/static/logo.webp", "/admin/static/favicon.png", ...APP, ...LIB];

const OFFLINE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Senza connessione | LiftCon</title><link rel="stylesheet" href="/admin/static/admin.css"></head><body class="semplice"><header class="testa"><span class="marchio"><img src="/admin/static/logo.webp" width="154" height="36" alt="LiftCon"></span></header><main class="corpo"><h1>Senza connessione</h1><div class="scheda"><p>Questa pagina del pannello richiede la connessione. I documenti funzionano anche offline: le modifiche restano sul dispositivo e si sincronizzano appena possibile.</p><a class="btn" href="/admin/documenti/">Apri i documenti</a></div></main></body></html>`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(STATICO)
      .then((c) => Promise.all(RISORSE.map((u) => fetch(u, { credentials: "same-origin", cache: "no-cache" }).then((r) => (r.ok && !r.redirected ? c.put(u, r) : null)).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((x) => (x.startsWith("liftcon-statico-") && x !== STATICO) || x.startsWith("liftcon-doc-statico")).map((x) => caches.delete(x))))
      .then(() => self.clients.claim()),
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

async function cacheORete(req, cache) {
  const c = await caches.match(req, { ignoreSearch: req.url.includes("/admin/static/lib/") });
  if (c) return c;
  const r = await fetch(req);
  if (r.ok && !r.redirected) (await caches.open(cache)).put(req, r.clone());
  return r;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/admin/")) return;
  if (req.mode === "navigate") {
    if (url.pathname === SHELL) return e.respondWith(reteOCache(req, STATICO, SHELL));
    return e.respondWith(fetch(req).catch(() => new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })));
  }
  if (url.pathname.startsWith("/admin/static/") || url.pathname === "/admin/manifest.webmanifest") return e.respondWith(cacheORete(req, STATICO));
  // Само каталогът (без лични данни). Сесията (с CSRF токена) не се кешира: приложението пази за офлайн само
  // името и правата в IndexedDB (без токена).
  if (url.pathname === "/admin/api/catalogo") return e.respondWith(reteOCache(req, DATI));
  if (/^\/admin\/documenti\/[0-9a-f-]{36}\/foto\/[0-9a-f-]{36}$/.test(url.pathname) && url.searchParams.get("mini") === "1") return e.respondWith(cacheORete(req, DATI));
});
