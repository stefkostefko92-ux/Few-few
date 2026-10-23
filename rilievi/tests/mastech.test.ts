// The Mastech panel orders: the make asks for a second choice — NG120 (one scanned page) or QI Touch
// (two scanned pages) — and each opens its own form under the same "order the panel?" question.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { prefillCollegati } from '../src/ordini/collegati.js';
import {
  assertModuli,
  fieldsOf,
  MASTECH_NG120,
  MASTECH_QI,
  moduloPdf,
  nomeModulo,
  type ModuloOverlay,
} from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { modelloMancante, sceltoNellaScheda, SLOTS } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { activeFields } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const A4 = { width: 595.32, height: 841.92 };
const minimal = { data: '2026-10-14', matricola: '33871' };
const slotOf = (prefix: string) => SLOTS.find((slot) => slot.prefix === prefix)!;

describe('the Mastech forms', () => {
  it('are the scans the owner sent, measured field by field', () => {
    assert.doesNotThrow(() => assertModuli());
    assert.equal(fieldsOf(MASTECH_NG120).length, 206);
    assert.equal(fieldsOf(MASTECH_QI).length, 121);
    assert.equal(
      nomeModulo(MASTECH_NG120),
      "Modulo d'ordine per Quadro di Manovra NG120 · Mastech",
    );
    assert.equal(nomeModulo(MASTECH_QI), 'Modulo Mastech QI Touch · Mastech');
  });

  it('place every box, line and note on its own A4 page', async () => {
    for (const modulo of [MASTECH_NG120, MASTECH_QI]) {
      const pages = (await PDFDocument.load(moduloPdf(modulo))).getPageCount();
      for (const gruppo of modulo.gruppi) {
        assert.ok((gruppo.pagina ?? 1) <= pages, `${modulo.id} ${gruppo.titolo}`);
        for (const field of gruppo.righe.flatMap((riga) => riga.campi)) {
          const where = `${modulo.id} ${field.key}`;
          if (field.kind === 'check') {
            const [x0, y0, x1, y1] = field.box;
            // The floors of NG120 are circled: their box is the cell around the printed number.
            const [min, max] = field.segno === 'cerchio' ? [14, 22] : [5, 12];
            assert.ok(x1 - x0 > min && x1 - x0 < max && y1 - y0 > min - 1 && y1 - y0 < max, where);
            assert.ok(x0 > 0 && x1 < A4.width && y0 > 0 && y1 < A4.height, where);
          } else if ('line' in field) {
            const [x0, x1, y] = field.line;
            assert.ok(x1 - x0 >= 12 && x0 > 0 && x1 < A4.width && y > 0 && y < A4.height, where);
          } else if ('area' in field) {
            const [x0, top, x1, bottom] = field.area;
            assert.ok(x0 < x1 && top < bottom && x1 < A4.width && bottom < A4.height, where);
            for (const y of field.righe ?? []) assert.ok(y > top && y <= bottom, where);
          }
        }
      }
    }
  });

  it('say what a tick is for: within a group no two fields read the same in the summary', () => {
    for (const modulo of [MASTECH_NG120, MASTECH_QI] as ModuloOverlay[]) {
      for (const gruppo of modulo.gruppi) {
        const names = gruppo.righe.flatMap((riga) =>
          riga.campi.map((field) => (riga.titolo ? `${riga.titolo}: ` : '') + field.label),
        );
        assert.equal(new Set(names).size, names.length, `${modulo.id} ${gruppo.titolo}`);
      }
    }
  });
});

describe('the second choice of the Mastech make', () => {
  const order = (prefix: string, extra: Record<string, string>) => ({
    ...minimal,
    quadroMarca: 'MASTECH',
    quadroOrdine: 'si',
    [`${prefix}-_`]: '1',
    ...extra,
  });

  it('opens the NG120 order for NG120 and the QI Touch order for QI Touch, never both', () => {
    const ng = parseScheda(
      order('mn', { quadroModello: 'NG120', 'mn-vvvf': 'si', 'mn-nFermate': '7', 'mq-_': '1' }),
    );
    assert.ok(ng.ok);
    assert.deepEqual(ng.ok && ng.data.ordineQuadro, {
      modulo: MASTECH_NG120.id,
      valori: { vvvf: true, nFermate: '7' },
    });
    const qi = parseScheda(
      order('mq', { quadroModello: 'QI_TOUCH', 'mq-numeroFermate': '7', 'mn-_': '1' }),
    );
    assert.ok(qi.ok);
    assert.deepEqual(qi.ok && qi.data.ordineQuadro, {
      modulo: MASTECH_QI.id,
      valori: { numeroFermate: '7' },
    });
  });

  it('asks which panel before the order: "Sì" without the type is an error on the type', () => {
    const missing = parseScheda(order('mn', { 'mn-vvvf': 'si' }));
    assert.equal(missing.ok, false);
    assert.equal(!missing.ok && missing.errors.quadroModello, 'modelloNeeded');
    const no = parseScheda({ ...minimal, quadroMarca: 'MASTECH', quadroOrdine: 'no' });
    assert.ok(no.ok, 'no order, no type needed');
    assert.equal(no.ok && no.data.quadroModello, null);
  });

  it('keeps the type only under Mastech: another make sends it in vain', () => {
    const forged = parseScheda({
      ...minimal,
      quadroMarca: 'PELAZZA',
      quadroModello: 'NG120',
      quadroOrdine: 'si',
      'oq-_': '1',
      'oq-nFermate': '6',
      'mn-_': '1',
      'mn-nFermate': '9',
    });
    assert.ok(forged.ok);
    assert.equal(forged.ok && forged.data.quadroModello, null);
    assert.equal(forged.ok && forged.data.ordineQuadro?.modulo, 'pelazza-ordine-quadri-032026');
    const shown = activeFields((key) => ({ quadroMarca: 'PELAZZA' })[key]);
    assert.equal(
      modelloMancante(shown, () => 'si'),
      null,
      'no type to ask for under Pelazza',
    );
  });

  it('serves each PDF only for the make and the type the saved sheet chose', () => {
    const saved = { quadroMarca: 'MASTECH', quadroModello: 'QI_TOUCH' } as Record<string, unknown>;
    assert.equal(
      sceltoNellaScheda(slotOf('mq'), (key) => saved[key]),
      true,
    );
    assert.equal(
      sceltoNellaScheda(slotOf('mn'), (key) => saved[key]),
      false,
    );
    assert.equal(
      sceltoNellaScheda(slotOf('oq'), (key) => saved[key]),
      false,
    );
    assert.equal(
      sceltoNellaScheda(slotOf('pa'), (key) => saved[key]),
      true,
      'no make, any make',
    );
  });
});

describe('the Mastech orders and the sheet', () => {
  it('take the stops, the doors and the speed type of the sheet and of the argano sheet', () => {
    const values = {
      ...minimal,
      fermate: '7',
      tipoPorte: ['AUTOMATICHE'],
      doppioAccesso: 'si',
      portataKg: '630',
      quadroMarca: 'MASTECH',
      quadroModello: 'NG120',
      quadroOrdine: 'si',
      arganoPreventivo: 'si',
      'pa-motoreInverter': 'si',
      'pa-taglia12': 'si',
      'pa-poli': '4',
    };
    assert.deepEqual(prefillCollegati('mn', values), {
      nFermate: '7',
      vvvf: true,
      op1Automatico: true,
      nPoli: '4',
      taglia21: true,
    });
    const qi = { ...values, quadroModello: 'QI_TOUCH' };
    assert.deepEqual(prefillCollegati('mq', qi), {
      numeroFermate: '7',
      portataNominale: '630',
      numeroAccessi: '2',
      numeroPoli: '4',
    });
  });

  it('come into the sheet print by their groups, a tick named by its row of the sheet', () => {
    const scheda = {
      riepilogoOrdini: true,
      moduliStampati: ['ordineQuadro'],
      quadroMarca: 'MASTECH' as const,
      quadroModello: 'NG120' as const,
      quadroOrdine: true,
      ordineQuadro: {
        modulo: MASTECH_NG120.id,
        valori: { en811: true, allarme12V: true, nFermate: '7', pianoA0: true },
      },
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      operatore: null,
      ordineSospensioni: null,
    };
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        nome: nomeModulo(MASTECH_NG120),
        gruppi: [
          { titolo: 'Dati Impianto', spunte: ['Norme di riferimento: EN81.1'], testi: [] },
          {
            titolo: 'Fermate',
            spunte: ['Apertura accesso A e Denominazione piani: 0'],
            testi: [{ label: 'N° Fermate', value: '7' }],
          },
          { titolo: 'Opzioni', spunte: ['Tensione Allarme: 12V'], testi: [] },
        ],
      },
    ]);
    assert.deepEqual(riepilogoModuli({ ...scheda, quadroModello: 'QI_TOUCH' }), []);
  });
});

describe('the Mastech PDFs', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('are the scanned form with the values on it: NG120 on one page, QI Touch on two', async () => {
    const ng = await renderModulo(
      MASTECH_NG120,
      { en811: true, pianoA0: true, nFermate: '7', note: 'Quadro nel locale macchina.' },
      fontDir,
    );
    assert.equal((await PDFDocument.load(ng)).getPageCount(), 1);
    assert.ok(ng.length > moduloPdf(MASTECH_NG120).length);
    const qi = await renderModulo(
      MASTECH_QI,
      { cliente: 'Ascensori Rossi', s1Fossa: '1200', noteRilievi: 'Misure in mm.' },
      fontDir,
    );
    const doc = await PDFDocument.load(qi);
    assert.equal(doc.getPageCount(), 2);
    for (const page of doc.getPages()) assert.deepEqual(page.getSize(), A4);
  });
});
