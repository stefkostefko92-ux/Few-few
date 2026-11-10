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
    assert.deepEqual(order.slice(-2), ['note', 'bottoniere']);
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
    const ids = ['id="s-impianto"', 'id="s-note"', 'id="s-allarme"', 'id="s-ubicazione"'];
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

describe('the sheet form, laid out like the printed sheet', () => {
  it('opens with section 1 as the head and the plate, and numbers only the sections on screen', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    assert.match(form.body, /<div class="grid grid--testa">/);
    const head = [
      'data',
      'indirizzo',
      'buonoLavoro',
      'matricola',
      'numeroImpianto',
      'portataKg',
      'capienzaPersone',
      'fermate',
      'marca',
    ].map((key) => `id="f-${key}"`);
    assert.ok(ascending(positions(form.body, head)), 'date, address, work order, then the plate');
    const end = form.body.indexOf('id="s-ubicazione"');
    assert.ok(
      positions(form.body, head).every((at) => at < end),
      'all in section 1',
    );
    // The number is the CSS counter of the sections on screen: a hidden one (the power unit before a
    // hydraulic lift is ticked) takes no number, and the sections after it close up.
    const legends = [
      ...form.body.matchAll(/<legend class="section__title"><span class="secnum"[^>]*><\/span>/g),
    ];
    assert.equal(legends.length, 13);
    assert.match(form.body, /<fieldset class="section"[^>]*id="s-centralina"[^>]*data-off/);
    assert.match(form.body, /<fieldset class="section"[^>]*id="s-argano"(?![^>]*data-off)[^>]*>/);
    const css = await browser.get('/static/css/sheet.css');
    assert.match(css.body, /counter-increment: sezione;/);
    assert.match(css.body, /\.secnum:empty::before \{\s*content: counter\(sezione\);/);
    assert.doesNotMatch(form.body, /id="s-targa"/);
  });

  it('puts each supplier form after its question and what follows from it, before the notes', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    for (const [question, last, modulo, note] of [
      ['quadroOrdine', 'quadroOrdine', 'mq', 'quadroNote'],
      ['arganoPreventivo', 'kitControlloGanasceTipo', 'pa', 'arganoNote'],
      ['sospensioni', 'sospensioniNumero', 'sg', 'serratureNote'],
      ['operatore', 'operatore', 'so', 'serratureNote'],
    ] as const) {
      const ids = [...new Set([question, last, modulo, note])].map((key) => `id="f-${key}"`);
      assert.ok(ascending(positions(form.body, ids)), question);
    }
  });

  it('asks one kind of lift and one kind of doors; an old sheet with two shows the first', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    for (const name of ['tipoImpianto', 'tipoPorte']) {
      assert.match(form.body, new RegExp(`<input type="radio" name="${name}" value="[A-Z]+"`));
      assert.doesNotMatch(form.body, new RegExp(`type="checkbox" name="${name}"`), name);
    }
    const id = await create(browser);
    // Saved before October 17, when both could be ticked.
    await prisma.scheda.update({ where: { id }, data: { tipoPorte: ['AUTOMATICHE', 'MANUALI'] } });
    const edit = await browser.get(`/schede/${id}/modifica`);
    assert.match(edit.body, /name="tipoPorte" value="AUTOMATICHE" data-clearable checked/);
    assert.doesNotMatch(edit.body, /name="tipoPorte" value="MANUALI" data-clearable checked/);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /opt--on[^>]*><span class="opt__box"[^>]*><\/span>Manuali/);
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
      /<p class="paper__buono"><span>Buono di lavoro<\/span><strong>BL 2026\/77<\/strong><\/p>/,
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
