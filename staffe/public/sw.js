// Service worker di Staffe — deliberatamente conservativo.
//
// Cosa cache: solo l'involucro statico (bundle Next con hash, manifest,
// icone). Cosa NON cache mai: risposte di `/api/*`. Una giacenza obsoleta
// mostrata come se fosse vera è più pericolosa di uno "offline" onesto: chi
// preleva o rettifica su un numero vecchio sbaglia il magazzino fisico.
// Le pagine (`/prodotti/…`, `/scanner`, …) sono renderizzate dal server
// (Next.js RSC): qui si tenta sempre la rete per prima e, solo se assente,
// si mostra una pagina offline minima generata al volo — mai un HTML in
// cache che potrebbe contenere dati vecchi.

const CACHE_VERSIONE = 'staffe-shell-v1';
const RISORSE_STATICHE_PREFISSI = ['/_next/static/', '/icone/'];
const RISORSE_STATICHE_ESATTE = ['/manifest.webmanifest'];

const OFFLINE_HTML = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Staffe — offline</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #020617; color: #f1f5f9; margin: 0;
           display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
    div { max-width: 28rem; text-align: center; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; font-size: 0.9rem; }
    button { margin-top: 1.5rem; padding: 0.75rem 1.5rem; font-size: 1rem; border-radius: 0.375rem;
             border: none; background: #38bdf8; color: #020617; font-weight: 600; }
  </style>
</head>
<body>
  <div>
    <h1>Connessione assente</h1>
    <p>Staffe richiede la rete per leggere e scrivere le giacenze in modo affidabile: qui non si
       mostra un dato vecchio spacciandolo per corrente. Riprova quando torni in linea.</p>
    <button onclick="location.reload()">Riprova</button>
  </div>
</body>
</html>`;

function eStaticoDaCache(url) {
  const path = new URL(url).pathname;
  return (
    RISORSE_STATICHE_ESATTE.includes(path) ||
    RISORSE_STATICHE_PREFISSI.some((prefisso) => path.startsWith(prefisso))
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE_VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // scritture: sempre e solo in rete

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Mai la cache per le API: la giacenza deve sempre venire dal server.
  if (url.pathname.startsWith('/api/')) return;

  if (eStaticoDaCache(request.url)) {
    event.respondWith(
      caches.open(CACHE_VERSIONE).then(async (cache) => {
        const inCache = await cache.match(request);
        if (inCache) return inCache;
        try {
          const risposta = await fetch(request);
          if (risposta.ok) cache.put(request, risposta.clone());
          return risposta;
        } catch {
          return inCache ?? Response.error();
        }
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () => new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    );
  }
});
