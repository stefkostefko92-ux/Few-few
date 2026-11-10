// Rilievi Impianti — the service worker of the installed app (src/pwa/manifest.ts, served as /sw.js).
// It keeps nothing: the pages carry personal data and a survey must always be the server's latest, so
// every request goes to the network exactly as without it. Only a page that cannot be loaded because the
// device is offline gets a short page that says so, written here (no cache, no data). Its fetch handler
// is also what Chromium asks of a site before it offers to install it.
'use strict';

const OFFLINE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Nessuna connessione — Rilievi Impianti</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #000000; --line: #d0d0d0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #000000; --fg: #ffffff; --line: #3a3a3a; } }
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: var(--bg);
    color: var(--fg); font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 26rem; border-top: 2px solid var(--fg); padding-top: 20px; }
  h1 { margin: 0 0 8px; font-size: 1.375rem; }
  p { margin: 0 0 20px; }
  a { display: inline-block; padding: 12px 20px; border: 1px solid var(--fg); background: var(--fg);
    color: var(--bg); text-decoration: none; font-weight: 600; }
  a:focus-visible { outline: 3px solid var(--fg); outline-offset: 3px; }
</style>
</head>
<body>
<main>
<h1>Nessuna connessione</h1>
<p>Rilievi Impianti non raggiunge il server. Controlla la rete del telefono o del computer e riprova: quello che hai già salvato è al sicuro sul portale.</p>
<a href="">Riprova</a>
</main>
</body>
</html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only opening a page: a form that is sent (POST) and everything a page loads go as they are.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(OFFLINE, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        }),
    ),
  );
});
