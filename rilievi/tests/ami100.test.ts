// AMI 100 (30 October 2026): with a reduced pit or a reduced headroom the sheet asks "Installare AMI
// 100?"; with "Sì", Mono UCM or Mono RTBS, each with its own order sheet drawn by us from the list the
// owner sent, and its own PDF.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument, PDFName, type PDFDict, type PDFPage } from 'pdf-lib';
import { prefillCollegati } from '../src/ordini/collegati.js';
import { AMI_RTBS, AMI_UCM, fieldsOf, moduloPdf, nomeModulo } from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { sceltoNellaScheda, SLOTS } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { activeFields } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const minimal = { data: '2026-10-30', matricola: '33871' };
const shownWith = (values: Record<string, unknown>) => activeFields((key) => values[key]);

function resources(page: PDFPage, kind: 'Font' | 'XObject'): string[] {
  const dict = page.node.Resources()?.lookup(PDFName.of(kind)) as PDFDict | undefined;
  return dict ? dict.keys().map((key) => key.asString()) : [];
}

describe('AMI 100', () => {
  it('is asked with a reduced pit or headroom, never in a hydraulic lift', () => {
    assert.ok(shownWith({ fossaRidotta: 'si' }).has('ami100'));
    assert.ok(shownWith({ testataRidotta: 'si' }).has('ami100'));
    assert.ok(shownWith({ fossaRidotta: 'no', testataRidotta: 'si' }).has('ami100'));
    assert.ok(!shownWith({ fossaRidotta: 'no', testataRidotta: 'no' }).has('ami100'));
    assert.ok(!shownWith({}).has('ami100'));
    // The reduced pit and headroom are not asked of a hydraulic lift: nor is AMI 100.
    const idraulico = { tipoImpianto: ['IDRAULICO'], fossaRidotta: 'si', testataRidotta: 'si' };
    assert.ok(!shownWith(idraulico).has('ami100'));
    assert.ok(shownWith({ fossaRidotta: 'si', ami100: 'si' }).has('ami100Tipo'));
    assert.ok(!shownWith({ fossaRidotta: 'si', ami100: 'no' }).has('ami100Tipo'));
  });

  it('wants the type with "Sì" and keeps only the sheet of that type', () => {
    const base = { ...minimal, fossaRidotta: 'si', ami100: 'si' };
    const missing = parseScheda(base);
    assert.equal(!missing.ok && missing.errors.ami100Tipo, 'ami100TipoNeeded');

    const ucm = parseScheda({
      ...base,
      ami100Tipo: 'MONO_UCM',
      'au-_': '1',
      'au-numeroOrdine': ' A-17 ',
      'au-spessore9': 'si',
      'au-tensione24': 'si',
      'ar-_': '1',
      'ar-codiceAmi': 'not this one',
    });
    assert.ok(ucm.ok);
    assert.equal(ucm.ok && ucm.data.ami100Tipo, 'MONO_UCM');
    assert.deepEqual(ucm.ok && ucm.data.ordineAmi, {
      modulo: 'ami100-mono-ucm',
      valori: { numeroOrdine: 'A-17', spessore9: true, tensione24: true },
    });

    const rtbs = parseScheda({
      ...base,
      ami100Tipo: 'MONO_RTBS',
      'ar-_': '1',
      'ar-codiceAmi': 'RTBS-24',
      'ar-numeroStaffe': '6',
    });
    assert.ok(rtbs.ok);
    assert.equal(rtbs.ok && rtbs.data.ordineAmi?.modulo, 'ami100-mono-rtbs');

    // No reduced pit or headroom any more: the question and the sheet go, whatever the form sent.
    const gone = parseScheda({
      ...minimal,
      fossaRidotta: 'no',
      ami100: 'si',
      ami100Tipo: 'MONO_UCM',
      'au-_': '1',
      'au-numeroOrdine': 'A-17',
    });
    assert.ok(gone.ok);
    assert.equal(gone.ok && gone.data.ami100, null);
    assert.equal(gone.ok && gone.data.ordineAmi, null);
  });

  it('takes the load and the stops from the sheet into the UCM form', () => {
    const values = {
      ...minimal,
      portataKg: '630',
      fermate: '6',
      fossaRidotta: 'si',
      ami100: 'si',
      ami100Tipo: 'MONO_UCM',
    };
    assert.deepEqual(prefillCollegati('au', values), { portata: '630', fermate: '6' });
  });

  it('serves each PDF only for the type the saved sheet chose, and brings it into the print', () => {
    const scheda = {
      riepilogoOrdini: true,
      moduliStampati: ['ordineAmi'],
      quadroMarca: null,
      quadroModello: null,
      tipoImpianto: [],
      quadroOrdine: null,
      ordineQuadro: null,
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      operatore: null,
      ordineSospensioni: null,
      ami100: true,
      ami100Tipo: 'MONO_RTBS' as const,
      ordineAmi: {
        modulo: AMI_RTBS.id,
        valori: { codiceAmi: 'RTBS-24', tensione48: true, funeDestra: true },
      },
    };
    const value = (key: string) => (scheda as Record<string, unknown>)[key];
    const slot = (prefix: string) => SLOTS.find((s) => s.prefix === prefix)!;
    assert.ok(sceltoNellaScheda(slot('ar'), value));
    assert.ok(!sceltoNellaScheda(slot('au'), value));
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        nome: 'AMI 100 Mono RTBS',
        gruppi: [
          {
            titolo: 'AMI 100 Mono RTBS',
            spunte: [
              'Tensione di alimentazione: 48 Vdc',
              'Posizione della fune del limitatore rispetto alla guida: Destra',
            ],
            testi: [{ label: 'Codice AMI 100 MONO RTBS', value: 'RTBS-24' }],
          },
        ],
      },
    ]);
  });

  it('has the fields of the list the owner sent, in its order', () => {
    assert.equal(nomeModulo(AMI_UCM), 'AMI 100 Mono UCM');
    assert.deepEqual(
      AMI_UCM.gruppi[1]!.righe.map((r) => r.titolo ?? r.campi[0]!.label),
      [
        "Numero d'ordine",
        'Portata impianto = Q [Kg]',
        'Peso cabina + peso arcata + peso accessori = P [Kg]',
        'Peso contrappeso [Kg]',
        'Spessore guida [mm]',
        'Tensione di alimentazione',
        'Posizione della fune del limitatore rispetto alla guida',
        'Numero delle fermate',
        'Sopralzi universali',
        'Economizzatore',
      ],
    );
    assert.deepEqual(
      AMI_RTBS.gruppi[1]!.righe.map((r) => r.titolo ?? r.campi[0]!.label),
      [
        'Disponibilità',
        "Numero d'ordine",
        'Tensione di alimentazione',
        'Codice AMI 100 MONO RTBS',
        'Codice staffa',
        'Numero staffe',
        'Codice sopralzo universale',
        'Spessore guida [mm]',
        'Economizzatore',
        'Posizione della fune del limitatore rispetto alla guida',
      ],
    );
    assert.equal(fieldsOf(AMI_UCM).length, 3 + 4 + 4 + 2 + 2 + 1 + 2 + 2);
  });

  it('writes on the sheet we drew: one A4 page, no picture', { skip: !fontsHere }, async () => {
    for (const modulo of [AMI_UCM, AMI_RTBS]) {
      const blank = (await PDFDocument.load(moduloPdf(modulo))).getPage(0);
      assert.equal(resources(blank, 'XObject').length, 0, modulo.id);
      const out = await renderModulo(
        modulo,
        { numeroOrdine: 'A-17', tensione24: true, riferimento: 'Via Roma 12, Milano' },
        fontDir,
      );
      const doc = await PDFDocument.load(out);
      assert.equal(doc.getPageCount(), 1);
      // The labels of the sheet in its own fonts, what we write in DejaVu Sans (pdf-lib names it anew
      // for every text it draws).
      const fonts = resources(doc.getPage(0), 'Font');
      for (const font of resources(blank, 'Font')) assert.ok(fonts.includes(font), modulo.id);
      assert.ok(
        fonts.some((font) => font.startsWith('/DejaVuSans')),
        modulo.id,
      );
    }
  });
});
