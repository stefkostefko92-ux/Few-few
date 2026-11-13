// The PDF of the buono di lavoro: an A4 like the paper sheet, PDF/A-2b. A usual sheet (a few work rows) fits
// on one page with blank rows to write by hand; a long one continues on the next page; every page says its
// number. Signatures are drawn where they are valid; a missing one is a blank space, an altered one is
// named as such, never drawn.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { parseBuono } from '../src/buoni/form.js';
import { renderBuonoPdf, type FirmaPdf } from '../src/buoni/pdf.js';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { assertPdfA2b } from './pdfa.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

function data(body: Record<string, unknown>) {
  // The first new row gets "abcdef01", the next ones other ids (a constant would never be free twice).
  let n = 0;
  const parsed = parseBuono(body, () => (n++ === 0 ? 'abcdef01' : `0000000${n}`));
  assert.ok(parsed.ok);
  return parsed.data;
}

const options = (firme: Map<string, FirmaPdf> = new Map()) => ({
  t: translatorFor('it'),
  fmt: viewHelpers('it'),
  fontDir,
  logo: null,
  azienda: {
    name: 'Ascensori Rossi S.r.l.',
    buonoCodice: 'Mod. PO-05-3 Ed. 02 Emesso: Qualità',
    buonoClausola:
      'Il subappaltatore dichiara di aver ricevuto il P.O.S. e di attenersi alle sue prescrizioni.',
  },
  firme,
  impronta: null,
  generatoIl: new Date('2026-11-16T10:00:00.000Z'),
});

const pages = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

describe(
  'buono di lavoro: the PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('a usual sheet is one A4 page in PDF/A-2b, signed or not', async () => {
      const d = data({
        numero: '118',
        dataConferma: '2026-11-03',
        geometra: 'Geom. Rossi',
        matricola: 'MI 123',
        ubicazione: 'Via Roma 1, Milano',
        pos: 'si',
        note: 'Chiavi dal portiere',
        'seq-0-descrizione': 'Smontaggio quadro esistente',
        'seq-0-esito': 'ok',
        'seq-0-data': '2026-11-16',
        'seq-1-descrizione': 'Montaggio quadro nuovo',
        'ctl-limitatore-esito': 'nonOk',
        tecnici: 'Bianchi, Verdi',
      });
      const firma = { s: [[10, 100, 200, 120, 400, 60, 590, 150]] };
      const firme = new Map<string, FirmaPdf>([
        ['s-abcdef01', { firma, valida: true }],
        ['c-limitatore', { firma, valida: false }],
        ['f-custode', { firma, valida: true }],
      ]);
      for (const set of [new Map<string, FirmaPdf>(), firme]) {
        const pdf = await renderBuonoPdf(d, options(set));
        await assertPdfA2b(pdf);
        assert.equal(await pages(pdf), 1);
      }
    });

    it('an empty sheet is still the whole form, to fill by hand', async () => {
      const pdf = await renderBuonoPdf(data({}), {
        ...options(),
        azienda: { name: 'X', buonoCodice: null, buonoClausola: null },
      });
      await assertPdfA2b(pdf);
      assert.equal(await pages(pdf), 1);
    });

    it('a long sheet continues on the next pages', async () => {
      const body: Record<string, string> = {
        note: 'n '.repeat(1500),
        noteControlli: 'c '.repeat(1500),
      };
      for (let i = 0; i < 30; i += 1) body[`seq-${i}-descrizione`] = `Lavoro ${i} `.repeat(30);
      const parsed = parseBuono(body);
      assert.ok(parsed.ok);
      const pdf = await renderBuonoPdf(parsed.data, options());
      await assertPdfA2b(pdf);
      assert.ok((await pages(pdf)) >= 2);
    });
  },
);
