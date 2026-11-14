// The menu, the search and the settings pages against a real database (the owner, 10 November 2026 — the
// study of the menu, options A+B+C, and "Riordina anche /impostazioni e fai piccole directory dentro"): each
// role sees only its groups, everything to create is under one "Nuovo", the phone bar carries the main
// destinations; /cerca finds a lift by its matricola only inside the person's companies (and as a fragment
// for the Ctrl K palette); /impostazioni is a hub of small pages, each saving back to itself.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, signedIn, startApp, stopApp } from './harness.js';

const HTML = { accept: 'text/html' };

before(startApp);
after(stopApp);

/** The ids of the menu groups on a page, in order. */
const gruppi = (body: string) =>
  [...body.matchAll(/<p class="sidenav__group" id="nav-([a-z]+)">/g)].map((m) => m[1] ?? '');
/** The links of one group. */
const vociDi = (body: string, key: string) => {
  const ul = new RegExp(`<ul aria-labelledby="nav-${key}">([\\s\\S]*?)</ul>`).exec(body)?.[1] ?? '';
  return [...ul.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '');
};

describe('the menu', () => {
  it('shows each role its own groups, with nothing to create inside them', async () => {
    const { browser: tecnico } = await signedIn('TECNICO');
    const page = (await tecnico.get('/schede', HTML)).body;
    assert.deepEqual(gruppi(page), ['impianti', 'calcoli', 'documenti']);
    for (const key of ['impianti', 'calcoli', 'documenti'])
      for (const href of vociDi(page, key)) assert.doesNotMatch(href, /nuov[oa]/, href);
    assert.match(page, /<details class="nuovo" data-nuovo>/);
    assert.ok(page.includes('href="/schede/nuova"'));
    assert.match(page, /<nav class="rapida"/);
    assert.match(page, /<a class="rapida__voce" href="\/schede" aria-current="page">/);

    const { browser: admin } = await signedIn('ADMIN');
    const adminPage = (await admin.get('/schede', HTML)).body;
    assert.deepEqual(gruppi(adminPage), ['impianti', 'calcoli', 'documenti', 'amministrazione']);
    assert.ok(vociDi(adminPage, 'amministrazione').includes('/impostazioni'));

    const { browser: master } = await signedIn('MASTER');
    const masterPage = (await master.get('/schede', HTML)).body;
    assert.deepEqual(vociDi(masterPage, 'master').slice(0, 2), ['/master', '/aziende']);

    const { browser: cliente } = await signedIn('CLIENTE');
    const clientePage = (await cliente.get('/schede', HTML)).body;
    assert.doesNotMatch(clientePage, /data-nuovo/, 'read only: nothing to create');
    assert.equal((await cliente.get('/nuovo', HTML)).status, 200);
  });

  it('lists everything to create on /nuovo, as the "Nuovo" button does', async () => {
    const { browser } = await signedIn('OPERATORE');
    const page = (await browser.get('/nuovo', HTML)).body;
    for (const href of ['/schede/nuova', '/interventi/nuovo', '/verbali/nuovo', '/cartelli/nuovo'])
      assert.ok(page.includes(`href="${href}"`), href);
  });
});

describe('the search', () => {
  it('finds a lift by its matricola only in the companies of the person', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const matricola = `MX${Date.now().toString().slice(-7)}`;
    const created = await browser.submit('/schede/nuova', '/schede', {
      azienda: azienda.id,
      data: '2026-11-10',
      indirizzo: 'Via Cercata 9, Milano',
      matricola,
    });
    assert.equal(created.status, 303);
    const id = /^\/schede\/([a-z0-9]+)$/.exec(created.location)![1]!;

    const page = await browser.get(`/cerca?q=${matricola}`, HTML);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(`href="/schede/${id}"`));
    assert.ok(page.body.includes('Via Cercata 9, Milano'));

    // The fragment for the palette: the same results, no page around them.
    const parte = await browser.get(`/cerca?q=${matricola}`, { ...HTML, 'x-partial': '1' });
    assert.ok(parte.body.includes(`href="/schede/${id}"`));
    assert.doesNotMatch(parte.body, /<html/);

    const { browser: altro } = await signedIn('TECNICO', (await makeAzienda()).id);
    const fuori = await altro.get(`/cerca?q=${matricola}`, HTML);
    assert.ok(!fuori.body.includes(`/schede/${id}`), 'another company finds nothing');

    // The pages of the portal by their name.
    const pagine = await browser.get('/cerca?q=limitatore', HTML);
    assert.ok(pagine.body.includes('href="/calcolo-limitatore"'));
  });
});

describe('the settings', () => {
  it('are a hub of small pages, each saving back to itself', async () => {
    const azienda = await makeAzienda();
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const hub = await admin.get('/impostazioni', HTML);
    assert.equal(hub.status, 200);
    for (const s of ['azienda', 'scheda', 'cartelli', 'ruoli', 'condizioni'])
      assert.ok(hub.body.includes(`href="/impostazioni/${s}?azienda=${azienda.id}"`), s);

    for (const s of ['azienda', 'scheda', 'cartelli', 'ruoli', 'condizioni']) {
      const page = await admin.get(`/impostazioni/${s}?azienda=${azienda.id}`, HTML);
      assert.equal(page.status, 200, s);
      assert.match(page.body, /aria-current="page"/, s);
    }
    assert.equal((await admin.get('/impostazioni/inesistente', HTML)).status, 404);

    const reset = await admin.submit(
      `/impostazioni/scheda?azienda=${azienda.id}`,
      '/impostazioni/sezioni',
      { azienda: azienda.id, ripristina: '1' },
    );
    assert.equal(reset.status, 303);
    assert.equal(reset.location, `/impostazioni/scheda?azienda=${azienda.id}`);

    const altra = await makeAzienda();
    const fuori = await admin.get(`/impostazioni/azienda?azienda=${altra.id}`, HTML);
    assert.equal(fuori.status, 404);
  });
});
