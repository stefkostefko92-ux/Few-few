// The size and the order of the photos in the print, chosen with a preview in "Stampa e PDF" at the end
// of the sheet form (the owner, 10 November 2026: "facciamo scegliere all'utente nelle impostazioni di
// stampa con un'anteprima la dimensione e l'ordine delle foto"): the rows of each size in the PDF, the
// same rows in the browser's preview (public/js/foto-righe.js), the order read from the form and kept on
// the photos, the print in that order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { fotoPerStampa, ordineScelte } from '../src/allegati/stampa.js';
import type { AllegatoVista } from '../src/allegati/service.js';
import { translatorFor } from '../src/i18n.js';
import { DIMENSIONI, drawFoto, righeFoto } from '../src/schede/pdf-foto.js';
import { CONTENT_WIDTH, MARGIN, type PdfContext } from '../src/schede/pdf-layout.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { DIMENSIONI_FOTO, fotoFromBody, fotoInStampaDi } from '../src/schede/stampa.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

type Righe = ReturnType<typeof righeFoto>;
const browser = (() => {
  const window: Record<string, unknown> = {};
  vm.runInNewContext(
    readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'foto-righe.js'), 'utf8'),
    { window },
  );
  return window.rilieviFotoRighe as {
    DIMENSIONI: typeof DIMENSIONI;
    righeFoto: (r: number[], w: number, m: unknown) => Righe;
    PAGINA: { contenuto: number };
  };
})();

describe('the size of the photos', () => {
  const ORIZZONTALE = 4 / 3;
  const perRiga = (dimensione: keyof typeof DIMENSIONI, rapporti: number[]) =>
    righeFoto(rapporti, CONTENT_WIDTH, DIMENSIONI[dimensione]).map((r) => r.length);

  it('puts more small photos on a row, fewer large ones, one on a row of its own', () => {
    const nove = Array<number>(9).fill(ORIZZONTALE);
    const piccole = perRiga('PICCOLE', nove);
    const medie = perRiga('MEDIE', nove);
    const grandi = perRiga('GRANDI', nove);
    assert.ok(Math.max(...piccole) > Math.max(...medie), `${piccole} / ${medie}`);
    assert.ok(Math.max(...grandi) < Math.max(...medie), `${grandi} / ${medie}`);
    assert.deepEqual(perRiga('UNA', nove), Array<number>(9).fill(1));
    for (const d of DIMENSIONI_FOTO) {
      for (const riga of righeFoto(Array<number>(12).fill(3 / 4), CONTENT_WIDTH, DIMENSIONI[d]))
        assert.ok(riga.length <= DIMENSIONI[d].maxPerRiga, d);
    }
  });

  it('one on a row: a landscape photo takes the whole width, a portrait one stops at its height', () => {
    const larga = righeFoto([ORIZZONTALE], CONTENT_WIDTH, DIMENSIONI.UNA)[0]![0]!;
    assert.ok(Math.abs(larga.larghezza - CONTENT_WIDTH) < 0.01);
    const alta = righeFoto([3 / 4], CONTENT_WIDTH, DIMENSIONI.UNA)[0]![0]!;
    assert.equal(alta.altezza, DIMENSIONI.UNA.altezzaMax);
  });

  it('the preview in the browser makes the same rows as the PDF, for every size', () => {
    // Another realm (node:vm): compared as plain data.
    assert.deepEqual(JSON.parse(JSON.stringify(browser.DIMENSIONI)), DIMENSIONI);
    assert.ok(Math.abs(browser.PAGINA.contenuto - CONTENT_WIDTH) < 1e-9);
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let k = 0; k < 200; k += 1) {
      const rapporti = Array.from(
        { length: 1 + Math.floor(random() * 14) },
        () => [3 / 4, 1, 4 / 3, 16 / 9, 0.5 + random() * 1.6][Math.floor(random() * 5)]!,
      );
      for (const d of DIMENSIONI_FOTO) {
        const atteso = righeFoto(rapporti, CONTENT_WIDTH, DIMENSIONI[d]);
        const avuto = browser.righeFoto(rapporti, CONTENT_WIDTH, browser.DIMENSIONI[d]);
        assert.deepEqual(JSON.parse(JSON.stringify(avuto)), atteso, `${d} ${rapporti}`);
      }
    }
  });
});

describe('the order and the size from the form', () => {
  const [a, b, c] = ['cm' + 'a'.repeat(22), 'cm' + 'b'.repeat(22), 'cm' + 'c'.repeat(22)];

  it('keeps the ticked photos in the order sent, the ticked ones missing from it at the end', () => {
    const sent = {
      fotoMostrate: `${a} ${b} ${c}`,
      fotoStampa: [a, b, c],
      fotoOrdine: `${c} ${a} ${c}`,
      fotoDimensione: 'GRANDI',
    };
    assert.deepEqual(fotoInStampaDi(sent), {
      success: true,
      data: { mostrate: [a, b, c], scelte: [a, b, c], ordine: [c, a, b], dimensione: 'GRANDI' },
    });
    // Not ticked: not in the order.
    const meno = fotoInStampaDi({ ...sent, fotoStampa: [a, c] });
    assert.deepEqual(meno.success && meno.data?.ordine, [c, a]);
    // A page from before (no order, no size): neither is touched.
    const prima = fotoInStampaDi({ fotoMostrate: a, fotoStampa: a });
    assert.deepEqual(prima, { success: true, data: { mostrate: [a], scelte: [a] } });
  });

  it('refuses a forged order or size', () => {
    const base = { fotoMostrate: a, fotoStampa: a };
    assert.equal(fotoInStampaDi({ ...base, fotoOrdine: `${a} ../x` }).success, false);
    assert.equal(fotoInStampaDi({ ...base, fotoDimensione: 'ENORMI' }).success, false);
    assert.equal(fotoInStampaDi({ ...base, fotoDimensione: ['MEDIE'] }).success, false);
  });

  it('a form that comes back keeps the order and the size sent', () => {
    assert.deepEqual(
      fotoFromBody({
        fotoMostrate: `${a} ${b}`,
        fotoStampa: [a, b],
        fotoOrdine: `${b} ${a}`,
        fotoDimensione: 'UNA',
      }),
      { mostrate: [a, b], scelte: [a, b], ordine: [b, a], dimensione: 'UNA' },
    );
  });
});

describe('the photos in the order chosen', () => {
  let n = 0;
  const file = (sezione: string, over: Partial<AllegatoVista> = {}): AllegatoVista => ({
    id: `cm${String(++n).padStart(22, '0')}`,
    sezione,
    tipo: 'FOTO',
    stato: 'PRONTO',
    didascalia: null,
    nomeOriginale: `${sezione}.jpg`,
    larghezza: 800,
    altezza: 600,
    durataMs: null,
    errore: null,
    inStampa: true,
    ordineStampa: null,
    createdAt: new Date('2026-11-10T08:00:00Z'),
    ...over,
  });
  const sections = [{ key: 'impianto' }, { key: 'quadro' }, { key: 'argano' }];

  it('prints the placed photos first, by their place, then the others by section', () => {
    const q1 = file('quadro', { ordineStampa: 2 });
    const q2 = file('quadro');
    const a1 = file('argano', { ordineStampa: 1 });
    const i1 = file('impianto');
    const fuori = file('argano', { ordineStampa: 3, inStampa: false });
    const allegati = [q1, q2, a1, i1, fuori];
    assert.deepEqual(
      fotoPerStampa(sections, allegati).map((g) => [g.section.key, g.foto.map((f) => f.id)]),
      [
        ['argano', [a1.id]],
        ['quadro', [q1.id]],
        ['impianto', [i1.id]],
        ['quadro', [q2.id]],
      ],
    );
    assert.deepEqual(ordineScelte(sections, allegati, new Set([q1.id, a1.id, q2.id])), [
      a1.id,
      q1.id,
      q2.id,
    ]);
  });

  it('without a place, in the order of the sections, as before', () => {
    const allegati = [file('argano'), file('quadro'), file('impianto')];
    assert.deepEqual(
      fotoPerStampa(sections, allegati).map((g) => g.section.key),
      ['impianto', 'quadro', 'argano'],
    );
  });
});

describe(
  'the PDF at each size',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('fits eight landscape photos on one page when small, gives each its row when one on a row', async () => {
      const immagine = await sharp({
        create: { width: 120, height: 90, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .jpeg()
        .toBuffer();
      const pagine = (dimensione: keyof typeof DIMENSIONI) => {
        const paths = pdfFontPaths(fontDir);
        const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
        doc.registerFont('Sans', paths.regular);
        doc.registerFont('Sans-Bold', paths.bold);
        const ctx: PdfContext = { doc, t: translatorFor('it') };
        const foto = Array.from({ length: 8 }, (_, i) => ({
          immagine,
          larghezza: 1200,
          altezza: 900,
          didascalia: `Foto ${i + 1}`,
        }));
        drawFoto(ctx, [{ titolo: 'Quadro', foto }], dimensione);
        const count = doc.bufferedPageRange().count;
        doc.end();
        return count;
      };
      assert.equal(pagine('PICCOLE'), 1);
      assert.ok(pagine('UNA') >= 4, `${pagine('UNA')}`);
      assert.ok(pagine('GRANDI') > pagine('PICCOLE'));
    });
  },
);
