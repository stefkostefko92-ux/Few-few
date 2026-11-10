// AMI 100 (owner, 3 November 2026 — his sheet "Solo su elettrico"): a reduced headroom and a reduced pit
// each ask which solutions go in; "AMI 100 Mono RTBS" is one of them, in either list, and opens its order
// sheet (drawn by us from the list the owner sent, 30 October 2026) with its own PDF. The old question
// "Installare AMI 100?" and the Mono UCM sheet are gone.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument, PDFName, type PDFDict, type PDFPage } from 'pdf-lib';
import { AMI_RTBS, fieldsOf, moduloPdf, nomeModulo } from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { campoCheApre, SLOTS } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { activeFields, fieldByKey } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const minimal = { data: '2026-11-03', matricola: '33871' };
const shownWith = (values: Record<string, unknown>) => activeFields((key) => values[key]);

function resources(page: PDFPage, kind: 'Font' | 'XObject'): string[] {
  const dict = page.node.Resources()?.lookup(PDFName.of(kind)) as PDFDict | undefined;
  return dict ? dict.keys().map((key) => key.asString()) : [];
}

describe('the solutions for a reduced headroom or pit', () => {
  it('are asked in the order of the sheet, each list under its own "Sì", never in a hydraulic lift', () => {
    const shown = shownWith({ testataRidotta: 'si', fossaRidotta: 'si' });
    for (const key of ['testataInterventi', 'fossaInterventi']) assert.ok(shown.has(key), key);
    assert.ok(!shownWith({ testataRidotta: 'no', fossaRidotta: 'si' }).has('testataInterventi'));
    assert.ok(!shownWith({ testataRidotta: 'si', fossaRidotta: 'no' }).has('fossaInterventi'));
    const idraulico = { tipoImpianto: ['IDRAULICO'], testataRidotta: 'si', fossaRidotta: 'si' };
    assert.ok(!shownWith(idraulico).has('testataInterventi'));
    assert.ok(!shownWith(idraulico).has('fossaInterventi'));
    // The note of the retractable apron only with the apron ticked.
    const apron = { fossaRidotta: 'si', fossaInterventi: ['GREMBIULE_3_STADI'] };
    assert.ok(shownWith(apron).has('grembiuleNote'));
    assert.ok(
      !shownWith({ fossaRidotta: 'si', fossaInterventi: ['SEMAFORO'] }).has('grembiuleNote'),
    );
    // No question and no type of AMI 100 any more.
    assert.equal(fieldByKey('ami100'), undefined);
    assert.equal(fieldByKey('ami100Tipo'), undefined);
    assert.deepEqual(
      SLOTS.filter((s) => s.column === 'ordineAmi').map((s) => s.prefix),
      ['ar'],
    );
  });

  it('open the Mono RTBS sheet from either list, and drop it when the tick goes', () => {
    const order = { 'ar-_': '1', 'ar-codiceAmi': 'RTBS-24', 'ar-numeroStaffe': '6' };
    const fromTop = parseScheda({
      ...minimal,
      testataRidotta: 'si',
      testataInterventi: ['PUNTONI_WW', 'AMI100_RTBS'],
      ...order,
    });
    assert.ok(fromTop.ok);
    assert.deepEqual(fromTop.ok && fromTop.data.testataInterventi, ['PUNTONI_WW', 'AMI100_RTBS']);
    assert.deepEqual(fromTop.ok && fromTop.data.ordineAmi, {
      modulo: 'ami100-mono-rtbs',
      valori: { codiceAmi: 'RTBS-24', numeroStaffe: '6' },
    });
    const fromPit = parseScheda({
      ...minimal,
      fossaRidotta: 'si',
      fossaInterventi: 'AMI100_RTBS',
      ...order,
    });
    assert.ok(fromPit.ok);
    assert.equal(fromPit.ok && fromPit.data.ordineAmi?.modulo, 'ami100-mono-rtbs');
    // Other solutions only, or the tick in a list that is not asked: no sheet.
    for (const body of [
      { testataRidotta: 'si', testataInterventi: ['SEMAFORO'] },
      { testataRidotta: 'no', testataInterventi: ['AMI100_RTBS'] },
    ]) {
      const parsed = parseScheda({ ...minimal, ...body, ...order });
      assert.ok(parsed.ok);
      assert.equal(parsed.ok && parsed.data.ordineAmi, null, JSON.stringify(body));
    }
  });

  it('serve the PDF and the print of the saved sheet from the list that has the tick', () => {
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
      testataInterventi: [],
      fossaInterventi: ['SEMAFORO', 'AMI100_RTBS'] as ('SEMAFORO' | 'AMI100_RTBS')[],
      bottoniereOrdine: null,
      ordineBottoniere: null,
      ordineAmi: {
        modulo: AMI_RTBS.id,
        valori: { codiceAmi: 'RTBS-24', tensione48: true, funeDestra: true },
      },
    };
    const slot = SLOTS.find((s) => s.prefix === 'ar')!;
    const value = (key: string) => (scheda as Record<string, unknown>)[key];
    assert.equal(campoCheApre(slot, value), 'fossaInterventi');
    assert.equal(
      campoCheApre(slot, (key) => (key === 'fossaInterventi' ? [] : value(key))),
      undefined,
    );
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
});

describe('the AMI 100 Mono RTBS sheet', () => {
  it('has the fields of the list the owner sent, in its order', () => {
    assert.equal(nomeModulo(AMI_RTBS), 'AMI 100 Mono RTBS');
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
    assert.ok(fieldsOf(AMI_RTBS).length > 10);
  });

  it('writes on the sheet we drew: one A4 page, no picture', { skip: !fontsHere }, async () => {
    const blank = (await PDFDocument.load(moduloPdf(AMI_RTBS))).getPage(0);
    assert.equal(resources(blank, 'XObject').length, 0);
    const out = await renderModulo(
      AMI_RTBS,
      { numeroOrdine: 'A-17', tensione24: true, riferimento: 'Via Roma 12, Milano' },
      fontDir,
    );
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    // The labels of the sheet in its own fonts, what we write in DejaVu Sans (pdf-lib names it anew
    // for every text it draws).
    const fonts = resources(doc.getPage(0), 'Font');
    for (const font of resources(blank, 'Font')) assert.ok(fonts.includes(font));
    assert.ok(fonts.some((font) => font.startsWith('/DejaVuSans')));
  });
});
