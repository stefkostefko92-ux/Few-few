// Service worker на Мастилко — прави приложението достъпно офлайн, без да
// застарява билда. Консервативни стратегии:
//  • навигации (HTML): network-first → кеш → офлайн начална страница;
//  • статични ресурси (_next/static, картинки, шрифтове): stale-while-revalidate
//    (бързо, но с фоново обновяване; хешираните имена така или иначе се сменят);
//  • /api/* и /admin/* НИКОГА не се кешират (AI заявки, админ сесия).
// Версията в името на кеша чисти старите при активиране.

// ВЕРСИЯТА се пренаписва при деплой (autodeploy.sh sed-ва реда) — иначе
// `activate` филтрираше по неизменен литерал и НЕ триеше нищо, а статичният
// кеш растеше с всеки релийз, докато браузърът не изхвърли целия origin.
const VERSION = "mastilko-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/";

// Всички инструменти се кешират ОЩЕ ПРИ ИНСТАЛИРАНЕ, с техния JS, CSS и
// шрифтове. Досега офлайн работеха само страниците, отворени СЛЕД като
// service worker-ът поеме контрол — първата посетена и всички неотворени
// инструменти падаха на началната. Списъкът е огледало на TOOLS в
// src/app/sitemap.ts (пази го тестът pwa.test.ts).
const TOOL_PAGES = [
  "/etiketi", "/vizitki", "/cv", "/pismo", "/gramoti", "/pokani", "/tabelki",
  "/wifi", "/badzhove", "/obyava", "/vaucheri", "/kalendar", "/menu",
  "/dokumentni-snimki",
];

/** HTML → собствените му /_next/static ресурси (скриптове, стилове). */
function assetsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) out.add(m[1]);
  // Иконите и маскотът (public/) — иначе офлайн менюто е с празни места.
  for (const m of html.matchAll(/src="(\/[^"/][^"]*\.(?:webp|png|svg|jpg))"/g)) out.add(m[1]);
  return [...out];
}

/** CSS → шрифтовете в него (next/font ги слага като url(/_next/static/media/…)). */
function fontsOf(css) {
  const out = new Set();
  for (const m of css.matchAll(/url\((\/_next\/static\/media\/[^)]+)\)/g)) out.add(m[1]);
  return [...out];
}

async function precacheAll() {
  const pages = await caches.open(PAGE_CACHE);
  const statics = await caches.open(STATIC_CACHE);
  const assets = new Set();
  for (const path of [OFFLINE_URL, ...TOOL_PAGES]) {
    try {
      const res = await fetch(path, { credentials: "omit" });
      if (!res.ok) continue;
      await pages.put(path, res.clone());
      for (const a of assetsOf(await res.text())) assets.add(a);
    } catch {
      /* без мрежа по време на инсталирането — ще се кешира при посещение */
    }
  }
  for (const a of assets) {
    try {
      if (await statics.match(a)) continue;
      const res = await fetch(a);
      if (!res.ok) continue;
      await statics.put(a, res.clone());
      if (a.endsWith(".css")) {
        for (const f of fontsOf(await res.text())) {
          if (!(await statics.match(f))) await statics.add(f).catch(() => {});
        }
      }
    } catch {
      /* пропускаме — stale-while-revalidate ще го вземе по-късно */
    }
  }
}

self.addEventListener("install", (event) => {
  // waitUntil държи инсталирането, докато всичко се кешира — иначе worker-ът
  // може да бъде спрян по средата. Грешките не провалят инсталирането.
  event.waitUntil(precacheAll().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Не пипай динамичните/чувствителните маршрути.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  // Нищо с query string и нищо от /import: навигациите се кешират с ЦЕЛИЯ URL
  // като ключ, тоест еднократният токен (/import?token=…) оставаше в Cache
  // Storage. Политиката обещава, че кешът пази само публичните файлове.
  if (url.search || url.pathname.startsWith("/import")) return;

  // Навигации → network-first, офлайн резерв.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Статични ресурси → stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
  }
});
