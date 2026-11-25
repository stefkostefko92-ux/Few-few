// Manual doors (the owner, 10 November 2026: "Se seleziono impianto manuale vicino alle info del pattino
// retrattile mettere Contatti antine da sostituire? Si/no. Blocca portine da installare? Sì/no"): two
// questions right after the retiring cam, only with manual doors; their "Sì" goes into the text of the
// out-of-service notice like the other works. And the matricola is free text (same day): "Nel numero
// matricola fallo campo di tipo testo".
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { viewHelpers } from '../src/http/view.js';
import { renderSchedaPdf } from '../src/schede/pdf.js';
import { fontDir, fontsHere, scheda } from './scheda-pdf.js';
import { testoProposto } from '../src/cartelli/da-scheda.js';
import { activeFields, FIELDS, fieldByKey } from '../src/schede/fields.js';
import { parseScheda } from '../src/schede/validation.js';
import { translatorFor } from '../src/i18n.js';

const minimal = { data: '2026-11-10', matricola: '33871' };
const NUOVI = ['contattiAntine', 'bloccaPortineDaInstallare'] as const;

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

describe('the cabin door contacts and the door lock, with manual doors', () => {
  it('are two Sì/No questions right after the retiring cam', () => {
    const keys = FIELDS.map((f) => f.key);
    const dopo = keys.indexOf('pattinoRetrattileTipo');
    assert.deepEqual(keys.slice(dopo + 1, dopo + 3), [...NUOVI]);
    for (const key of NUOVI) assert.equal(fieldByKey(key)?.kind, 'yesno', key);
  });

  it('are asked only with manual doors', () => {
    const shown = (tipoPorte: string[]) => activeFields((key) => ({ tipoPorte })[key]);
    for (const key of NUOVI) {
      assert.ok(shown(['MANUALI']).has(key), key);
      assert.ok(!shown(['SEMIAUTOMATICHE']).has(key), key);
      assert.ok(!shown(['AUTOMATICHE']).has(key), key);
      assert.ok(!shown([]).has(key), key);
    }
  });

  it('keep their answers with manual doors and drop them with the other kinds', () => {
    const risposte = { contattiAntine: 'si', bloccaPortineDaInstallare: 'no' };
    const manuali = parsedOrFail({ ...minimal, tipoPorte: 'MANUALI', ...risposte });
    assert.equal(manuali.contattiAntine, true);
    assert.equal(manuali.bloccaPortineDaInstallare, false);
    for (const tipoPorte of ['SEMIAUTOMATICHE', 'AUTOMATICHE']) {
      const altre = parsedOrFail({ ...minimal, tipoPorte, ...risposte });
      assert.equal(altre.contattiAntine, null, tipoPorte);
      assert.equal(altre.bloccaPortineDaInstallare, null, tipoPorte);
    }
    const sbagliata = parseScheda({ ...minimal, tipoPorte: 'MANUALI', contattiAntine: 'forse' });
    assert.equal(!sbagliata.ok && sbagliata.errors.contattiAntine, 'option');
  });

  it("have the owner's words as labels", () => {
    const t = translatorFor('it');
    assert.equal(t('scheda.field.contattiAntine'), 'Contatti antine da sostituire?');
    assert.equal(t('scheda.field.bloccaPortineDaInstallare'), 'Blocca portine da installare?');
  });

  it('go into the text of the out-of-service notice', () => {
    const base = { tipoPorte: ['MANUALI'] };
    assert.equal(
      testoProposto({ ...base, contattiAntine: true }, '2026-11-10'),
      "Dal 10/11 l'impianto è fermo per lavori di ammodernamento: sostituzione dei meccanismi delle porte.",
    );
    assert.equal(
      testoProposto({ ...base, bloccaPortineDaInstallare: true }, '2026-11-10'),
      "Dal 10/11 l'impianto è fermo per lavori di ammodernamento: installazione di nuovi dispositivi di sicurezza.",
    );
    // Hidden with automatic doors: says nothing.
    assert.equal(
      testoProposto({ tipoPorte: ['AUTOMATICHE'], contattiAntine: true }, '2026-11-10'),
      '',
    );
  });
});

describe('the matricola', () => {
  it('is free text up to 40 characters: letters, symbols, leading zeros and inner spaces stay', () => {
    assert.equal(fieldByKey('matricola')?.kind, 'text');
    for (const value of ['MI 123', '123/98', '12-3', '0033871', 'AB-0012/2024 (MI)']) {
      assert.equal(parsedOrFail({ data: '2026-11-10', matricola: value }).matricola, value);
    }
    assert.equal(
      parsedOrFail({ data: '2026-11-10', matricola: '  0033 871 ' }).matricola,
      '0033 871',
    );
    const lunga = parseScheda({ data: '2026-11-10', matricola: 'x'.repeat(41) });
    assert.equal(!lunga.ok && lunga.errors.matricola, 'tooLong');
  });

  it('leaves the number of the lift digits only', () => {
    const result = parseScheda({ data: '2026-11-10', numeroImpianto: 'MI 123' });
    assert.equal(!result.ok && result.errors.numeroImpianto, 'digitsOnly');
  });
});

describe(
  'the plate of the sheet PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('keeps a 40-character matricola and a 20-digit number each on one line', async () => {
      const matricola = 'MI-0012/2024 ASCENSORE SCALA B PIANO T.';
      const numeroImpianto = '1'.repeat(20);
      const pdf = await renderSchedaPdf(
        { ...scheda, matricola, numeroImpianto },
        {
          t: translatorFor('it'),
          fmt: viewHelpers('it'),
          generatedBy: 'Prova',
          fontDir,
          logo: null,
        },
      );
      const text = spawnSync('pdftotext', ['-layout', '-l', '1', '-', '-'], { input: pdf });
      if (text.error !== undefined) return; // poppler-utils missing here: the render itself is the check
      const righe = text.stdout.toString('utf8').split('\n');
      const riga = righe.find((r) => r.includes('MI-0012/2024'));
      assert.ok(riga?.includes(matricola), `one line: ${riga}`);
      assert.ok(riga?.includes(numeroImpianto), `the number on the same line: ${riga}`);
    });
  },
);
