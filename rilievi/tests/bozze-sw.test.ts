// The unsent forms of the service worker (the owner, 12 November 2026 — point C3): a field document sent
// while the network is down waits on the device, only for the account that had its form open, until it is
// sent again, superseded by a newer sending, signed out, or 7 days old. Everything else goes as before: no
// page is kept, a deletion or a signature is never kept, an account the page did not tell keeps nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'sw.js'), 'utf8');
const ORIGIN = 'https://rilievi.example';
const UTENTE = '0123456789abcdef';
const ALTRO = 'fedcba9876543210';
const SCHEDA = '/schede/cm0000000000000000000001';

/** An IndexedDB with what the worker uses: open with upgrade, transactions, put/get/getAll/delete/clear. */
function fakeIndexedDB() {
  const stores = new Map<string, Map<string, Record<string, unknown>>>();
  let created = false;
  const later = (fn: () => void) => setTimeout(fn, 0);
  const db = {
    createObjectStore(name: string, opts: { keyPath: string }) {
      stores.set(name, new Map());
      (stores.get(name) as unknown as { keyPath: string }).keyPath = opts.keyPath;
    },
    transaction(name: string) {
      const store = stores.get(name)!;
      const keyPath = (store as unknown as { keyPath: string }).keyPath;
      const t: Record<string, unknown> = {};
      const req = (result: unknown) => ({ result });
      t.objectStore = () => ({
        put: (v: Record<string, unknown>) => {
          store.set(String(v[keyPath]), structuredClone(v));
          return req(v[keyPath]);
        },
        get: (k: string) => req(store.get(k)),
        getAll: () => req([...store.values()].map((v) => structuredClone(v))),
        delete: (k: string) => req(void store.delete(k)),
        clear: () => req(void store.clear()),
      });
      later(() => (t.oncomplete as () => void)?.());
      return t;
    },
    close() {},
  };
  return {
    stores,
    open() {
      const request: Record<string, unknown> = { result: db };
      later(() => {
        if (!created) {
          created = true;
          (request.onupgradeneeded as () => void)?.();
        }
        (request.onsuccess as () => void)?.();
      });
      return request;
    },
  };
}

type Handler = (event: unknown) => void;

function load(fetch: (r: Request) => Promise<Response>) {
  const listeners: Record<string, Handler> = {};
  const idb = fakeIndexedDB();
  const self = {
    addEventListener: (type: string, handler: Handler) => (listeners[type] = handler),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: ORIGIN },
  };
  vm.runInNewContext(source, { self, fetch, Response, URL, indexedDB: idb, Date, setTimeout });
  return { listeners, idb };
}

/** A message from a page, answered on its port. */
function tell(listeners: Record<string, Handler>, data: Record<string, unknown>) {
  return new Promise<{ ok: boolean; valore?: unknown }>((resolve) => {
    // The answer comes from the worker's realm: a plain copy for the comparisons.
    const postMessage = (v: unknown) => resolve(JSON.parse(JSON.stringify(v)));
    listeners.message!({ data, ports: [{ postMessage }], waitUntil: () => undefined });
  });
}

function post(path: string, body = 'campo=1&_csrf=t') {
  const request = new Request(ORIGIN + path, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    referrer: `${ORIGIN}${path}/modifica`,
  });
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  const event = {
    request,
    answer: null as Promise<Response> | null,
    respondWith: (p: Promise<Response>) => (event.answer = p),
  };
  return event;
}

const offline = () => Promise.reject(new TypeError('Failed to fetch'));

describe('unsent forms on the device', () => {
  it('keeps a field form sent without network, for the account that had it open', async () => {
    const { listeners } = load(offline);
    assert.deepEqual(await tell(listeners, { tipo: 'autore', azione: SCHEDA, utente: UTENTE }), {
      ok: true,
      valore: null,
    });
    const event = post(SCHEDA, 'matricola=MI+1&_csrf=vecchio');
    listeners.fetch!(event);
    const answer = await event.answer!;
    assert.equal(answer.status, 503);
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    const html = await answer.text();
    assert.match(html, /<h1>Salvato su questo dispositivo<\/h1>/);
    assert.doesNotMatch(html, /<script/);
    const mie = await tell(listeners, { tipo: 'elenco', utente: UTENTE });
    const [bozza] = mie.valore as Array<Record<string, unknown>>;
    assert.equal(bozza!.azione, SCHEDA);
    assert.equal(bozza!.corpo, 'matricola=MI+1&_csrf=vecchio');
    assert.equal(bozza!.pagina, `${SCHEDA}/modifica`);
    // Another account on the same device does not see it.
    assert.deepEqual((await tell(listeners, { tipo: 'elenco', utente: ALTRO })).valore, []);
  });

  it('keeps nothing for an account the page did not tell, nor for other forms', async () => {
    const { listeners, idb } = load(offline);
    const event = post('/schede');
    listeners.fetch!(event);
    assert.match(await (await event.answer!).text(), /Nessuna connessione/);
    await tell(listeners, {
      tipo: 'autore',
      azione: '/interventi/cm0000000000000000000002',
      utente: UTENTE,
    });
    for (const path of [
      `${SCHEDA}/elimina`,
      '/interventi/cm0000000000000000000002/firma',
      '/accesso',
      '/impostazioni/ruoli',
    ]) {
      const e = post(path);
      listeners.fetch!(e);
      assert.equal(e.answer, null, path);
    }
    assert.equal(idb.stores.get('bozze')!.size, 0);
    // A forged message is not taken.
    assert.deepEqual(
      await tell(listeners, { tipo: 'autore', azione: '/accesso', utente: UTENTE }),
      { ok: false },
    );
    assert.deepEqual(await tell(listeners, { tipo: 'elenco', utente: 'x' }), { ok: false });
  });

  it('forgets the copy when the same form reaches the server, and everything on sign-out', async () => {
    let online = false;
    const { listeners, idb } = load((r) =>
      online ? Promise.resolve(new Response(`ok ${new URL(r.url).pathname}`)) : offline(),
    );
    await tell(listeners, { tipo: 'autore', azione: SCHEDA, utente: UTENTE });
    await tell(listeners, { tipo: 'autore', azione: '/buoni', utente: UTENTE });
    for (const path of [SCHEDA, '/buoni']) {
      const e = post(path);
      listeners.fetch!(e);
      await e.answer;
    }
    assert.equal(idb.stores.get('bozze')!.size, 2);
    online = true;
    const again = post(SCHEDA);
    listeners.fetch!(again);
    assert.equal(await (await again.answer!).text(), `ok ${SCHEDA}`);
    assert.deepEqual(
      (
        (await tell(listeners, { tipo: 'elenco', utente: UTENTE })).valore as Array<{
          azione: string;
        }>
      ).map((b) => b.azione),
      ['/buoni'],
    );
    const esci = post('/esci');
    listeners.fetch!(esci);
    await esci.answer;
    assert.equal(idb.stores.get('bozze')!.size, 0);
    assert.equal(idb.stores.get('autori')!.size, 0);
  });

  it('drops a copy after 7 days and on request', async () => {
    const { listeners, idb } = load(offline);
    await tell(listeners, { tipo: 'autore', azione: '/cartelli', utente: UTENTE });
    const e = post('/cartelli');
    listeners.fetch!(e);
    await e.answer;
    await tell(listeners, { tipo: 'togli', azione: '/cartelli', utente: UTENTE });
    assert.equal(idb.stores.get('bozze')!.size, 0);
    idb.stores.get('bozze')!.set(`${UTENTE} /verbali`, {
      chiave: `${UTENTE} /verbali`,
      utente: UTENTE,
      azione: '/verbali',
      corpo: 'a=1',
      pagina: '',
      at: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    assert.deepEqual((await tell(listeners, { tipo: 'elenco', utente: UTENTE })).valore, []);
    assert.equal(idb.stores.get('bozze')!.size, 0);
  });
});
