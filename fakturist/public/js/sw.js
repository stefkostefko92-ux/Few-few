// Fakturist — the service worker of the installed app (src/pwa/manifest.ts, served as /sw.js).
// It keeps nothing: the pages carry invoices and personal data and must always be the server's latest,
// so every request goes to the network exactly as without it. Only a page that cannot be loaded because
// the device is offline gets a short page that says so, written here (no cache, no data). Its fetch
// handler is also what Chromium asks of a site before it offers to install it.
'use strict';

const TEXT = {
  bg: {
    lang: 'bg',
    title: 'Няма връзка — Фактурист',
    heading: 'Няма връзка',
    body: 'Фактурист не достига сървъра. Проверете мрежата на телефона или компютъра и опитайте отново: издадените документи са запазени на сървъра.',
    retry: 'Опитай отново',
  },
  en: {
    lang: 'en',
    title: 'No connection — Fakturist',
    heading: 'No connection',
    body: 'Fakturist cannot reach the server. Check the network of your phone or computer and try again: issued documents are safe on the server.',
    retry: 'Try again',
  },
};

function offlinePage() {
  const language = (self.navigator && self.navigator.language) || 'bg';
  const t = language.toLowerCase().startsWith('bg') ? TEXT.bg : TEXT.en;
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${t.title}</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #0c1929; --mute: #4a5568; --accent: #03756c; --on: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c1929; --fg: #e8eef5; --mute: #a9b4c2; --accent: #2cc5b5; --on: #0c1929; } }
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: var(--bg);
    color: var(--fg); font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 26rem; border-top: 3px solid var(--accent); padding-top: 20px; }
  h1 { margin: 0 0 8px; font-size: 1.375rem; }
  p { margin: 0 0 20px; color: var(--mute); }
  a { display: inline-block; padding: 12px 20px; border-radius: 8px; background: var(--accent);
    color: var(--on); text-decoration: none; font-weight: 600; }
  a:focus-visible { outline: 3px solid var(--fg); outline-offset: 3px; }
</style>
</head>
<body>
<main>
<h1>${t.heading}</h1>
<p>${t.body}</p>
<a href="">${t.retry}</a>
</main>
</body>
</html>`;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only opening a page: a form that is sent (POST) and everything a page loads go as they are.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(offlinePage(), {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        }),
    ),
  );
});
