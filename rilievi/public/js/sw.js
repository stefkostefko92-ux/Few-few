// Rilievi Impianti — the service worker of the installed app (src/pwa/manifest.ts, served as /sw.js).
// It keeps no page: the pages carry personal data and a survey must always be the server's latest, so every
// request goes to the network exactly as without it, and a page that cannot be loaded because the device is
// offline gets a short page that says so (no cache, no data). Its fetch handler is also what Chromium asks
// of a site before it offers to install it.
// One exception (the owner, 12 November 2026 — point C3, "salvataggio offline"): a field document sent
// while the network is down (a scheda, an intervention sheet, a buono, a verbale, a sign, a quote) is not
// lost. Its form, as sent, waits on this device (IndexedDB) until it is sent again ("Invia ora" on any page
// of the portal — public/js/bozze.js), deleted, replaced by a newer sending of the same form, the person
// signs out, or after 7 days; only for the account that wrote it (the page of the form tells which account
// has it open — kept on the device too, since the browser stops an idle worker). Nothing else is stored.
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

const SALVATA = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Salvato su questo dispositivo — Rilievi Impianti</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #000000; }
  @media (prefers-color-scheme: dark) { :root { --bg: #000000; --fg: #ffffff; } }
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: var(--bg);
    color: var(--fg); font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 28rem; border-top: 2px solid var(--fg); padding-top: 20px; }
  h1 { margin: 0 0 8px; font-size: 1.375rem; }
  p { margin: 0 0 14px; }
  a { display: inline-block; margin-top: 6px; padding: 12px 20px; border: 1px solid var(--fg);
    background: var(--fg); color: var(--bg); text-decoration: none; font-weight: 600; }
  a:focus-visible { outline: 3px solid var(--fg); outline-offset: 3px; }
</style>
</head>
<body>
<main>
<h1>Salvato su questo dispositivo</h1>
<p>Rilievi Impianti non raggiunge il server: il modulo che hai inviato <strong>non è ancora sul portale</strong>, ma è salvato su questo dispositivo così com'era.</p>
<p>Quando torna la rete apri il portale da questo dispositivo e premi «Invia ora». Il salvataggio resta fino a 7 giorni e si cancella se esci dall'account.</p>
<a href="/schede">Apri il portale</a>
</main>
</body>
</html>`;

/** The same page when the form carried signatures: they are not kept — they will be drawn again. */
const SALVATA_SENZA_FIRME = SALVATA.replace(
  '<a href="/schede">',
  '<p><strong>Le firme non sono state salvate</strong> sul dispositivo: dopo l\'invio andranno fatte di nuovo.</p>\n<a href="/schede">',
);

/**
 * A signature never waits on the device (the audit of 12 November 2026: the work order was kept WITH the strokes
 * of its signatures, readable in IndexedDB for 7 days): the fields `…firma` are emptied before the form is kept;
 * a form that removes a signature (`togli`) is not kept at all. null — not to be kept.
 */
function senzaFirme(corpo) {
  const campi = new URLSearchParams(corpo);
  if (campi.has('togli')) return null;
  let tolte = false;
  for (const nome of [...campi.keys()]) {
    if (/firma$/i.test(nome) && campi.getAll(nome).some((v) => v !== '')) {
      campi.set(nome, '');
      tolte = true;
    }
  }
  return tolte ? { corpo: campi.toString(), tolte } : { corpo, tolte };
}

/** The forms kept when the network fails: new and edited field documents (never signatures, deletions). */
const MODULI = /^\/(schede|interventi|buoni|verbali|cartelli|preventivi)(\/[a-z0-9]{20,40})?$/;
const GIORNI = 7;
const SCADENZA = GIORNI * 24 * 60 * 60 * 1000;
/** As the form of a scheda on the server (4 MB): a bigger body is not a form of ours. */
const MAX_CORPO = 4 * 1024 * 1024;
const MARCATORE = /^[0-9a-f]{16}$/;

/** Who has a form open is told by its page (public/js/bozze.js) and stays valid for a working day. */
const AUTORE_VALIDO = 24 * 60 * 60 * 1000;

const pagina = (html, status) =>
  new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function apri() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rilievi-bozze', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('bozze', { keyPath: 'chiave' });
      req.result.createObjectStore('autori', { keyPath: 'azione' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** One transaction on a store; `fn` gets the store and returns the request whose result is wanted. */
async function negozio(nome, modo, fn) {
  const db = await apri();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(nome, modo);
      const req = fn(t.objectStore(nome));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

const chiaveDi = (utente, azione) => `${utente} ${azione}`;
const metti = (bozza) => negozio('bozze', 'readwrite', (s) => s.put(bozza));
const togli = (chiave) => negozio('bozze', 'readwrite', (s) => s.delete(chiave));
const tutte = () => negozio('bozze', 'readonly', (s) => s.getAll());
const svuota = () =>
  Promise.all([
    negozio('bozze', 'readwrite', (s) => s.clear()),
    negozio('autori', 'readwrite', (s) => s.clear()),
  ]);
const segnaAutore = (azione, utente) =>
  negozio('autori', 'readwrite', (s) => s.put({ azione, utente, at: Date.now() }));
const autoreDi = async (azione) => {
  const a = await negozio('autori', 'readonly', (s) => s.get(azione));
  return a && Date.now() - a.at < AUTORE_VALIDO ? a.utente : null;
};

/** The drafts of the account, without the expired ones (deleted on the way). */
async function elenco(utente) {
  const ora = Date.now();
  const out = [];
  for (const b of (await tutte()) || []) {
    if (ora - b.at > SCADENZA) await togli(b.chiave);
    else if (b.utente === utente) out.push(b);
  }
  return out.sort((a, b) => a.at - b.at);
}

async function inviaOConserva(request, azione) {
  const utente = await autoreDi(azione).catch(() => null);
  const copia = request.clone();
  try {
    const response = await fetch(request);
    // The form reached the server (whatever it answered): an older copy of it is superseded.
    if (utente) await togli(chiaveDi(utente, azione)).catch(() => undefined);
    return response;
  } catch {
    // Without the account (the page could not tell it) nothing is kept: no one else may see it.
    if (!utente) return pagina(OFFLINE, 503);
    try {
      const intero = await copia.text();
      if (intero.length > MAX_CORPO) return pagina(OFFLINE, 503);
      const pulito = senzaFirme(intero);
      if (!pulito) return pagina(OFFLINE, 503);
      const { corpo, tolte } = pulito;
      const origine = self.location.origin;
      const da =
        request.referrer && request.referrer.startsWith(`${origine}/`)
          ? request.referrer.slice(origine.length)
          : '';
      await metti({
        chiave: chiaveDi(utente, azione),
        utente,
        azione,
        corpo,
        pagina: da,
        at: Date.now(),
      });
      return pagina(tolte ? SALVATA_SENZA_FIRME : SALVATA, 503);
    } catch {
      return pagina(OFFLINE, 503);
    }
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  if (request.method === 'GET') {
    event.respondWith(fetch(request).catch(() => pagina(OFFLINE, 503)));
    return;
  }
  if (request.method !== 'POST') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search) return;
  // Signing out empties the device first: what one account left unsent is not for the next one.
  if (url.pathname === '/esci') {
    event.respondWith(
      svuota()
        .catch(() => undefined)
        .then(() => fetch(request))
        .catch(() => pagina(OFFLINE, 503)),
    );
    return;
  }
  if (MODULI.test(url.pathname)) event.respondWith(inviaOConserva(request, url.pathname));
});

// The pages of the portal (public/js/bozze.js): who sends a form now, the account's drafts, a draft away.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  const rispondi = (valore) => port && port.postMessage(valore);
  if (typeof data.utente !== 'string' || !MARCATORE.test(data.utente))
    return rispondi({ ok: false });
  const lavoro =
    data.tipo === 'autore' && typeof data.azione === 'string' && MODULI.test(data.azione)
      ? segnaAutore(data.azione, data.utente)
      : data.tipo === 'elenco'
        ? elenco(data.utente)
        : data.tipo === 'togli' && typeof data.azione === 'string'
          ? togli(chiaveDi(data.utente, data.azione))
          : Promise.reject(new Error('tipo'));
  const promessa = lavoro.then(
    (valore) => rispondi({ ok: true, valore: data.tipo === 'elenco' ? valore : null }),
    () => rispondi({ ok: false }),
  );
  if (event.waitUntil) event.waitUntil(promessa);
});
