import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-12',
  numeroImpianto: '880022',
  indirizzo: 'Via Po 3, Torino',
  fermate: '5',
  portataKg: '480',
};

/** Both supplier forms open, the panel order with speed and travel, as the browser sends them. */
const ORDERS = {
  quadroMarca: 'PELAZZA',
  quadroOrdine: 'si',
  'oq-_': '1',
  'oq-ordine': 'si',
  'oq-nFermate': '5',
  'oq-velocita': '1,0',
  'oq-corsa': '12',
  'oq-note': 'Consegna in cantiere',
  arganoMarca: 'MONTANARI',
  arganoPreventivo: 'si',
  'pa-_': '1',
  'pa-fermate': '5',
  'pa-portata': '480',
  'pa-velocita': '1,0',
  'pa-mrl': 'si',
};

const fingerprintOf = (body: string): string => {
  const value = /name="conferma" value="([0-9a-f]{32})"/.exec(body)?.[1];
  assert.ok(value, 'the page offers to save anyway');
  return value;
};

async function create(browser: Browser, form: Record<string, string>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('data the sheet and the orders share', () => {
  it('asks to confirm the values that disagree, and saves once they are confirmed', async () => {
    const { browser } = await signedIn('TECNICO');
    const before = await prisma.scheda.count();
    const form = { ...SURVEY, ...ORDERS, 'oq-nFermate': '6', 'pa-velocita': '1,6' };
    const asked = await browser.submit('/schede/nuova', '/schede', form);
    assert.equal(asked.status, 422);
    assert.equal(await prisma.scheda.count(), before, 'nothing saved yet');
    assert.match(asked.body, /2 dati non coincidono tra scheda e ordini/);
    assert.match(
      asked.body,
      /<strong>Fermate<\/strong> — Scheda: 5 · Ordine quadro: 6 · Richiesta argano: 5/,
    );
    assert.match(
      asked.body,
      /<strong>Velocità \(m\/s\)<\/strong> — Ordine quadro: 1,0 · Richiesta argano: 1,6/,
    );
    assert.match(asked.body, /name="oq-nFermate"[^>]*value="6"/, 'what was typed stays on screen');

    const _csrf = await browser.csrf('/schede/nuova');
    const saved = await browser.post('/schede', {
      ...form,
      _csrf,
      conferma: fingerprintOf(asked.body),
    });
    assert.equal(saved.status, 303);
    const id = saved.location.split('/').pop()!;
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal((row.ordineQuadro as { valori: Record<string, string> }).valori.nFermate, '6');

    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, /Questi dati sono diversi tra la scheda e gli ordini/);
    assert.match(page.body, /<strong>Fermate<\/strong>/);
  });

  it('asks again when what disagrees has changed since the confirmation', async () => {
    const { browser } = await signedIn('TECNICO');
    const first = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...ORDERS,
      'oq-nFermate': '6',
    });
    const fingerprint = fingerprintOf(first.body);
    const _csrf = await browser.csrf('/schede/nuova');
    const changed = await browser.post('/schede', {
      ...SURVEY,
      ...ORDERS,
      'oq-nFermate': '7',
      _csrf,
      conferma: fingerprint,
    });
    assert.equal(changed.status, 422);
    assert.match(changed.body, /Ordine quadro: 7/);
    assert.notEqual(fingerprintOf(changed.body), fingerprint);
  });

  it('saves at once when the sheet and the orders agree', async () => {
    const { browser } = await signedIn('TECNICO');
    // Same numbers written differently: "1,0" and "1", "12" and "12,0".
    await create(browser, { ...SURVEY, ...ORDERS, 'pa-velocita': '1', 'pa-corsa': '12,0' });
  });

  it('opens the argano request with what the panel order already says', async () => {
    const { browser } = await signedIn('TECNICO');
    // The panel order alone: the argano request has never been on screen.
    const panel = Object.fromEntries(
      Object.entries(ORDERS).filter(([key]) => !key.startsWith('pa-') && !key.startsWith('argano')),
    );
    const id = await create(browser, { ...SURVEY, ...panel, 'oq-tq2Velocita': 'si' });
    const form = await browser.get(`/schede/${id}/modifica`);
    assert.match(form.body, /name="pa-velocita"[^>]*value="1,0" data-auto="1,0"/);
    assert.match(form.body, /name="pa-corsa"[^>]*value="12" data-auto="12"/);
    assert.match(form.body, /name="pa-fermate"[^>]*value="5" data-auto="5"/);
    assert.match(form.body, /name="pa-ac2" value="si" checked data-auto="si"/);
    // The panel order was already on screen: nothing there is refilled.
    assert.doesNotMatch(form.body, /name="oq-velocita"[^>]*data-auto/);
    assert.match(form.body, /<script type="application\/json" id="collegati-dati"/);
  });

  it('puts the orders in the sheet print only when the sheet asks for it', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS, riepilogoOrdini: '1' });
    assert.equal((await prisma.scheda.findUniqueOrThrow({ where: { id } })).riepilogoOrdini, true);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /Modulo d&#39;ordine quadri · Pelazza Peppino/);
    assert.match(print.body, /Velocità m\/s: <strong>1,0<\/strong>/);
    assert.match(print.body, /Consegna in cantiere/);
    assert.match(print.body, /Richiesta preventivo argani · Montanari Group/);
    assert.match(print.body, /MRL/);
    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');

    // Unticked on the form: the print goes back to the sheet alone; the orders keep their own PDFs.
    const edit = await browser.get(`/schede/${id}/modifica`);
    assert.match(edit.body, /name="riepilogoOrdini" value="1"[^>]*checked/);
    const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
    const saved = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
      ...SURVEY,
      ...ORDERS,
      base,
    });
    assert.equal(saved.status, 303);
    const plain = await browser.get(`/schede/${id}/stampa`);
    assert.doesNotMatch(plain.body, /Consegna in cantiere|Montanari Group/);
    assert.equal((await browser.get(`/schede/${id}/ordine-quadro`)).status, 200);
  });

  it('refuses a forged print choice with the field named', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      riepilogoOrdini: 'yes',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /href="#f-riepilogoOrdini">Stampa e PDF:/);
  });
});
