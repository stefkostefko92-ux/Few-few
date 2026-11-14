// The three Elettroquadri order forms themselves (geared, gearless, oleodinamico — the official PDFs of
// elettroquadri.net): every field on its page, the order header repeated on page 2, and the PDFs.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import {
  assertModuli,
  EQ_GEARED,
  EQ_GEARLESS,
  EQ_OLEO,
  fieldsOf,
  moduloPdf,
  nomeModulo,
  type ModuloOverlay,
} from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const FORMS: readonly ModuloOverlay[] = [EQ_GEARED, EQ_GEARLESS, EQ_OLEO];

describe('the Elettroquadri forms', () => {
  it('are the official forms, measured field by field', () => {
    assert.doesNotThrow(() => assertModuli());
    assert.equal(fieldsOf(EQ_GEARED).length, 233);
    assert.equal(fieldsOf(EQ_GEARLESS).length, 189);
    assert.equal(fieldsOf(EQ_OLEO).length, 229);
    assert.equal(
      nomeModulo(EQ_GEARED),
      "Modulo d'ordine | Quadro ascensore elettrico geared · Elettroquadri",
    );
    assert.equal(
      nomeModulo(EQ_GEARLESS),
      "Modulo d'ordine | Ascensore elettrico gearless · Elettroquadri",
    );
    assert.equal(
      nomeModulo(EQ_OLEO),
      "Modulo d'ordine | Quadro ascensore oleodinamico · Elettroquadri",
    );
  });

  it('place every box, line and note on its own A4 page, the page-2 header on page 2', async () => {
    for (const modulo of FORMS) {
      const doc = await PDFDocument.load(moduloPdf(modulo));
      const pages = doc.getPageCount();
      for (const gruppo of modulo.gruppi) {
        assert.ok((gruppo.pagina ?? 1) <= pages, `${modulo.id} ${gruppo.titolo}`);
        for (const field of gruppo.righe.flatMap((riga) => riga.campi)) {
          const where = `${modulo.id} ${field.key}`;
          const { width, height } = doc.getPage((gruppo.pagina ?? 1) - 1).getSize();
          // The same header, at the same place, on the pages it repeats on.
          for (const page of field.anche ?? []) {
            assert.ok(page <= pages && page !== (gruppo.pagina ?? 1), where);
          }
          if (field.kind === 'check') {
            const [x0, y0, x1, y1] = field.box;
            assert.ok(x1 - x0 > 6 && x1 - x0 < 12 && y1 - y0 > 6 && y1 - y0 < 12, where);
            assert.ok(x0 > 0 && x1 < width && y0 > 0 && y1 < height, where);
          } else if ('line' in field) {
            const [x0, x1, y] = field.line;
            assert.ok(x1 - x0 >= 12 && x0 > 0 && x1 < width && y > 0 && y < height, where);
          } else if ('area' in field) {
            const [x0, top, x1, bottom] = field.area;
            assert.ok(x0 < x1 && top < bottom && x1 < width && bottom < height, where);
            for (const y of field.righe ?? []) assert.ok(y > top && y <= bottom, where);
          }
        }
      }
    }
    // Geared and hydraulic repeat the order header on page 2; gearless is one page.
    const repeated = (modulo: ModuloOverlay) =>
      modulo.gruppi
        .flatMap((gruppo) => gruppo.righe.flatMap((riga) => riga.campi))
        .filter((field) => field.anche)
        .map((field) => field.key);
    for (const modulo of [EQ_GEARED, EQ_OLEO]) {
      assert.deepEqual(
        repeated(modulo),
        ['offerta', 'ordine', 'ordineN', 'consegnaRichiesta', 'cliente', 'vsRiferimento', 'data'],
        modulo.id,
      );
    }
    assert.deepEqual(repeated(EQ_GEARLESS), []);
  });

  it('say what a tick is for: within a group no two fields read the same in the summary', () => {
    for (const modulo of FORMS) {
      for (const gruppo of modulo.gruppi) {
        const names = gruppo.righe.flatMap((riga) =>
          riga.campi.map((field) => (riga.titolo ? `${riga.titolo}: ` : '') + field.label),
        );
        assert.equal(new Set(names).size, names.length, `${modulo.id} ${gruppo.titolo}`);
      }
    }
  });
});

/** The decoded content streams of one page of a PDF. */
function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => doc.context.lookup(ref))
      : [contents];
  return streams
    .map((stream) =>
      stream instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
        : '',
    )
    .join('\n');
}

describe(
  'the Elettroquadri PDFs',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('are the official form with the values on it, the order header on both pages', async () => {
      for (const modulo of [EQ_GEARED, EQ_OLEO]) {
        const empty = await PDFDocument.load(await renderModulo(modulo, {}, fontDir));
        const filled = await PDFDocument.load(
          await renderModulo(modulo, { ordine: true, ordineN: '4521', nFermate: '6' }, fontDir),
        );
        assert.equal(filled.getPageCount(), 2);
        // Page 1: the header and the stops; page 2: the header again (a tick and a number).
        const shown = (doc: PDFDocument, page: number) =>
          (pageContent(doc, page).match(/ Tj$/gm) ?? []).length;
        assert.equal(shown(filled, 0) - shown(empty, 0), 2, `${modulo.id} page 1`);
        assert.equal(shown(filled, 1) - shown(empty, 1), 1, `${modulo.id} page 2`);
        assert.ok(pageContent(filled, 1).length > pageContent(empty, 1).length + 40);
      }
      const gearless = await renderModulo(
        EQ_GEARLESS,
        { ordine: true, ordineN: '4521', note: 'Quadro nel locale macchina.' },
        fontDir,
      );
      const gearlessDoc = await PDFDocument.load(gearless);
      assert.equal(gearlessDoc.getPageCount(), 1);
      const blank = await PDFDocument.load(await renderModulo(EQ_GEARLESS, {}, fontDir));
      assert.ok(pageContent(gearlessDoc, 0).length > pageContent(blank, 0).length + 40);
    });
  },
);
