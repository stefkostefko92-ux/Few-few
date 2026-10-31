// The intervention form ("Servizio assistenza elevatori · Modulo di pronto intervento", the owner, 30
// October 2026): the items of the paper pad, what the form may send, the finger signatures and the PDF,
// always one A4 page.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import { viewHelpers } from '../src/http/view.js';
import { parseConferma } from '../src/interventi/conferma.js';
import { firmaDalForm, firmaSalvata, pathFirma } from '../src/interventi/firma.js';
import { formValuesFromIntervento, parseIntervento } from '../src/interventi/form.js';
import { FONDO_PAGINA, fineFoglio, renderInterventoPdf } from '../src/interventi/pdf.js';
import { numeroModulo, type InterventoFull } from '../src/interventi/service.js';
import {
  improntaContenuto,
  improntaFirma,
  sigilloDi,
  sigilloValido,
  type ContenutoIntervento,
} from '../src/interventi/sigillo.js';
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
const FIRMA_CLIENTE = JSON.stringify({ s: [[30, 120, 200, 60, 420, 150]] });

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

  it('confirm only with both signatures, both names and two different signatures', () => {
    const ok = parseConferma({
      firmaTecnico: FIRMA,
      firmaTecnicoNome: '  Mario   Rossi ',
      firmaCliente: FIRMA_CLIENTE,
      firmaClienteNome: 'Anna\nBianchi',
    });
    assert.ok(ok.ok);
    assert.deepEqual(ok.ok && [ok.data.firmaTecnicoNome, ok.data.firmaClienteNome], [
      'Mario Rossi',
      'Anna Bianchi',
    ]);
    assert.deepEqual(parseConferma({}), {
      ok: false,
      errors: {
        firmaTecnico: 'mancante',
        firmaTecnicoNome: 'mancante',
        firmaCliente: 'mancante',
        firmaClienteNome: 'mancante',
      },
    });
    const copied = parseConferma({
      firmaTecnico: FIRMA,
      firmaTecnicoNome: 'Mario',
      firmaCliente: FIRMA,
      firmaClienteNome: 'x'.repeat(121),
    });
    assert.deepEqual(!copied.ok && copied.errors, {
      firmaCliente: 'uguale',
      firmaClienteNome: 'tooLong',
    });
    const forged = parseConferma({
      firmaTecnico: '{"s":[[999,1]]}',
      firmaTecnicoNome: ['Mario'],
      firmaCliente: FIRMA_CLIENTE,
      firmaClienteNome: 'Anna',
    });
    assert.deepEqual(!forged.ok && forged.errors, {
      firmaTecnico: 'invalid',
      firmaTecnicoNome: 'invalid',
    });
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
    // Sent anyway (an old page, a forged form): the draft takes no signature and no name.
    firmaTecnico: FIRMA,
    firmaTecnicoNome: 'Mario Rossi',
    firmaClienteNome: 'Anna Bianchi',
  };

  it('reads the header, the items and the hours — never a signature', () => {
    const parsed = parseIntervento(body);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.data.indirizzo, 'Via Roma 12');
    assert.equal(parsed.data.tecnici, 'Mario Rossi\nLuca Verdi');
    assert.equal(parsed.data.turno, 'MATTINA');
    assert.deepEqual(parsed.data.voci, { '60': { x: true, q: '3,5' } });
    assert.equal(parsed.data.prove, true);
    assert.deepEqual([parsed.data.oreTecnico, parsed.data.oreTotali], ['1.50', '3.00']);
    for (const key of ['firmaTecnico', 'firmaTecnicoNome', 'firmaCliente', 'firmaClienteNome'])
      assert.equal(key in parsed.data, false, key);
  });

  it('reports every error at once, under the name of its field', () => {
    const parsed = parseIntervento({
      ...body,
      data: '',
      turno: 'NOTTE',
      oreTecnico: 'tre',
      matricola: 'x'.repeat(41),
      prove: 'yes',
    });
    assert.equal(parsed.ok, false);
    assert.deepEqual(!parsed.ok && parsed.errors, {
      data: 'required',
      turno: 'option',
      oreTecnico: 'decimal',
      matricola: 'tooLong',
      prove: 'invalid',
    });
  });

  it('opens a saved draft in the shape of the form', () => {
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
    });
    assert.equal(values.data, '2026-10-30');
    assert.equal(values['v-84'], 'si');
    assert.deepEqual(values['c-84'], ['P']);
    assert.equal(values.oreTecnico, '1,5');
  });
});

describe('the seal of a confirmed sheet', () => {
  const KEY = Buffer.alloc(32, 7);
  const content: ContenutoIntervento = {
    id: 'cm0intervento',
    aziendaId: 'cm0azienda',
    numero: 42,
    data: new Date('2026-10-30T00:00:00Z'),
    turno: 'MATTINA',
    indirizzo: 'Via Roma 12',
    citta: 'Milano',
    tecnici: 'Mario Rossi',
    matricola: 'MI 4521',
    voci: { '84': { x: true, q: 'piano 3', c: ['P'] }, '05': { x: true, q: '2' } },
    altro: 'Sostituito pulsante.',
    prove: true,
    oreTecnico: { toString: () => '1.5' },
    oreTotali: { toString: () => '3' },
  };
  const firme = {
    firmaTecnico: JSON.parse(FIRMA) as { s: number[][] },
    firmaTecnicoNome: 'Mario Rossi',
    firmaCliente: JSON.parse(FIRMA_CLIENTE) as { s: number[][] },
    firmaClienteNome: 'Anna Bianchi',
    confermatoAt: new Date('2026-10-30T14:32:00.123Z'),
    confermatoById: 'cm0utente',
  };
  const impronta = improntaContenuto(content);
  const sealed = { ...content, ...firme, impronta, sigillo: sigilloDi(KEY, impronta, firme) };

  it('fingerprints exactly what the sheet says, whatever the order of the items in the database', () => {
    assert.match(impronta, /^[0-9a-f]{64}$/);
    assert.equal(
      improntaContenuto({
        ...content,
        voci: { '05': { q: '2', x: true }, '84': { c: ['P'], q: 'piano 3', x: true }, xx: 1 },
        oreTecnico: { toString: () => '1.50' },
      }),
      impronta,
      'same content, other order, unknown key, "1.50" — the same fingerprint',
    );
    const changes: Array<Partial<ContenutoIntervento>> = [
      { id: 'cm0altro' },
      { aziendaId: 'cm0altra' },
      { numero: 43 },
      { data: new Date('2026-10-31T00:00:00Z') },
      { turno: 'POMERIGGIO' },
      { indirizzo: 'Via Roma 13' },
      { citta: 'Monza' },
      { tecnici: 'Luca Verdi' },
      { matricola: 'MI 4522' },
      { voci: { '84': { x: true, q: 'piano 3', c: ['C'] }, '05': { x: true, q: '2' } } },
      { voci: { '84': { x: true, q: 'piano 3', c: ['P'] }, '05': { x: true, q: '3' } } },
      { voci: { '84': { x: true, q: 'piano 3', c: ['P'] } } },
      { altro: 'Sostituito pulsante di piano.' },
      { prove: false },
      { oreTecnico: { toString: () => '2' } },
      { oreTotali: null },
    ];
    for (const change of changes)
      assert.notEqual(
        improntaContenuto({ ...content, ...change }),
        impronta,
        JSON.stringify(change),
      );
  });

  it('holds only for the signed content, the same signatures, names and time, and the same key', () => {
    assert.equal(sigilloValido(KEY, sealed), true);
    assert.equal(sigilloValido(Buffer.alloc(32, 8), sealed), false, 'another key');
    const broken: Array<Partial<typeof sealed>> = [
      { citta: 'Monza' },
      { voci: {} },
      { firmaClienteNome: 'Altra Persona' },
      { firmaTecnicoNome: 'Mario Rossi.' },
      { firmaCliente: { s: [[30, 120, 200, 60, 420, 151]] } },
      { firmaTecnico: JSON.parse(FIRMA_CLIENTE) as { s: number[][] } },
      { confermatoAt: new Date('2026-10-30T14:32:00.124Z') },
      { confermatoById: 'cm0altro' },
      { sigillo: sealed.sigillo.replace(/^./, (c) => (c === '0' ? '1' : '0')) },
      { sigillo: sealed.sigillo.slice(0, 62) },
      { impronta: improntaContenuto({ ...content, citta: 'Monza' }), citta: 'Monza' },
    ];
    for (const change of broken)
      assert.equal(sigilloValido(KEY, { ...sealed, ...change }), false, JSON.stringify(change));
    // A sheet confirmed before the seal existed, or a damaged signature: not verified, never "ok".
    assert.equal(sigilloValido(KEY, { ...sealed, impronta: null, sigillo: null }), false);
    assert.equal(sigilloValido(KEY, { ...sealed, firmaCliente: 'broken' }), false);
    assert.equal(sigilloValido(KEY, { ...sealed, confermatoAt: null }), false);
    assert.equal(sigilloValido(KEY, { ...sealed, confermatoById: null }), false);
  });

  it('keeps its canon: the fingerprints and the seal of a fixed sheet never move', () => {
    // A change here invalidates every seal already in the database (their PDF and email stop): a new
    // canon needs a new label ("v2") and the old one kept for checking — never an edit of these values.
    assert.equal(impronta, '697321ad3741ec726ad9bff035ee7640c360ebc046906f9056a14ec7e2c2e309');
    assert.equal(
      sealed.sigillo,
      'ad9b0a342ba4a2dfcbbf6da965598695829f6f430a1f971056cdc52c40814ee9',
    );
    // The same string PostgreSQL builds in the migration: replace(("firmaTecnico" -> 's')::text, ' ', '').
    assert.equal(
      improntaFirma(firme.firmaTecnico),
      'dd17b62727793691e2d850eab2abc84c5a4673e003b06b8f0bfdf3c34b198f4d',
    );
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
    impronta: 'f'.repeat(64),
    sigillo: 'f'.repeat(64),
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
