// Vizitka — service worker-ът на инсталираното приложение (src/pwa.js; сервира се като /sw.js,
// за да обхваща целия сайт).
//
// Пази нещо САМО в инсталираното приложение (страницата, отворена като приложение, казва това
// на работника — съобщение 'installed', бележка в CacheStorage). В обикновен раздел на браузъра
// не пази нищо: само показва „Няма връзка“ без мрежа (ePrivacy чл. 5(3) — посетител, сканирал QR
// код, не е поискал офлайн копие). На публичните визитки за посетители работникът дори не се
// регистрира (public/app.js).
// Какво пази в приложението — и нищо друго:
//  • статиката (стилове, скрипт, лого, икони) — за да изглежда приложението като себе си и без мрежа;
//  • ПУБЛИЧНИТЕ визитки /p/<адрес>, които са отваряни от това устройство, и снимките им — за да
//    се отворят и без мрежа (мазе, самолет, панаир със задръстена мрежа). До 30 визитки.
// Таблото, настройките, входът и всичко с лични данни НИКОГА не се кешират: те винаги идват от
// сървъра, а без мрежа излиза кратка страница „Няма връзка“.
// Визитка, която вече не съществува (404/410), се маха от устройството при следващото отваряне.
// Изходът от акаунта и изтриването му изпразват запазеното ПРЕДИ заявката към сървъра.
// Fetch обработчикът е и това, което Chromium иска от сайта, преди да предложи инсталиране.
'use strict';

const STATIC = 'vz-static-v1';
const APP = 'vz-app-v1'; // само бележката „работи като инсталирано приложение“
const INSTALLED = '/__vz-installed';
const CARDS = 'vz-cards-v1';
const MAX_CARDS = 30;
const MAX_PHOTOS = 60;

const CARD_PATH = /^\/p\/[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const PHOTO_PATH = /^\/photo\/[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/; // като /photo/:file в public.js
const STATIC_PATH = /^\/(?:styles\.css|app\.js|logo\.png|favicon\.svg|icons\/[a-z0-9-]+\.png)$/;
const CLEAR_ON = /^\/(?:logout|settings\/delete)$/;

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

function offlinePage(saved) {
  const list = saved.length
    ? `<h2>Запазени на това устройство</h2><ul>${saved
        .map((p) => `<li><a href="${esc(p)}">${esc(p.slice(3))}</a></li>`)
        .join('')}</ul>`
    : '';
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#2563eb">
<title>Няма връзка · Vizitka</title>
<style>
  :root { color-scheme: light dark; --bg: #f8fafc; --fg: #111827; --muted: #4b5563; --brand: #2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b1220; --fg: #f1f5f9; --muted: #94a3b8; --brand: #60a5fa; } }
  html, body { margin: 0; min-height: 100%; }
  body { display: grid; place-items: center; min-height: 100vh; padding: 24px; box-sizing: border-box;
    background: var(--bg); color: var(--fg); font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 28rem; border-top: 3px solid var(--brand); padding-top: 20px; }
  h1 { margin: 0 0 8px; font-size: 1.4rem; }
  h2 { margin: 24px 0 8px; font-size: 1rem; }
  p { margin: 0 0 16px; color: var(--muted); }
  ul { margin: 0; padding-left: 1.2rem; }
  li { margin: 4px 0; }
  a { color: var(--brand); }
  .btn { display: inline-block; padding: 12px 20px; border-radius: 10px; background: var(--brand);
    color: #fff; text-decoration: none; font-weight: 600; }
  a:focus-visible { outline: 3px solid var(--brand); outline-offset: 3px; }
</style>
</head>
<body>
<main>
<h1>Няма връзка</h1>
<p>Vizitka не достига до сървъра. Провери мрежата на телефона или компютъра и опитай пак — нищо от визитката ти не е загубено.</p>
<a class="btn" href="">Опитай пак</a>
${list}
</main>
</body>
</html>`;
}

const html = (body, status) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

async function savedCards() {
  try {
    if (!(await caches.has(CARDS))) return []; // да не се създава празен кеш в обикновен раздел
    const cache = await caches.open(CARDS);
    return (await cache.keys())
      .map((r) => new URL(r.url).pathname)
      .filter((p) => CARD_PATH.test(p));
  } catch {
    return [];
  }
}

const offline = async () => html(offlinePage(await savedCards()), 503);

// Най-старите записи от вида излизат първи (cache.keys() връща реда на добавяне).
async function trim(cache, test, max) {
  const keys = (await cache.keys()).filter((r) => test.test(new URL(r.url).pathname));
  for (const r of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(r);
}

async function card(request) {
  const cache = await caches.open(CARDS);
  try {
    const res = await fetch(request);
    if (res.status === 200 && !res.redirected) {
      await cache.delete(request); // наново в края — най-скоро отворената се пази най-дълго
      await cache.put(request, res.clone());
      await trim(cache, CARD_PATH, MAX_CARDS);
    } else if (res.status === 404 || res.status === 410) {
      await cache.delete(request);
    }
    return res;
  } catch {
    return (await cache.match(request)) || offline();
  }
}

async function cacheFirst(request, name, test, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    // Една версия на файл: стара `?v=` се маха, когато дойде нова.
    const path = new URL(request.url).pathname;
    for (const r of await cache.keys())
      if (new URL(r.url).pathname === path && r.url !== request.url) await cache.delete(r);
    await cache.put(request, res.clone());
    if (max) await trim(cache, test, max);
  }
  return res;
}

const clearSaved = () => caches.delete(CARDS).catch(() => false);
const isInstalled = () =>
  caches
    .match(INSTALLED, { cacheName: APP })
    .then(Boolean)
    .catch(() => false);
const markInstalled = () => caches.open(APP).then((c) => c.put(INSTALLED, new Response('1')));

// Работи само в приложението; иначе заявката минава към мрежата, както без работник.
const whenInstalled = (request, handler) =>
  isInstalled().then((yes) => (yes ? handler(request) : fetch(request)));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const keep = new Set([APP, STATIC, CARDS]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  )
);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && request.mode === 'navigate' && CLEAR_ON.test(url.pathname)) {
    event.respondWith(clearSaved().then(() => fetch(request)));
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    if (CARD_PATH.test(url.pathname) && !url.search)
      event.respondWith(
        isInstalled().then((yes) => (yes ? card(request) : fetch(request).catch(offline)))
      );
    else event.respondWith(fetch(request).catch(offline));
    return;
  }
  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(whenInstalled(request, (r) => cacheFirst(r, STATIC, STATIC_PATH, 0)));
    return;
  }
  if (PHOTO_PATH.test(url.pathname)) {
    event.respondWith(whenInstalled(request, (r) => cacheFirst(r, CARDS, PHOTO_PATH, MAX_PHOTOS)));
  }
});

// Страницата казва „работя като инсталирано приложение“ или „изчисти“ — без друго съдържание.
self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'installed') event.waitUntil(markInstalled());
  else if (type === 'clear') event.waitUntil(clearSaved());
});
