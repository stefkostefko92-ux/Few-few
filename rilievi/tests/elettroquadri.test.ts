// The Elettroquadri panel orders (Bisuschio): three official forms — geared, gearless and hydraulic —
// and no second question: the form follows the kind of lift the sheet ticks (the owner, 30 October 2026:
// electric → geared, MRL → gearless, hydraulic → oleodinamico).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { prefillCollegati } from '../src/ordini/collegati.js';
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
import { impiantoMancante, sceltoNellaScheda, SLOTS } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { activeFields } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const minimal = { data: '2026-10-30', matricola: '33871' };
const slotOf = (prefix: string) => SLOTS.find((slot) => slot.prefix === prefix)!;
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

describe('the form of the Elettroquadri make follows the kind of lift', () => {
  // Every form was opened on the page before (its marker sent) — only the one of the kind is kept.
  const order = (tipoImpianto: string | string[]) => ({
    ...minimal,
    quadroMarca: 'ELETTROQUADRI',
    quadroOrdine: 'si',
    tipoImpianto,
    'eg-_': '1',
    'eg-nFermate': '5',
    'el-_': '1',
    'el-nFermate': '6',
    'eo-_': '1',
    'eo-nFermate': '7',
  });

  it('opens geared for electric, gearless for MRL and oleodinamico for hydraulic — one of them', () => {
    const cases = [
      ['ELETTRICO', EQ_GEARED, '5'],
      ['GEARLESS', EQ_GEARLESS, '6'],
      ['IDRAULICO', EQ_OLEO, '7'],
    ] as const;
    for (const [tipo, modulo, fermate] of cases) {
      // The radio sends one value; a list (a forged or older body) reads the same.
      for (const sent of [tipo, [tipo]]) {
        const parsed = parseScheda(order(sent));
        assert.ok(parsed.ok, tipo);
        assert.deepEqual(parsed.ok && parsed.data.ordineQuadro, {
          modulo: modulo.id,
          valori: { nFermate: fermate },
        });
      }
    }
  });

  it('asks the kind of lift before the order: "Sì" without it is an error on the kind', () => {
    const { tipoImpianto: _, ...senza } = order('ELETTRICO');
    const missing = parseScheda(senza);
    assert.equal(missing.ok, false);
    assert.equal(!missing.ok && missing.errors.tipoImpianto, 'impiantoNeeded');
    const no = parseScheda({ ...minimal, quadroMarca: 'ELETTROQUADRI', quadroOrdine: 'no' });
    assert.ok(no.ok, 'no order, no kind needed');
    assert.equal(no.ok && no.data.ordineQuadro, null);
    // Another make: the kind of lift opens nothing of Elettroquadri and is never asked for.
    const shown = activeFields((key) => ({ quadroMarca: 'PELAZZA' })[key]);
    assert.equal(
      impiantoMancante(shown, () => 'si'),
      null,
    );
    const pelazza = parseScheda({
      ...order('ELETTRICO'),
      quadroMarca: 'PELAZZA',
      'oq-_': '1',
      'oq-nFermate': '4',
    });
    assert.ok(pelazza.ok);
    assert.equal(pelazza.ok && pelazza.data.ordineQuadro?.modulo, 'pelazza-ordine-quadri-032026');
  });

  it('serves each PDF only for the make and the kind the saved sheet chose', () => {
    const saved = { quadroMarca: 'ELETTROQUADRI', tipoImpianto: ['IDRAULICO'] } as Record<
      string,
      unknown
    >;
    const scelto = (prefix: string) => sceltoNellaScheda(slotOf(prefix), (key) => saved[key]);
    assert.equal(scelto('eo'), true);
    assert.equal(scelto('eg'), false);
    assert.equal(scelto('el'), false);
    assert.equal(scelto('oq'), false);
    assert.equal(scelto('pa'), true, 'no make, any make');
    saved.tipoImpianto = [];
    assert.equal(scelto('eg') || scelto('el') || scelto('eo'), false, 'no kind, no form');
  });
});

describe('the Elettroquadri orders and the sheet', () => {
  const values = {
    ...minimal,
    fermate: '6',
    tipoPorte: ['AUTOMATICHE'],
    doppioAccesso: 'si',
    ubicazioneMacchina: ['ALTO'],
    quadroMarca: 'ELETTROQUADRI',
    quadroOrdine: 'si',
    arganoPreventivo: 'si',
    'pa-motoreInverter': 'si',
    'pa-velocita': '1,0',
    'pa-corsa': '15',
    'pa-tensioneFreno': '180',
    'pa-potenzaKw': '5,5',
    'pa-ampere': '12',
  };

  it('take the stops, the accesses, the machine room and the argano data', () => {
    assert.deepEqual(prefillCollegati('eg', { ...values, tipoImpianto: ['ELETTRICO'] }), {
      nFermate: '6',
      velocita: '1,0',
      conVvvf: true,
      corsa: '15',
      frenoV: '180',
      accessi2: true,
      motoreIn: '12',
      motoreKw: '5,5',
    });
    assert.deepEqual(prefillCollegati('el', { ...values, tipoImpianto: ['GEARLESS'] }), {
      nFermate: '6',
      velocita: '1,0',
      corsa: '15',
      frenoVcc: '180',
      accessi2: true,
      localeAlto: true,
      motoreAmp: '12',
      motoreKw: '5,5',
    });
    // Hydraulic: no argano sheet — the power unit of the sheet instead.
    assert.deepEqual(
      prefillCollegati('eo', {
        ...values,
        tipoImpianto: ['IDRAULICO'],
        centralinaDaFare: 'si',
        centralinaMarca: 'GMV',
      }),
      { nFermate: '6', accessi2: true, centralinaAlto: true, centralinaMarca: 'GMV' },
    );
  });

  it('come into the sheet print only under their kind of lift', () => {
    const scheda = {
      riepilogoOrdini: true,
      moduliStampati: ['ordineQuadro'],
      quadroMarca: 'ELETTROQUADRI' as const,
      quadroModello: null,
      tipoImpianto: ['IDRAULICO' as const],
      quadroOrdine: true,
      ordineQuadro: { modulo: EQ_OLEO.id, valori: { nFermate: '7', softStarter: true } },
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      operatore: null,
      ordineSospensioni: null,
    };
    const [summary] = riepilogoModuli(scheda);
    assert.equal(summary?.nome, nomeModulo(EQ_OLEO));
    assert.deepEqual(
      summary?.gruppi.flatMap((g) => g.testi),
      [{ label: 'N° fermate', value: '7' }],
    );
    assert.deepEqual(riepilogoModuli({ ...scheda, tipoImpianto: ['ELETTRICO'] }), []);
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
