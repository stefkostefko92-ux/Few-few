// Service worker за „За Бобов дол“ — дава ОФЛАЙН достъп до най-важното за
// възрастните хора (телефони, дежурна аптека) при слаб сигнал, и прави
// приложението инсталируемо (PWA/TWA).
//
// Стратегия:
//  • Навигации (HTML): „мрежа първо“ с резерв от кеша → офлайн пак виждаш
//    последно заредените страници (или началната като резерв).
//  • Статични ресурси (икони, manifest): „кеш първо“.
//  • POST/API и всичко извън GET: само мрежа (не се кешира).
//  • Страниците с търсене (/tarsene?q=…, /imen-den?ime=…) НЕ се кешират:
//    адресът носи въведения текст, а кешът не бива да пази данни от формите.

const VERSION = "v3";
const CACHE = `zbd-${VERSION}`;

// Пътища, чийто адрес носи въведен от човека текст — само мрежа, без кеш.
const NO_CACHE_PATHS = ["/tarsene", "/imen-den"];

function isNoCachePath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    NO_CACHE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

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
      // …и търсенията, записани от по-стар service worker в същия кеш.
      try {
        const cache = await caches.open(CACHE);
        const reqs = await cache.keys();
        await Promise.all(
          reqs
            .filter((r) => isNoCachePath(new URL(r.url).pathname))
            .map((r) => cache.delete(r)),
        );
      } catch {
        /* чистенето е допълнително — не спира активирането */
      }
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
  // /api, /admin и търсенето — само мрежа, браузърът ги обработва сам (нищо не
  // се записва в Cache Storage).
  if (isNoCachePath(url.pathname) || url.pathname.startsWith("/admin")) {
    return;
  }
  // RSC заявките на App Router (?_rsc=…) са динамични данни при навигация в
  // клиента — кеширането им би „замразило“ force-dynamic страници (напр.
  // дежурната аптека) и би сочило стари чънкове след деплой.
  if (url.searchParams.has("_rsc")) return;

  // Навигации: мрежа първо, резерв от кеша (или началната страница).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Кешираме само успешни отговори — 404/500 страница не бива да
          // замества добрия офлайн резерв.
          if (fresh.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone());
          }
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

// ---------------------------------------------------------------------------
// Известия (web push). Товарът е JSON {title, body, url}; url е САМО вътрешен път.
// ---------------------------------------------------------------------------
function safePath(u) {
  if (typeof u !== "string") return "/";
  if (!u.startsWith("/") || u.startsWith("//") || u.includes("\\")) return "/";
  return u;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = (data.title && String(data.title).slice(0, 120)) || "За Бобов дол";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ? String(data.body).slice(0, 300) : "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      lang: "bg",
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          try {
            if ("navigate" in c) await c.navigate(target);
            return await c.focus();
          } catch {
            /* пробваме да отворим нов прозорец */
          }
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
