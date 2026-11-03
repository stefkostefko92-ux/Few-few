// DMG against the real app (owner, 2 November 2026): with «Marca quadro: DMG» the panel order is the
// Pitagora 4.0 form; with «Bottoniere da sostituire: Sì» the question «Vuoi compilare la scheda ordine
// bottoniere DMG?» opens the fixtures form (QF Fixtures). Both saved with the card and served as their own
// PDF, filled from the card.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-11-03',
  numeroImpianto: '880078',
  matricola: '4471',
  indirizzo: 'Via Novara 7, Milano',
  portataKg: '630',
  capienzaPersone: '8',
  fermate: '6',
  tipoImpianto: ['ELETTRICO'],
};

const PITAGORA = {
  quadroMarca: 'DMG',
  quadroOrdine: 'si',
  'dp-_': '1',
  'dp-nPiani': '6',
  'dp-taglia': 'taglia21',
  'dp-vvvfTipo': 'gearless',
  'dp-anelloChiuso': 'si',
  'dp-encoder': 'enDat',
  'dp-neutroDtu': 'si',
};

const FIXTURES = {
  bottoniereSostituire: 'si',
  bottoniereOrdine: 'si',
  'db-_': '1',
  'db-modello': 'greta',
  'db-fermate': '6',
  'db-cLarghezzaGreta': 'l160',
  'db-cMateriale': 'g320',
  'db-kg': '630',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

const flatPdf = async (browser: Browser, url: string, pages: number): Promise<void> => {
  const pdf = await browser.get(url);
  assert.equal(pdf.status, 200, url);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const doc = await PDFDocument.load(pdf.bytes);
  assert.equal(doc.getPageCount(), pages, url);
  assert.equal(doc.getForm().getFields().length, 0, `${url}: not flattened`);
};

describe('DMG', () => {
  it('saves the Pitagora order and the fixtures order and serves both PDFs', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...PITAGORA, ...FIXTURES });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.quadroOrdine, true);
    assert.deepEqual(row.ordineQuadro, {
      modulo: 'dmg-pitagora-4-0',
      valori: {
        nPiani: '6',
        taglia: 'taglia21',
        vvvfTipo: 'gearless',
        anelloChiuso: 'si',
        encoder: 'enDat',
        neutroDtu: true,
      },
    });
    assert.equal(row.bottoniereOrdine, true);
    assert.deepEqual(row.ordineBottoniere, {
      modulo: 'dmg-fixtures',
      valori: {
        modello: 'greta',
        fermate: '6',
        cLarghezzaGreta: 'l160',
        cMateriale: 'g320',
        kg: '630',
      },
    });
    await flatPdf(browser, `/schede/${id}/ordine-quadro-dmg-pitagora`, 4);
    await flatPdf(browser, `/schede/${id}/ordine-bottoniere-dmg`, 2);
    // The other makes' forms of the panel are not this card's.
    assert.equal((await browser.get(`/schede/${id}/ordine-quadro`)).status, 404);
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`href="/schede/${id}/ordine-quadro-dmg-pitagora"`));
    assert.match(page.body, new RegExp(`href="/schede/${id}/ordine-bottoniere-dmg"`));
  });

  it('drops the fixtures order when the panels are not to change', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...FIXTURES, bottoniereSostituire: 'no' });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.bottoniereOrdine, null);
    assert.equal(row.ordineBottoniere, null);
    assert.equal((await browser.get(`/schede/${id}/ordine-bottoniere-dmg`)).status, 404);
  });

  it('puts both forms after their question, filled from the card when they first open', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    assert.match(
      form.body,
      /data-when="bottoniereSostituire" data-when-values="si" data-off/,
      'the question follows «Bottoniere da sostituire»',
    );
    assert.match(form.body, /Vuoi compilare la scheda ordine bottoniere DMG\?/);
    assert.match(
      form.body,
      /data-when="quadroMarca" data-when-values="DMG"[^>]*>\s*<div class="modulo" id="f-dp"/,
    );
    assert.match(form.body, /<div class="modulo" id="f-db" data-when="bottoniereOrdine"/);
    // The model of the fixtures is a choice of the page, with no field in the PDF.
    assert.match(form.body, /name="db-modello" value="greta"/);
    assert.match(form.body, /name="db-data"[^>]*value="\d{2}\/\d{2}\/\d{4}"/);
  });
});
