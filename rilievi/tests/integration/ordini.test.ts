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

/** A Pelazza order, the argano data sheet and the 2SG sheet, as the browser sends them. */
const ORDERS = {
  quadroMarca: 'PELAZZA',
  quadroOrdine: 'si',
  'oq-_': '1',
  'oq-ordine': 'si',
  'oq-cliente': 'Ascensori Prova',
  'oq-nFermate': '5',
  'oq-quadroMicroprocessore': 'si',
  'oq-note': 'Consegna in cantiere',
  arganoPreventivo: 'si',
  'pa-_': '1',
  'pa-pesoCabina': '650',
  'pa-portata': '480',
  'pa-motoreInverter': 'si',
  sospensioni: 'si',
  sospensioniNumero: '5',
  'sg-_': '1',
  'sg-ordNo': '77',
  'sg-automatico': 'si',
};

/** The PDFs of the forms: the Pelazza order, the argano sheet, the 2SG sheet. */
const PDFS = ['ordine-quadro', 'dati-argano', 'sospensioni-2sg'];

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
      modulo: 'rilievo-dati-argani',
      valori: { pesoCabina: '650', portata: '480', motoreInverter: true },
    });
    assert.equal(row.sospensioniNumero, 5);
    assert.deepEqual(row.ordineSospensioni, {
      modulo: '2sg-ordine-porte',
      valori: { ordNo: '77', automatico: true },
    });
    const order = await browser.get(`/schede/${id}/ordine-quadro`);
    assert.equal(order.status, 200);
    assert.equal(order.headers.get('content-type'), 'application/pdf');
    assert.equal(
      order.headers.get('content-disposition'),
      'attachment; filename="ordine-quadro-880011-2026-10-12.pdf"',
    );
    assert.equal(order.bytes.subarray(0, 5).toString(), '%PDF-');
    const print = await browser.get(`/schede/${id}/dati-argano?inline=1`);
    assert.equal(print.status, 200);
    assert.match(print.headers.get('content-disposition') ?? '', /^inline;/);
    const sg = await browser.get(`/schede/${id}/sospensioni-2sg`);
    assert.equal(sg.status, 200);
    assert.equal(
      sg.headers.get('content-disposition'),
      'attachment; filename="sospensioni-2sg-880011-2026-10-12.pdf"',
    );
    const page = await browser.get(`/schede/${id}`);
    for (const path of PDFS) assert.match(page.body, new RegExp(`href="/schede/${id}/${path}"`));
    assert.match(page.body, new RegExp(`href="/schede/${id}/dati-argano\\?inline=1"`));
    assert.match(page.body, /Modulo rilievi dati argani</, 'the argano sheet has no supplier');
    assert.match(page.body, /Modulo ordine operatori e sospensioni · 2SG S\.r\.l\./);
  });

  it('stay out of the sheet print unless the sheet asks for them (collegati.test.ts)', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS });
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /Pelazza/, 'the make of the panel is part of the survey');
    assert.doesNotMatch(
      print.body,
      /Quadro a Microprocessore|Consegna in cantiere|Peso cabina|ORD No/,
    );
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
      sospensioni: 'no',
      base,
    });
    assert.equal(saved.status, 303);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.quadroMarca, 'DMG');
    assert.equal(row.quadroOrdine, null);
    assert.equal(row.ordineQuadro, null);
    assert.equal(row.arganoPreventivo, false);
    assert.equal(row.preventivoArgano, null);
    assert.equal(row.sospensioni, false);
    assert.equal(row.sospensioniNumero, null);
    assert.equal(row.ordineSospensioni, null);
    for (const path of PDFS) {
      assert.equal((await browser.get(`/schede/${id}/${path}`)).status, 404, path);
    }
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
    assert.match(form.body, /name="pa-indirizzo"[^>]*value="Via Roma 1, Torino"/);
    assert.match(form.body, /name="pa-piani"[^>]*value="5"/);
    assert.match(form.body, /name="sg-mittente"[^>]*>Ascensori Prova<\/textarea>/);
    assert.match(form.body, /name="sg-data"[^>]*value="12\/10\/2026"/);
    assert.match(form.body, /name="sg-automatico" value="si" checked/);
  });

  it('stay inside the company: another company gets 404 for every PDF', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDERS });
    const other = await makeAzienda('Altra Azienda Ordini');
    const { browser: stranger } = await signedIn('ADMIN', other.id);
    for (const path of PDFS) {
      assert.equal((await stranger.get(`/schede/${id}/${path}`)).status, 404, path);
    }
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
    const sheet = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...ORDERS,
      'pa-pesoCabina': '1234567890123',
    });
    assert.equal(sheet.status, 422);
    assert.match(
      sheet.body,
      /href="#f-pa-pesoCabina">Peso cabina \(KG\) \(Modulo rilievi dati argani\)/,
      'a sheet without a supplier is named by its title',
    );
    assert.match(reply.body, /name="oq-quantita"[^>]*value="12345678"/);
    assert.match(reply.body, /name="oq-cliente"[^>]*value="Ascensori Prova"/);
  });
});
