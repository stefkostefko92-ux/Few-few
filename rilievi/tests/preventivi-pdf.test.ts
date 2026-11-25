// The PDF of a quote: an A4 letter, PDF/A-2b. A usual quote fits on one page; 100 lines with long
// descriptions continue on the next pages (the table head again) and every page says its number. The
// numbers are those of importi.ts — the same as the page and the saved totals.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { modelloInformativaPreventivi } from '../src/legale/informativa.js';
import { parsePreventivo } from '../src/preventivi/form.js';
import { renderPreventivoPdf } from '../src/preventivi/pdf.js';
import { FONDO } from '../src/preventivi/pdf-parti.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { assertPdfA2b } from './pdfa.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

const options = {
  t: translatorFor('it'),
  fmt: viewHelpers('it'),
  fontDir,
  logo: null,
  intestazione: {
    nome: 'Ascensori Rossi S.r.l.',
    righe: [
      'Via Roma 1, 20121 Milano (MI)',
      'Tel. 02 1234567 – info@example.it',
      'P. IVA 01234567890',
    ],
  },
  numero: 12,
  generatoIl: new Date('2026-11-16T10:00:00.000Z'),
  // The notice at the end of every quote (GDPR art. 13 and 14): the model, as long as it comes.
  informativa: modelloInformativaPreventivi({ name: 'Ascensori Prova', datiSocietari: null }),
};

function data(righe: number, descr = 'Quadro di manovra VVVF') {
  const body: Record<string, string> = {
    cliente: 'Condominio Via Roma 1',
    clienteIndirizzo: 'Via Roma 1, 20121 Milano',
    clientePiva: '80012345678',
    oggetto: 'Sostituzione del quadro di manovra',
    impianto: 'Matricola MI 1234 · N° 55',
    data: '2026-11-13',
    note: 'Escluse opere murarie.',
    condizioni: 'Pagamento: 30% all’ordine, saldo a fine lavori.\nGaranzia: 24 mesi.',
  };
  for (let i = 0; i < righe; i += 1) {
    body[`r-${i}-descrizione`] = `${descr} ${i + 1}`;
    body[`r-${i}-quantita`] = '1,5';
    body[`r-${i}-prezzo`] = '1.234,56';
    body[`r-${i}-sconto`] = i % 2 ? '10' : '';
    body[`r-${i}-iva`] = ['22', '10', '4'][i % 3]!;
  }
  const parsed = parsePreventivo(body);
  assert.ok(parsed.ok, JSON.stringify(!parsed.ok && parsed.errors));
  return parsed.data;
}

const pages = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();
const popplerHere = spawnSync('pdftotext', ['-v']).status === 0;

/** The words of each page with their bottom edge (pdftotext -bbox, points from the top). */
function parole(pdf: Buffer): Array<{ pagina: number; testo: string; yMax: number }> {
  const html = spawnSync('pdftotext', ['-bbox', '-', '-'], { input: pdf }).stdout.toString();
  const out: Array<{ pagina: number; testo: string; yMax: number }> = [];
  html.split('<page ').forEach((pagina, i) => {
    for (const m of pagina.matchAll(/yMax="([\d.]+)">([^<]*)<\/word>/g))
      out.push({ pagina: i, testo: m[2]!, yMax: Number(m[1]) });
  });
  return out;
}

describe('the quote PDF', { skip: !fontsHere && 'DejaVu Sans is not installed' }, () => {
  it('a usual quote is one PDF/A page, with the notice at the end', async () => {
    const pdf = await renderPreventivoPdf(data(4), options);
    await assertPdfA2b(pdf);
    assert.equal(await pages(pdf), 1);
  });

  it('100 long lines continue on the next pages, quickly', async () => {
    const start = performance.now();
    const pdf = await renderPreventivoPdf(data(100, 'Fornitura e posa '.repeat(16)), options);
    assert.ok(performance.now() - start < 5000);
    await assertPdfA2b(pdf);
    assert.ok((await pages(pdf)) >= 4);
  });

  it(
    'a long notice of the company (180 short lines) goes on, never below the bottom margin',
    { skip: !popplerHere && 'pdftotext is not installed' },
    async () => {
      // The review of Кодаджията, 14 November 2026: the text of the company is up to 4000 characters, and
      // 180 lines of a few characters each ran over the footer of the page.
      const righe = Array.from({ length: 180 }, (_, i) => `R${i + 1}x`);
      const pdf = await renderPreventivoPdf(data(4), { ...options, informativa: righe.join('\n') });
      await assertPdfA2b(pdf);
      const scritte = parole(pdf).filter((w) => /^R\d+x$/.test(w.testo));
      assert.deepEqual(
        scritte.map((w) => w.testo),
        righe,
        'every line once, in order',
      );
      for (const w of scritte) assert.ok(w.yMax <= FONDO, `${w.testo} at ${w.yMax}`);
    },
  );
});
