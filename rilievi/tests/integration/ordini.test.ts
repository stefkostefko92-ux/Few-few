import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-12',
  numeroImpianto: '880011',
  indirizzo: 'Via Roma 1, Torino',
  fermate: '5',
  portataKg: '480',
  tipoPorte: ['AUTOMATICHE'],
};

/** A Pelazza order and a Montanari request, as the browser sends them. */
const ORDERS = {
  quadroMarca: 'PELAZZA',
  quadroOrdine: 'si',
  'oq-_': '1',
  'oq-ordine': 'si',
  'oq-cliente': 'Ascensori Prova',
  'oq-nFermate': '5',
  'oq-quadroMicroprocessore': 'si',
  'oq-note': 'Consegna in cantiere',
  arganoMarca: 'MONTANARI',
  arganoPreventivo: 'si',
  'pa-_': '1',
  'pa-ragioneSociale': 'Ascensori Prova',
  'pa-portata': '480',
  'pa-mrl': 'si',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('supplier forms', () => {
  it('are saved with the sheet and come out as their own PDFs, to download or to print', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(row.ordineQuadro, {
      modulo: 'pelazza-ordine-quadri-032026',
      valori: {
        ordine: true,
        cliente: 'Ascensori Prova',
        nFermate: '5',
        quadroMicroprocessore: true,
        note: 'Consegna in cantiere',
      },
    });
    assert.deepEqual(row.preventivoArgano, {
      modulo: 'montanari-richiesta-preventivo-argani-ita',
      valori: { ragioneSociale: 'Ascensori Prova', portata: '480', mrl: true },
    });
    const order = await browser.get(`/schede/${id}/ordine-quadro`);
    assert.equal(order.status, 200);
    assert.equal(order.headers.get('content-type'), 'application/pdf');
    assert.equal(
      order.headers.get('content-disposition'),
      'attachment; filename="ordine-quadro-880011-2026-10-12.pdf"',
    );
    assert.equal(order.bytes.subarray(0, 5).toString(), '%PDF-');
    const print = await browser.get(`/schede/${id}/preventivo-argano?inline=1`);
    assert.equal(print.status, 200);
    assert.match(print.headers.get('content-disposition') ?? '', /^inline;/);
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`href="/schede/${id}/ordine-quadro"`));
    assert.match(page.body, new RegExp(`href="/schede/${id}/preventivo-argano\\?inline=1"`));
  });

  it('stay out of the sheet print unless the sheet asks for them (collegati.test.ts)', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS });
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /Pelazza/, 'the make of the panel is part of the survey');
    assert.doesNotMatch(print.body, /Quadro a Microprocessore|Consegna in cantiere|MRL/);
  });

  it('are dropped when the question or the make changes, and their PDF is gone', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS });
    const page = await browser.get(`/schede/${id}/modifica`);
    const base = /name="base" value="([^"]+)"/.exec(page.body)![1]!;
    const saved = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
      ...SURVEY,
      ...ORDERS,
      // A make without an order form: the question is not asked any more.
      quadroMarca: 'DMG',
      arganoPreventivo: 'no',
      base,
    });
    assert.equal(saved.status, 303);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.quadroMarca, 'DMG');
    assert.equal(row.quadroOrdine, null);
    assert.equal(row.ordineQuadro, null);
    assert.equal(row.arganoPreventivo, false);
    assert.equal(row.preventivoArgano, null);
    assert.equal((await browser.get(`/schede/${id}/ordine-quadro`)).status, 404);
    assert.equal((await browser.get(`/schede/${id}/preventivo-argano`)).status, 404);
  });

  it('open prefilled from the sheet, the company and the person writing', async () => {
    const { browser } = await signedIn('TECNICO', undefined);
    const id = await create(browser, SURVEY);
    const form = await browser.get(`/schede/${id}/modifica`);
    assert.match(form.body, /name="oq-data"[^>]*value="12\/10\/2026"/);
    assert.match(form.body, /name="oq-cliente"[^>]*value="Ascensori Prova"/);
    assert.match(form.body, /name="oq-rifImpianto"[^>]*value="N° 880011 — Via Roma 1, Torino"/);
    assert.match(form.body, /name="oq-nFermate"[^>]*value="5"/);
    assert.match(form.body, /name="oq-porteAutomatiche" value="si" checked/);
    assert.match(form.body, /name="pa-portata"[^>]*value="480"/);
    assert.match(form.body, /name="pa-ruolo"[^>]*value="Tecnico"/);
  });

  it('stay inside the company: another company gets 404 for both PDFs', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS });
    const other = await makeAzienda('Altra Azienda Ordini');
    const { browser: stranger } = await signedIn('ADMIN', other.id);
    assert.equal((await stranger.get(`/schede/${id}/ordine-quadro`)).status, 404);
    assert.equal((await stranger.get(`/schede/${id}/preventivo-argano`)).status, 404);
    assert.equal((await new Browser().get(`/schede/${id}/ordine-quadro`)).status, 302);
  });

  it('report a wrong field of a form with its label and supplier, keeping what was typed', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...ORDERS,
      'oq-quantita': '12345678',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /href="#f-oq-quantita">Quantità: \(Pelazza Peppino\)/);
    assert.match(reply.body, /name="oq-quantita"[^>]*value="12345678"/);
    assert.match(reply.body, /name="oq-cliente"[^>]*value="Ascensori Prova"/);
  });
});
