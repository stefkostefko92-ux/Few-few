// The owner's October 2026 pass on the sheet: notes in the panel, argano and locks sections, the brake
// checks of an argano that stays and of a panel that stays, the stop of the argano, the tie rods with the
// ropes, a note for the shaft lighting, the
// alarm and the emergency call in one section, and every supplier form before its section's notes.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { moduliDopo } from '../src/ordini/form.js';
import { activeParts, fieldByKey, SEARCHABLE, SECTIONS } from '../src/schede/fields.js';
import { sezioniEscluseDi, stampaFromBody } from '../src/schede/stampa.js';
import { parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-17', matricola: '33871' };
const t = translatorFor('it');

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

const fieldsOf = (key: string) => SECTIONS.find((s) => s.key === key)!.fields.map((f) => f.key);

/** Both checks of the brake answered, with what kind, as a browser with JavaScript off sends them. */
const CHECKS = {
  kitControlloGanasce: 'si',
  kitControlloGanasceTipo: 'Microinterruttori Montanari',
  controlloQuadro: 'si',
  controlloQuadroTipo: 'Scheda UCM',
};

describe('the argano that stays and the panel that stays', () => {
  it('asks the shoe check kit of an argano that stays, with its kind on "Sì"', () => {
    const kept = parsedOrFail({ ...minimal, arganoPreventivo: 'no', ...CHECKS });
    assert.deepEqual(
      [kept.kitControlloGanasce, kept.kitControlloGanasceTipo],
      [true, 'Microinterruttori Montanari'],
    );
    const without = parsedOrFail({
      ...minimal,
      arganoPreventivo: 'no',
      ...CHECKS,
      kitControlloGanasce: 'no',
    });
    assert.deepEqual([without.kitControlloGanasce, without.kitControlloGanasceTipo], [false, null]);
    for (const body of [
      { arganoPreventivo: 'si' },
      {},
      { arganoPreventivo: 'no', tipoImpianto: 'IDRAULICO' },
    ]) {
      const data = parsedOrFail({ ...minimal, ...CHECKS, ...body });
      assert.deepEqual(
        [data.kitControlloGanasce, data.kitControlloGanasceTipo],
        [null, null],
        JSON.stringify(body),
      );
    }
  });

  it('asks the check on the panel only when the panel stays, with any argano (the owner, 24 October 2026)', () => {
    for (const arganoPreventivo of ['si', 'no', '']) {
      const data = parsedOrFail({
        ...minimal,
        quadroSostituire: 'no',
        arganoPreventivo,
        ...CHECKS,
      });
      assert.deepEqual(
        [data.quadroSostituire, data.controlloQuadro, data.controlloQuadroTipo],
        [false, true, 'Scheda UCM'],
        arganoPreventivo,
      );
    }
    for (const body of [
      { quadroSostituire: 'si' },
      {},
      { quadroSostituire: 'no', tipoImpianto: 'IDRAULICO' },
    ]) {
      const data = parsedOrFail({ ...minimal, ...CHECKS, ...body });
      assert.deepEqual(
        [data.controlloQuadro, data.controlloQuadroTipo],
        [null, null],
        JSON.stringify(body),
      );
    }
  });

  it('asks the stop of the argano always, never for a hydraulic lift', () => {
    for (const arganoPreventivo of ['si', 'no', '']) {
      const data = parsedOrFail({ ...minimal, arganoPreventivo, stopArgano: 'si' });
      assert.equal(data.stopArgano, true, arganoPreventivo);
    }
    assert.equal(parsedOrFail({ ...minimal, stopArgano: 'no' }).stopArgano, false);
    const hydraulic = parsedOrFail({ ...minimal, tipoImpianto: 'IDRAULICO', stopArgano: 'si' });
    assert.equal(hydraulic.stopArgano, null);
  });

  it('keeps a hidden kind out of the errors: what is not shown is not read', () => {
    const data = parsedOrFail({
      ...minimal,
      arganoPreventivo: 'no',
      kitControlloGanasce: 'no',
      kitControlloGanasceTipo: 'x'.repeat(500),
    });
    assert.equal(data.kitControlloGanasceTipo, null);
    const hidden = parsedOrFail({ ...minimal, ...CHECKS, controlloQuadroTipo: 'x'.repeat(500) });
    assert.equal(hidden.controlloQuadroTipo, null);
    const shown = parseScheda({
      ...minimal,
      quadroSostituire: 'no',
      ...CHECKS,
      controlloQuadroTipo: 'x'.repeat(121),
    });
    assert.equal(!shown.ok && shown.errors.controlloQuadroTipo, 'tooLong');
  });
});

describe('the notes and the tie rods', () => {
  it('keeps the notes of the panel, the argano and the locks, the tie rods and the lighting note', () => {
    const data = parsedOrFail({
      ...minimal,
      quadroNote: 'Quadro nel sottoscala.\nChiave in portineria.',
      arganoNote: 'Rumore sul cuscinetto lato volano.',
      serratureNote: 'Due serrature con contatto ossidato.',
      tirantiCabinaNumero: '4',
      tirantiCabinaTipo: 'Tiranti con molla M12',
      tirantiContrappesoNumero: '4',
      tirantiContrappesoTipo: 'Tiranti M10',
      luceVanoSostituire: 'si',
      luceVanoNote: 'Plafoniere al 2° e al 4° piano.',
    });
    assert.equal(data.quadroNote, 'Quadro nel sottoscala.\nChiave in portineria.');
    assert.equal(data.arganoNote, 'Rumore sul cuscinetto lato volano.');
    assert.equal(data.serratureNote, 'Due serrature con contatto ossidato.');
    assert.deepEqual(
      [
        data.tirantiCabinaNumero,
        data.tirantiCabinaTipo,
        data.tirantiContrappesoNumero,
        data.tirantiContrappesoTipo,
      ],
      [4, 'Tiranti con molla M12', 4, 'Tiranti M10'],
    );
    assert.equal(data.luceVanoNote, 'Plafoniere al 2° e al 4° piano.');
  });

  it('takes the lighting note only when the lighting is to replace', () => {
    for (const luceVanoSostituire of ['no', '']) {
      const data = parsedOrFail({ ...minimal, luceVanoSostituire, luceVanoNote: 'Plafoniere' });
      assert.equal(data.luceVanoNote, null, luceVanoSostituire);
    }
  });

  it('asks the notes of a section whatever else is answered, and finds them in the search', () => {
    const shown = activeParts(() => undefined).fields;
    for (const key of ['quadroNote', 'arganoNote', 'serratureNote']) {
      assert.ok(shown.has(key), key);
      assert.ok((SEARCHABLE as readonly string[]).includes(key), key);
    }
    for (const key of ['pattinoRetrattileTipo', 'tirantiCabinaTipo', 'luceVanoNote']) {
      assert.ok((SEARCHABLE as readonly string[]).includes(key), key);
    }
    assert.ok(!(SEARCHABLE as readonly string[]).includes('operatoreMarca'), 'off the sheet');
  });

  it('names the sections and the fields as the owner wrote them', () => {
    assert.equal(t('scheda.section.funi'), 'Funi e tiranti');
    assert.equal(t('scheda.section.allarme'), 'Allarme e telesoccorso');
    assert.equal(t('scheda.field.buonoLavoro'), 'Buono di lavoro');
    assert.equal(t('scheda.buonoRiferimento'), 'Buono di lavoro');
    assert.equal(t('scheda.field.pattinoRetrattileTipo'), 'Tipo di pattino retrattile');
    assert.equal(t('scheda.field.controlloQuadro'), 'Controllo su quadro manovra da installare?');
    assert.equal(t('scheda.field.kitControlloGanasce'), 'Kit controllo ganasce da installare?');
    assert.equal(t('scheda.field.stopArgano'), 'Stop argano da installare?');
    assert.equal(t('scheda.section.serrature'), 'Serrature, sospensioni o operatore');
    assert.equal(t('scheda.question.quadroSostituire'), 'Quadro di manovra da sostituire?');
  });
});

describe('the alarm and the emergency call', () => {
  it('are one section, the porter’s lodge last', () => {
    assert.deepEqual(fieldsOf('allarme'), [
      'telesoccorsoInstallare',
      'perifericaInstallare',
      'cornettaInstallare',
      'allarmePortineria',
      'displayPortineria',
    ]);
    assert.ok(!SECTIONS.some((s) => (s.key as string) === 'telesoccorso'));
  });

  it('take a print choice from a page opened before the merge without an error', () => {
    const old = { 'stampa-_': '1', stampa: ['quadro', 'allarme', 'telesoccorso', 'note'] };
    const parsed = sezioniEscluseDi(old);
    assert.ok(parsed.success);
    assert.ok(parsed.success && !parsed.data.includes('allarme') && parsed.data.includes('funi'));
    assert.deepEqual(stampaFromBody(old), ['quadro', 'allarme', 'note']);
    assert.equal(sezioniEscluseDi({ 'stampa-_': '1', stampa: 'nonEsiste' }).success, false);
  });
});

describe('the supplier forms in the form', () => {
  it('stand after their question and what follows from it, before the notes of the section', () => {
    const after = (key: string) =>
      Object.fromEntries(moduliDopo(SECTIONS.find((s) => s.key === key)!.fields));
    // AMI 100 after its type (Mono UCM or RTBS), the panel order after its question (30 October 2026).
    assert.deepEqual(after('quadro'), { ami100Tipo: ['ami100'], quadroOrdine: ['quadroOrdine'] });
    // The check on the panel follows the panel, not the argano (24 October 2026).
    assert.deepEqual(after('argano'), { kitControlloGanasceTipo: ['arganoPreventivo'] });
    // The 2SG sheet twice, each after its own question: the suspensions (automatic doors) and the
    // operator (automatic and semi-automatic doors) — one of them open at a time.
    assert.deepEqual(after('serrature'), {
      sospensioniNumero: ['sospensioni'],
      operatore: ['operatore'],
    });
    assert.deepEqual(after('note'), {});
    for (const key of ['quadro', 'argano', 'serrature']) {
      assert.equal(fieldsOf(key).at(-1), `${key}Note`, key);
      assert.equal(fieldByKey(`${key}Note`)?.kind, 'textarea');
    }
  });
});
