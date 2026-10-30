// The intervention form ("Servizio assistenza elevatori · Modulo di pronto intervento", the owner, 30
// October 2026): the items of the paper pad, what the form may send, the finger signatures and the PDF,
// always one A4 page.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import { viewHelpers } from '../src/http/view.js';
import { firmaDalForm, firmaSalvata, pathFirma } from '../src/interventi/firma.js';
import { formValuesFromIntervento, parseIntervento } from '../src/interventi/form.js';
import { FONDO_PAGINA, fineFoglio, renderInterventoPdf } from '../src/interventi/pdf.js';
import { firmato, numeroModulo, type InterventoFull } from '../src/interventi/service.js';
import {
  codiceVoce,
  GRUPPI_VOCI,
  MAX_CAMPO,
  valoriVoci,
  VOCI,
  vociDalForm,
} from '../src/interventi/voci.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const FIRMA = JSON.stringify({
  s: [
    [10, 150, 120, 40, 260, 160],
    [400, 100],
  ],
});

describe('the items of the paper pad', () => {
  it('are the 97 numbers of the photo, in its five groups, each once', () => {
    assert.deepEqual(
      GRUPPI_VOCI.map((g) => [g.titolo, g.voci[0]!.n, g.voci.at(-1)!.n, g.voci.length]),
      [
        ['Quadro di manovra', 1, 14, 14],
        ['Cabina mobile', 21, 29, 9],
        ['Porte', 31, 48, 18],
        ['Vano', 51, 64, 14],
        ['Locale argano + vari', 71, 97, 27],
      ],
    );
    assert.equal(new Set(VOCI.map((v) => v.n)).size, VOCI.length);
    // A blank on the line is a field: exactly the items with "{q}" have one.
    for (const voce of VOCI)
      assert.equal(voce.testo.includes('{q}'), Boolean(voce.campo), String(voce.n));
    assert.deepEqual(VOCI.find((v) => v.n === 84)?.scelte, ['C', 'P']);
    assert.equal(codiceVoce(5), '05');
    assert.equal(numeroModulo(42), '000042');
  });

  it('keep from the form only known items, their blanks and C/P — over-long or forged is an error', () => {
    const ok = vociDalForm({
      'v-05': 'si',
      'q-05': '  2 ',
      'v-84': 'si',
      'q-84': 'piano 3',
      'c-84': ['P', 'C'],
      'v-99': 'si',
      'q-01': 'nessun campo qui',
    });
    assert.ok(ok.ok);
    assert.deepEqual(ok.ok && ok.voci, {
      '05': { x: true, q: '2' },
      '84': { x: true, q: 'piano 3', c: ['P', 'C'] },
    });
    const bad = vociDalForm({
      'v-01': 'yes',
      'q-05': 'x'.repeat(MAX_CAMPO.n + 1),
      'c-84': 'Z',
      'q-42': ['a'],
    });
    assert.equal(bad.ok, false);
    assert.deepEqual(!bad.ok && bad.errors, {
      'v-01': 'invalid',
      'q-05': 'tooLong',
      'c-84': 'invalid',
      'q-42': 'invalid',
    });
    // What comes back from the database is read the same careful way.
    assert.deepEqual(valoriVoci({ '05': { x: true, q: 'a\u0000b' }, '06': 'x', constructor: {} }), {
      '05': { x: true, q: 'a b' },
    });
  });
});

describe('the finger signatures', () => {
  it('are strokes of whole numbers in the 600 × 200 box, or nothing', () => {
    assert.deepEqual(firmaDalForm(''), { ok: true, firma: null });
    const ok = firmaDalForm(FIRMA);
    assert.ok(ok.ok && ok.firma);
    assert.equal(ok.ok && ok.firma && pathFirma(ok.firma), 'M10 150L120 40L260 160M400 100l0.1 0');
    for (const forged of [
      '{"s":[[601,10]]}',
      '{"s":[[10.5,10]]}',
      '{"s":[[10,10,20]]}',
      '{"s":[]}',
      '{"s":[[1,1]],"x":1}',
      'not json',
      JSON.stringify({ s: Array.from({ length: 201 }, () => [1, 1]) }),
      'x'.repeat(70_000),
    ]) {
      assert.deepEqual(firmaDalForm(forged), { ok: false }, forged.slice(0, 40));
    }
    assert.equal(firmaSalvata({ s: [[1, 2]] })?.s.length, 1);
    assert.equal(firmaSalvata('broken'), null);
  });

  it('confirm only with both signatures and both names', () => {
    const both = { firmaTecnico: JSON.parse(FIRMA), firmaCliente: JSON.parse(FIRMA) };
    assert.equal(firmato({ ...both, firmaTecnicoNome: 'Mario', firmaClienteNome: 'Anna' }), true);
    assert.equal(firmato({ ...both, firmaTecnicoNome: 'Mario', firmaClienteNome: null }), false);
    assert.equal(
      firmato({ ...both, firmaCliente: null, firmaTecnicoNome: 'Mario', firmaClienteNome: 'Anna' }),
      false,
    );
  });
});

describe('the intervention form', () => {
  const body = {
    data: '2026-10-30',
    turno: 'MATTINA',
    indirizzo: ' Via Roma  12 ',
    citta: 'Milano',
    tecnici: 'Mario Rossi\nLuca Verdi',
    matricola: 'MI 4521',
    'v-60': 'si',
    'q-60': '3,5',
    altro: 'Sostituito pulsante.',
    prove: 'si',
    oreTecnico: '1,5',
    oreTotali: '3',
    firmaTecnico: FIRMA,
    firmaTecnicoNome: 'Mario Rossi',
    firmaClienteNome: 'Anna Bianchi',
  };

  it('reads the header, the items, the hours and the signatures', () => {
    const parsed = parseIntervento(body);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.data.indirizzo, 'Via Roma 12');
    assert.equal(parsed.data.tecnici, 'Mario Rossi\nLuca Verdi');
    assert.equal(parsed.data.turno, 'MATTINA');
    assert.deepEqual(parsed.data.voci, { '60': { x: true, q: '3,5' } });
    assert.equal(parsed.data.prove, true);
    assert.deepEqual([parsed.data.oreTecnico, parsed.data.oreTotali], ['1.50', '3.00']);
    assert.ok(parsed.data.firmaTecnico);
    assert.equal(parsed.data.firmaCliente, null, 'the customer has not signed yet');
  });

  it('reports every error at once, under the name of its field', () => {
    const parsed = parseIntervento({
      ...body,
      data: '',
      turno: 'NOTTE',
      oreTecnico: 'tre',
      matricola: 'x'.repeat(41),
      prove: 'yes',
      firmaCliente: '{"s":[[999,1]]}',
    });
    assert.equal(parsed.ok, false);
    assert.deepEqual(!parsed.ok && parsed.errors, {
      data: 'required',
      turno: 'option',
      oreTecnico: 'decimal',
      matricola: 'tooLong',
      prove: 'invalid',
      firmaCliente: 'invalid',
    });
  });

  it('opens a saved draft without its signatures: a change is signed again', () => {
    const values = formValuesFromIntervento({
      data: new Date('2026-10-30T00:00:00Z'),
      turno: null,
      indirizzo: 'Via Roma 12',
      citta: null,
      tecnici: null,
      matricola: null,
      voci: { '84': { x: true, q: 'piano 3', c: ['P'] } },
      altro: null,
      prove: false,
      oreTecnico: { toString: () => '1.50' },
      oreTotali: null,
      firmaTecnicoNome: 'Mario Rossi',
      firmaClienteNome: null,
    });
    assert.equal(values.data, '2026-10-30');
    assert.equal(values['v-84'], 'si');
    assert.deepEqual(values['c-84'], ['P']);
    assert.equal(values.oreTecnico, '1,5');
    assert.equal(values.firmaTecnicoNome, 'Mario Rossi');
    assert.equal(values.firmaTecnico, undefined);
  });
});

/** The fullest sheet possible: every item ticked, every blank and text at its maximum. */
function fullest(): InterventoFull {
  const voci: Record<string, unknown> = {};
  for (const voce of VOCI) {
    voci[codiceVoce(voce.n)] = {
      x: true,
      ...(voce.campo ? { q: 'W'.repeat(MAX_CAMPO[voce.campo]) } : {}),
      ...(voce.scelte ? { c: [...voce.scelte] } : {}),
    };
  }
  const firma = JSON.parse(FIRMA) as object;
  return {
    id: 'x',
    aziendaId: 'a',
    numero: 999999,
    data: new Date('2026-10-30T00:00:00Z'),
    turno: 'POMERIGGIO',
    indirizzo: 'W'.repeat(200),
    citta: 'W'.repeat(120),
    tecnici: 'W'.repeat(300),
    matricola: 'W'.repeat(40),
    voci,
    altro: 'W '.repeat(500),
    prove: true,
    oreTecnico: '9999.99',
    oreTotali: '9999.99',
    firmaTecnico: firma,
    firmaTecnicoNome: 'W'.repeat(120),
    firmaCliente: firma,
    firmaClienteNome: 'W'.repeat(120),
    confermatoAt: new Date('2026-10-30T14:32:00Z'),
    confermatoById: null,
    createdById: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    azienda: {
      id: 'a',
      name: 'W'.repeat(120),
      logoType: null,
      logoWidth: null,
      logoHeight: null,
      logoUpdatedAt: null,
    },
    createdBy: null,
    updatedBy: null,
    confermatoBy: { name: 'W'.repeat(120) },
  } as unknown as InterventoFull;
}

describe(
  'the intervention PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    const options = { t: translatorFor('it'), fmt: viewHelpers('it'), fontDir, logo: null };

    it('is one A4 page even when every line is full', async () => {
      const row = fullest();
      assert.ok(fineFoglio(row, options) <= FONDO_PAGINA, `${fineFoglio(row, options)}`);
      const doc = await PDFDocument.load(await renderInterventoPdf(row, options));
      assert.equal(doc.getPageCount(), 1);
      assert.deepEqual(doc.getPage(0).getSize(), { width: 595.28, height: 841.89 });
      assert.equal(doc.getTitle(), 'Modulo di pronto intervento n. 999999');
    });

    it('keeps the usual size for an ordinary sheet', () => {
      const row = { ...fullest(), voci: { '05': { x: true, q: '2' } }, indirizzo: 'Via Roma 12' };
      assert.ok(fineFoglio(row as InterventoFull, options, 7) <= FONDO_PAGINA);
    });
  },
);
