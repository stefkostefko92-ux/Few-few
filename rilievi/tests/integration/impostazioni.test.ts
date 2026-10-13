import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ORDINABILI } from '../../src/schede/ordine.js';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-12',
  matricola: '0071234',
  numeroImpianto: '880033',
  indirizzo: 'Corso Francia 9, Torino',
  buonoLavoro: 'BL 2026/77',
  fermate: '4',
};

/** Where each section starts in a page: its id (`s-<key>`) or its printed title. */
const positions = (body: string, needles: readonly string[]): number[] =>
  needles.map((needle) => {
    const at = body.indexOf(needle);
    assert.ok(at >= 0, `${needle} is on the page`);
    return at;
  });

const ascending = (list: readonly number[]): boolean =>
  list.every((n, i) => i === 0 || n > list[i - 1]!);

async function create(browser: Browser): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', SURVEY);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('the order of the sheet sections in the company settings', () => {
  it('is open to the company ADMIN only, never to the roles below', async () => {
    const azienda = await makeAzienda();
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const page = await admin.get('/impostazioni');
    assert.equal(page.status, 200);
    assert.match(page.body, /Ordine delle sezioni della scheda/);
    assert.match(page.body, /href="\/impostazioni"[^>]*aria-current="page"/);
    for (const role of ['DIREZIONE', 'TECNICO', 'CLIENTE'] as const) {
      const { browser } = await signedIn(role, azienda.id);
      assert.equal((await browser.get('/impostazioni')).status, 403, role);
      assert.doesNotMatch((await browser.get('/schede')).body, /href="\/impostazioni"/, role);
    }
  });

  it('moves a section without saving, saves it once, writes it in the log and resets it', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('ADMIN', azienda.id);
    const form = { azienda: azienda.id, ordine: [...ORDINABILI] };
    const moved = await browser.submit('/impostazioni', '/impostazioni/sezioni', {
      ...form,
      sposta: 'note:su',
    });
    assert.equal(moved.status, 200);
    assert.match(moved.body, /Modifiche non salvate/);
    const order = [...moved.body.matchAll(/name="ordine" value="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order.slice(-2), ['note', 'allarme']);
    assert.match(
      moved.body,
      /value="note:su"[^>]*autofocus/,
      'the focus stays on the moved section',
    );
    const before = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(before.ordineSezioni, [], 'a move alone saves nothing');

    const custom = ['note', 'argano', ...ORDINABILI.filter((k) => k !== 'note' && k !== 'argano')];
    const saved = await browser.submit('/impostazioni', '/impostazioni/sezioni', {
      azienda: azienda.id,
      ordine: custom,
      salva: '1',
    });
    assert.equal(saved.status, 303);
    assert.equal(saved.location, `/impostazioni?azienda=${azienda.id}`);
    const row = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(row.ordineSezioni, custom);
    const log = await prisma.auditLog.findMany({
      where: { aziendaId: azienda.id, action: 'AZIENDA_SEZIONI' },
    });
    assert.equal(log.length, 1);

    const reset = await browser.submit('/impostazioni', '/impostazioni/sezioni', {
      azienda: azienda.id,
      ripristina: '1',
    });
    assert.equal(reset.status, 303);
    const back = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(back.ordineSezioni, []);
  });

  it('refuses a forged order and a company outside the ADMIN reach', async () => {
    const azienda = await makeAzienda();
    const other = await makeAzienda();
    const { browser } = await signedIn('ADMIN', azienda.id);
    const forged = await browser.submit('/impostazioni', '/impostazioni/sezioni', {
      azienda: azienda.id,
      ordine: ['note', 'note', ...ORDINABILI.slice(2)],
      salva: '1',
    });
    assert.equal(forged.status, 400);
    assert.match(forged.body, /ordine inviato non è valido/);
    assert.equal((await browser.get(`/impostazioni?azienda=${other.id}`)).status, 404);
    const foreign = await browser.submit('/impostazioni', '/impostazioni/sezioni', {
      azienda: other.id,
      ordine: [...ORDINABILI].reverse(),
      salva: '1',
    });
    assert.equal(foreign.status, 404);
    const row = await prisma.azienda.findUniqueOrThrow({ where: { id: other.id } });
    assert.deepEqual(row.ordineSezioni, []);
  });

  it('lets the MASTER pick the company first', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('MASTER');
    const page = await browser.get(`/impostazioni?azienda=${azienda.id}`);
    assert.equal(page.status, 200);
    assert.match(page.body, /<select class="select" id="azienda-scelta" name="azienda">/);
    assert.match(page.body, new RegExp(`<option value="${azienda.id}" selected>`));
  });

  it('puts the sections of the form, the page and the print in the company order', async () => {
    const azienda = await makeAzienda();
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { ordineSezioni: ['note', 'allarme'] },
    });
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await create(browser);
    const ids = [
      'id="s-impianto"',
      'id="s-targa"',
      'id="s-note"',
      'id="s-allarme"',
      'id="s-ubicazione"',
    ];
    assert.ok(ascending(positions((await browser.get('/schede/nuova')).body, ids)), 'new form');
    assert.ok(
      ascending(positions((await browser.get(`/schede/${id}/modifica`)).body, ids)),
      'edit',
    );
    assert.ok(ascending(positions((await browser.get(`/schede/${id}`)).body, ids)), 'page');
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.ok(
      ascending(
        positions(print.body, [
          '<h2>Note e lavori</h2>',
          '<h2>Allarme e telesoccorso</h2>',
          '<h2>Ubicazione e accesso</h2>',
        ]),
      ),
      'print',
    );
  });
});

describe('the head of the printed sheet', () => {
  it('centres the title, puts the address and the work order under it, and drops the repeated sections', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /<h1 class="paper__title">Scheda rilievo impianto<\/h1>/);
    assert.match(print.body, /<p class="paper__address">Corso Francia 9, Torino<\/p>/);
    assert.match(
      print.body,
      /<p class="paper__buono"><span>Buono di riferimento<\/span><strong>BL 2026\/77<\/strong><\/p>/,
    );
    // The identification and the plate data are in the head and on the plate only.
    assert.doesNotMatch(print.body, /<h2>Impianto<\/h2>|<h2>Dati di targa<\/h2>/);
    assert.doesNotMatch(print.body, /class="plate__address"/, 'the address is in the head');
    const [matricola, numero] = positions(print.body, ['>Matricola<', '>N° impianto<']);
    assert.ok(matricola! < numero!, 'matricola on the left, the lift number on the right');
    // The screen keeps its sections and the address on the plate.
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, /id="s-impianto"/);
    assert.match(page.body, /class="plate__address">Corso Francia 9, Torino</);
  });
});
