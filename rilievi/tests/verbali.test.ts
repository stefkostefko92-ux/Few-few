// "Verbale di chiusura cantiere" (the owner, 5 November 2026, from the paper sheet): linked to a scheda or
// not; from the scheda only the address, the work order number (N° buono) and today's date are filled in —
// everything else is written and chosen by people. The rows of the paper sheet by section, a "Certificato"
// SÌ/NO only on the rows that have it (the other right cells stay empty), "Verbale positivo" SÌ/NO; signed
// like the intervention sheet (the technician and the supervisor, on the final content, fingerprint and
// seal); after both signatures, two PDFs of the same signed content: "Copia azienda" and "Copia
// installatore".
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { assertPdfA2b } from './pdfa.js';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { parseConferma } from '../src/interventi/conferma.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseFirmeVerbale } from '../src/verbali/conferma.js';
import {
  formValuesDalBody,
  formValuesFromVerbale,
  parseVerbale,
  valoriDaScheda,
} from '../src/verbali/form.js';
import { COPIE, renderVerbalePdf } from '../src/verbali/pdf.js';
import type { VerbaleFull } from '../src/verbali/service.js';
import {
  improntaVerbale,
  sigilloVerbale,
  sigilloVerbaleValido,
  type ContenutoVerbale,
} from '../src/verbali/sigillo.js';
import {
  MAX_RIGA,
  MAX_VARIE,
  SEZIONI_VERBALE,
  valoriVerbale,
  VOCI_VERBALE,
} from '../src/verbali/voci.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const t = translatorFor('it');
const KEY = Buffer.alloc(32, 7);
const TECNICO = { s: [[10, 150, 120, 40, 260, 160]] };
const SUPERVISORE = { s: [[30, 120, 200, 60, 420, 150]] };

describe('the rows of the closing report, as on the paper sheet', () => {
  it('has the four sections with their rows, "Varie" last, in the order of the sheet', () => {
    const label = (key: string) => t(`verbali.voce.${key}`);
    assert.deepEqual(
      SEZIONI_VERBALE.map((s) => [t(`verbali.sezione.${s.key}`), s.voci.map((v) => label(v.key))]),
      [
        [
          'Locale macchina',
          [
            'Quadro',
            'Argano/centralina',
            'Funi/tubazione',
            'Impianto elettrico',
            'Limitatore',
            'Varie',
          ],
        ],
        ['Vano corsa', ['Linee elettriche', 'Cavi', 'Serrature/sospensioni', 'Luce vano', 'Varie']],
        ['Cabina', ['Circuito cabina', 'Bottoniera', 'Tetto cabina', 'Varie']],
        ['Finiture', ['Bottoniere', 'Imbotti', 'Varie']],
      ],
    );
  });

  it('asks "Certificato" only on the frame, the machine, the ropes, the governor and the locks', () => {
    assert.deepEqual(
      VOCI_VERBALE.filter((v) => v.certificato).map((v) => v.key),
      ['quadro', 'argano', 'funi', 'limitatore', 'serrature'],
    );
    assert.equal(new Set(VOCI_VERBALE.map((v) => v.key)).size, VOCI_VERBALE.length);
  });
});

describe('the draft form of the closing report', () => {
  const FORM = {
    data: '2026-11-05',
    indirizzo: 'Via Monte Santo 8, Milano',
    buono: 'BL 2026/118',
    't-quadro': '  Quadro   nuovo\tmontato ',
    'c-quadro': 'si',
    'c-argano': 'no',
    't-varieLocale': 'Riga uno\r\nRiga due',
    't-imbotti': 'Verniciati',
    positivo: 'si',
  };

  it('keeps what people wrote and chose, cleaned, and nothing else', () => {
    const parsed = parseVerbale({ ...FORM, sconosciuto: 'x', 't-nonEsiste': 'y' });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.voci, {
      quadro: { t: 'Quadro nuovo montato', c: 'si' },
      argano: { c: 'no' },
      varieLocale: { t: 'Riga uno\nRiga due' },
      imbotti: { t: 'Verniciati' },
    });
    assert.equal(parsed.data.positivo, true);
    assert.equal(parsed.data.buono, 'BL 2026/118');
    assert.equal(parsed.data.data.toISOString(), '2026-11-05T00:00:00.000Z');
    // Everything but the date may stay empty in a draft — "Verbale positivo" is asked before signing.
    const empty = parseVerbale({ data: '2026-11-05' });
    assert.ok(empty.ok);
    assert.deepEqual(empty.data.voci, {});
    assert.equal(empty.data.positivo, null);
  });

  it('refuses a missing date, too long a text, a forged choice and "Certificato" on a row without it', () => {
    const parsed = parseVerbale({
      ...FORM,
      data: '',
      'c-quadro': 'forse',
      'c-cavi': 'si',
      't-cavi': 'x'.repeat(MAX_RIGA + 1),
      't-varieVano': 'x'.repeat(MAX_VARIE + 1),
      't-luceVano': ['a', 'b'],
      positivo: 'boh',
    });
    assert.ok(!parsed.ok);
    assert.deepEqual(parsed.errors, {
      data: 'required',
      'c-quadro': 'invalid',
      'c-cavi': 'invalid',
      't-cavi': 'tooLong',
      't-varieVano': 'tooLong',
      't-luceVano': 'invalid',
      positivo: 'option',
    });
    // A row at its limit passes.
    assert.ok(parseVerbale({ ...FORM, 't-cavi': 'x'.repeat(MAX_RIGA) }).ok);
  });

  it('shows the saved draft and what was sent back in the form', () => {
    const parsed = parseVerbale(FORM);
    assert.ok(parsed.ok);
    const values = formValuesFromVerbale({ ...parsed.data, voci: parsed.data.voci });
    assert.equal(values.data, '2026-11-05');
    assert.equal(values['t-quadro'], 'Quadro nuovo montato');
    assert.equal(values['c-quadro'], 'si');
    assert.equal(values['c-limitatore'], '');
    assert.equal(values.positivo, 'si');
    assert.equal(values['c-cavi'], undefined, 'no "Certificato" on a row without it');
    const back = formValuesDalBody({ ...FORM, 't-cavi': ['x'], scheda: 'abc' });
    assert.equal(back['t-cavi'], '');
    assert.equal(back.scheda, 'abc');
  });

  it('reads the database with distrust: unknown keys, wrong types and forged choices are dropped', () => {
    assert.deepEqual(
      valoriVerbale({
        quadro: { t: 'ok', c: 'si' },
        cavi: { t: 'ok', c: 'si' },
        argano: { t: 'x'.repeat(MAX_RIGA + 1), c: 'forse' },
        funi: 'testo',
        estraneo: { t: 'no' },
      }),
      { quadro: { t: 'ok', c: 'si' }, cavi: { t: 'ok' } },
    );
    assert.deepEqual(valoriVerbale(null), {});
    assert.deepEqual(valoriVerbale([1, 2]), {});
  });
});

describe('the closing report from the scheda of the lift', () => {
  it('takes only the address and the work order number, with the date of today', () => {
    assert.deepEqual(
      valoriDaScheda({ indirizzo: 'Via Monte Santo 8', buonoLavoro: 'BL 118' }, '2026-11-05'),
      { data: '2026-11-05', indirizzo: 'Via Monte Santo 8', buono: 'BL 118' },
    );
    assert.deepEqual(valoriDaScheda({ indirizzo: null, buonoLavoro: null }, '2026-11-05'), {
      data: '2026-11-05',
      indirizzo: '',
      buono: '',
    });
  });
});

/**
 * The fingerprint of CONTENUTO with the canon "rilievi/verbale/v1" — computed once (also by hand, from
 * the canon array with node:crypto) and frozen.
 */
const ETALONE = 'b60a46a52f76d081ce589c02cb01a46832797157b1c0ab1fe17702b83b2feeaf';

const CONTENUTO: ContenutoVerbale = {
  id: 'cmverbale000000000000001',
  aziendaId: 'cmazienda000000000000001',
  data: new Date('2026-11-05T00:00:00Z'),
  indirizzo: 'Via Monte Santo 8',
  buono: 'BL 118',
  voci: { quadro: { t: 'Nuovo', c: 'si' }, imbotti: { t: 'Verniciati' } },
  positivo: true,
};

describe('the fingerprint and the seal of the closing report', () => {
  it('has a fixed fingerprint: a change in the canon breaks every old seal, so this test fails first', () => {
    assert.equal(
      improntaVerbale(CONTENUTO),
      improntaVerbale({
        ...CONTENUTO,
        voci: { imbotti: { t: 'Verniciati' }, quadro: { c: 'si', t: 'Nuovo' } },
      }),
      'the order of the keys in the database does not matter',
    );
    assert.equal(improntaVerbale(CONTENUTO), ETALONE);
  });

  it('changes with every word of the content, and not with what the sheet does not show', () => {
    const base = improntaVerbale(CONTENUTO);
    for (const changed of [
      { ...CONTENUTO, indirizzo: 'Via Monte Santo 9' },
      { ...CONTENUTO, buono: 'BL 119' },
      { ...CONTENUTO, data: new Date('2026-11-06T00:00:00Z') },
      { ...CONTENUTO, positivo: false },
      { ...CONTENUTO, voci: { ...(CONTENUTO.voci as object), quadro: { t: 'Nuovo', c: 'no' } } },
      { ...CONTENUTO, aziendaId: 'cmazienda000000000000002' },
    ])
      assert.notEqual(improntaVerbale(changed), base);
    assert.equal(
      improntaVerbale({
        ...CONTENUTO,
        voci: { ...(CONTENUTO.voci as object), estraneo: { t: 'x' } },
      }),
      base,
    );
  });

  it('seals the fingerprint with both signatures, the names, the time and who confirmed', () => {
    const impronta = improntaVerbale(CONTENUTO);
    const firme = {
      firmaTecnico: TECNICO,
      firmaTecnicoNome: 'Mario Rossi',
      firmaSupervisore: SUPERVISORE,
      firmaSupervisoreNome: 'Anna Bianchi',
      confermatoAt: new Date('2026-11-05T15:00:00Z'),
      confermatoById: 'cmuser0000000000000001',
    };
    const row = { ...CONTENUTO, ...firme, impronta, sigillo: sigilloVerbale(KEY, impronta, firme) };
    assert.equal(sigilloVerbaleValido(KEY, row), true);
    assert.equal(sigilloVerbaleValido(Buffer.alloc(32, 8), row), false, 'another key');
    assert.equal(sigilloVerbaleValido(KEY, { ...row, buono: 'BL 119' }), false, 'content changed');
    assert.equal(sigilloVerbaleValido(KEY, { ...row, firmaSupervisoreNome: 'Altra' }), false);
    assert.equal(sigilloVerbaleValido(KEY, { ...row, firmaTecnico: SUPERVISORE }), false);
    assert.equal(sigilloVerbaleValido(KEY, { ...row, confermatoById: null }), false);
    assert.equal(sigilloVerbaleValido(KEY, { ...row, sigillo: null }), false);
    // Not the seal of an intervention sheet with the same fingerprint (its own label).
    assert.notEqual(row.sigillo, sigilloVerbale(KEY, impronta.replace(/^./, '0'), firme));
  });
});

describe('the two signatures of the closing report', () => {
  const FIRME = {
    firmaTecnico: JSON.stringify(TECNICO),
    firmaTecnicoNome: 'Mario Rossi',
    firmaSupervisore: JSON.stringify(SUPERVISORE),
    firmaSupervisoreNome: ' Anna   Bianchi ',
  };

  it('takes the technician and the supervisor with their names', () => {
    const parsed = parseFirmeVerbale(FIRME);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.firmaSupervisore, SUPERVISORE);
    assert.equal(parsed.data.firmaSupervisoreNome, 'Anna Bianchi');
  });

  it('wants both signatures and both names, and two different signatures', () => {
    const empty = parseFirmeVerbale({});
    assert.ok(!empty.ok);
    assert.deepEqual(empty.errors, {
      firmaTecnico: 'mancante',
      firmaTecnicoNome: 'mancante',
      firmaSupervisore: 'mancante',
      firmaSupervisoreNome: 'mancante',
    });
    const same = parseFirmeVerbale({ ...FIRME, firmaSupervisore: FIRME.firmaTecnico });
    assert.ok(!same.ok);
    assert.deepEqual(same.errors, { firmaSupervisore: 'uguale' });
    const forged = parseFirmeVerbale({ ...FIRME, firmaTecnico: '{"s":[[9999,1]]}' });
    assert.ok(!forged.ok);
    assert.deepEqual(forged.errors, { firmaTecnico: 'invalid' });
  });

  it('leaves the intervention sheet as it was (the shared parser)', () => {
    const parsed = parseConferma({
      firmaTecnico: FIRME.firmaTecnico,
      firmaTecnicoNome: 'Mario Rossi',
      firmaCliente: FIRME.firmaSupervisore,
      firmaClienteNome: 'Anna Bianchi',
    });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.firmaCliente, SUPERVISORE);
    const same = parseConferma({
      firmaTecnico: FIRME.firmaTecnico,
      firmaCliente: FIRME.firmaTecnico,
    });
    assert.ok(!same.ok);
    assert.equal(same.errors.firmaCliente, 'uguale');
  });
});

/** A confirmed report: every row at its limit, both signatures. */
function pieno(): VerbaleFull {
  const voci: Record<string, unknown> = {};
  for (const voce of VOCI_VERBALE)
    voci[voce.key] = {
      t: voce.varie ? 'Parola '.repeat(MAX_VARIE / 7).trim() : 'W'.repeat(MAX_RIGA),
      ...(voce.certificato ? { c: 'si' } : {}),
    };
  return {
    ...CONTENUTO,
    voci,
    indirizzo: 'W'.repeat(200),
    buono: 'W'.repeat(60),
    schedaId: null,
    firmaTecnico: TECNICO,
    firmaTecnicoNome: 'W'.repeat(120),
    firmaSupervisore: SUPERVISORE,
    firmaSupervisoreNome: 'W'.repeat(120),
    confermatoAt: new Date('2026-11-05T15:00:00Z'),
    impronta: 'f'.repeat(64),
    sigillo: 'f'.repeat(64),
    firmaTecnicoHash: 'a'.repeat(64),
    firmaSupervisoreHash: 'b'.repeat(64),
    confermatoById: null,
    createdById: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    azienda: {
      id: 'a',
      name: 'Ascensori Rossi',
      logoType: null,
      logoWidth: null,
      logoHeight: null,
      logoUpdatedAt: null,
    },
    scheda: null,
    createdBy: null,
    updatedBy: null,
    confermatoBy: { name: 'Mario Rossi' },
  } as unknown as VerbaleFull;
}

describe(
  'the two PDFs of the closing report',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    const options = { t, fmt: viewHelpers('it'), fontDir, logo: null };

    it('makes the company copy and the installer copy of the same content, on two A4 pages like the paper', async () => {
      const row = { ...pieno(), voci: CONTENUTO.voci } as VerbaleFull;
      const titoli: string[] = [];
      for (const copia of COPIE) {
        const bytes = await renderVerbalePdf(row, { ...options, copia });
        // Confirmed documents are archival: PDF/A-2b (owner, 12 November 2026 — point D6).
        await assertPdfA2b(bytes);
        const doc = await PDFDocument.load(bytes);
        assert.equal(doc.getPageCount(), 2, `${copia}: two pages, as the paper sheet`);
        for (const page of doc.getPages())
          assert.deepEqual(page.getSize(), { width: 595.28, height: 841.89 });
        titoli.push(doc.getTitle() ?? '');
      }
      assert.deepEqual(titoli, [
        'Verbale di chiusura cantiere — COPIA AZIENDA',
        'Verbale di chiusura cantiere — COPIA INSTALLATORE',
      ]);
    });

    it('flows onto more pages when every row is full, without losing a row', async () => {
      const doc = await PDFDocument.load(
        await renderVerbalePdf(pieno(), { ...options, copia: 'installatore' }),
      );
      assert.ok(doc.getPageCount() >= 3 && doc.getPageCount() <= 6, `${doc.getPageCount()}`);
      for (const page of doc.getPages())
        assert.deepEqual(page.getSize(), { width: 595.28, height: 841.89 });
    });
  },
);
