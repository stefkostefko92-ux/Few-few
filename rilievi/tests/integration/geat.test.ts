// GEAT against the real app (the owner, 12 November 2026: "add this option to the choice of panels"): with
// «Marca quadro: GEAT» and «Sì» on the panel order the GEAT form opens, filled from the card (the company as
// customer, the lift, the stops, the doors…); it is saved with the card and served as its own PDF — the
// vendor's two pages, flattened, without the "Ripulisci i campi" button.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-11-12',
  numeroImpianto: '880090',
  matricola: 'MI 5512',
  indirizzo: 'Via Brera 4, Milano',
  portataKg: '480',
  capienzaPersone: '6',
  fermate: '5',
  tipoImpianto: ['GEARLESS'],
  tipoPorte: ['AUTOMATICHE'],
  ubicazioneMacchina: 'ALTO',
};

const GEAT = {
  quadroMarca: 'GEAT',
  quadroOrdine: 'si',
  'gt-_': '1',
  'gt-tipoModulo': 'ordine',
  'gt-nFermate': '5',
  'gt-avviamento': 'vvvfFuji',
  'gt-duplex': 'si',
  'gt-en8120': 'si',
  'gt-motoreKw': '5,5',
  'gt-interpiano1': '3000',
  'gt-operatoreA1': 'si',
  'gt-misuraCorsa': '15000',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(
    reply.status,
    303,
    `create failed with ${reply.status}: ${reply.body.slice(0, 200)}`,
  );
  return reply.location.split('/').pop()!;
}

describe('GEAT', () => {
  it('opens only under its own make, filled from the card', async () => {
    const { browser } = await signedIn('TECNICO');
    // The first opening of the form (no `gt-_` yet), returned with an error: the server fills it.
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      data: 'non-una-data',
      quadroMarca: 'GEAT',
      quadroOrdine: 'si',
    });
    assert.equal(reply.status, 422);
    const segue = (name: string, value: string) =>
      assert.match(
        reply.body,
        new RegExp(`name="gt-${name}"[^>]*value="${value}"[^>]*data-auto=`),
        name,
      );
    segue('matricola', 'MI 5512');
    segue('nImpianto', '880090');
    segue('nFermate', '5');
    segue('portata', '480');
    segue('capienza', '6');
    assert.match(reply.body, /name="gt-salaMacchina" value="alto"[^>]*checked/);
    assert.match(reply.body, /name="gt-tipoImpianto" value="gearless"[^>]*checked/);
    assert.match(reply.body, /name="gt-portePiano" value="auto"[^>]*checked/);
    assert.match(reply.body, /name="gt-tipoModulo" value="ordine"[^>]*checked/);
    // Another make: the GEAT form is closed, its PDF does not exist.
    const pelazza = await create(browser, {
      ...SURVEY,
      quadroMarca: 'PELAZZA',
      quadroOrdine: 'si',
    });
    assert.equal((await browser.get(`/schede/${pelazza}/ordine-quadro-geat`)).status, 404);
  });

  it('saves the order with the card and serves the vendor form, filled and flattened', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...GEAT });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.quadroMarca, 'GEAT');
    const ordine = row.ordineQuadro as { modulo: string; valori: Record<string, unknown> };
    assert.equal(ordine.modulo, 'geat-modulo-quadro');
    assert.equal(ordine.valori.avviamento, 'vvvfFuji');
    assert.equal(ordine.valori.duplex, true);
    assert.equal(ordine.valori.interpiano1, '3000');

    const pdf = await browser.get(`/schede/${id}/ordine-quadro-geat`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    const doc = await PDFDocument.load(pdf.bytes);
    assert.equal(doc.getPageCount(), 2);
    assert.equal(doc.getForm().getFields().length, 0, 'flattened');
    const text = Buffer.from(pdf.bytes).toString('latin1');
    assert.doesNotMatch(text, /BtnSvuota/, 'the reset button is not on the sheet');
  });
});
