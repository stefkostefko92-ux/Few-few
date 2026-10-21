// Rilievi — the owner's October 2026 pass on the sheet, ported from rilievi's tests/note.test.ts (commit 988f3cf37):
// notes in the panel, argano and locks sections, the brake checks of an argano that stays, the tie rods with the ropes, a
// note for the shaft lighting, the alarm and the emergency call in one section, and every supplier form before its
// section's notes (ordini/form.ts moduliDopo). Not ported: rilievi's tolerance for the merged section «telesoccorso» in
// the print choice (LiftPilot never had that section — the owner's decision, round 49: such a key is refused).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeParts, fieldByKey, SEARCHABLE, SECTIONS } from '@/lib/rilievi/fields';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { moduliDopo } from '@/lib/rilievi/ordini/form';
import { searchTextOf } from '@/lib/rilievi/search';
import { sezioniEscluseDi, stampaFromBody } from '@/lib/rilievi/stampa';
import { parseScheda } from '@/lib/rilievi/validation';

const minimal = { data: '2026-10-17', matricola: '33871' };
const t = rilieviTranslator();

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

const fieldsOf = (key: string) => SECTIONS.find((s) => s.key === key)?.fields.map((f) => f.key) ?? [];

/** Both checks of the brake answered, with what kind, as a browser with JavaScript off sends them. */
const CHECKS = {
  kitControlloGanasce: 'si',
  kitControlloGanasceTipo: 'Microinterruttori Montanari',
  controlloQuadro: 'si',
  controlloQuadroTipo: 'Scheda UCM',
};

describe('the argano that stays', () => {
  it('asks the shoe check kit and the check on the panel, each with its kind on «Sì»', () => {
    const kept = parsedOrFail({ ...minimal, arganoPreventivo: 'no', ...CHECKS });
    assert.deepEqual(
      [kept.kitControlloGanasce, kept.kitControlloGanasceTipo, kept.controlloQuadro, kept.controlloQuadroTipo],
      [true, 'Microinterruttori Montanari', true, 'Scheda UCM'],
    );
    const without = parsedOrFail({ ...minimal, arganoPreventivo: 'no', ...CHECKS, kitControlloGanasce: 'no', controlloQuadro: 'no' });
    assert.deepEqual([without.kitControlloGanasce, without.kitControlloGanasceTipo], [false, null]);
    assert.deepEqual([without.controlloQuadro, without.controlloQuadroTipo], [false, null]);
  });

  it('drops the checks with a new argano, an unanswered question and a hydraulic lift', () => {
    for (const body of [{ arganoPreventivo: 'si' }, {}, { arganoPreventivo: 'no', tipoImpianto: 'IDRAULICO' }]) {
      const data = parsedOrFail({ ...minimal, ...CHECKS, ...body });
      for (const key of Object.keys(CHECKS)) assert.equal(data[key as keyof typeof data], null, `${JSON.stringify(body)} ${key}`);
    }
  });

  it('keeps a hidden kind out of the errors: what is not shown is not read', () => {
    const data = parsedOrFail({ ...minimal, arganoPreventivo: 'no', kitControlloGanasce: 'no', kitControlloGanasceTipo: 'x'.repeat(500) });
    assert.equal(data.kitControlloGanasceTipo, null);
    const shown = parseScheda({ ...minimal, arganoPreventivo: 'no', ...CHECKS, controlloQuadroTipo: 'x'.repeat(121) });
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
      [data.tirantiCabinaNumero, data.tirantiCabinaTipo, data.tirantiContrappesoNumero, data.tirantiContrappesoTipo],
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
    for (const key of ['pattinoRetrattileTipo', 'tirantiCabinaTipo', 'luceVanoNote']) assert.ok((SEARCHABLE as readonly string[]).includes(key), key);
    assert.ok(!(SEARCHABLE as readonly string[]).includes('operatoreMarca'), 'off the sheet');
    // the search text in SEARCHABLE's order: the identifiers first, then the new notes and kinds where they stand
    const text = searchTextOf({ numeroImpianto: '104552', quadroNote: 'Chiave in portineria', arganoTipo: 'Montanari M83', centralinaMarca: 'GMV 3010', luceVanoNote: 'Plafoniere' });
    assert.equal(text, '104552 chiave in portineria montanari m83 gmv 3010 plafoniere');
  });

  it('names the sections and the fields as the owner wrote them', () => {
    assert.equal(t('scheda.section.funi'), 'Funi e tiranti');
    assert.equal(t('scheda.section.allarme'), 'Allarme e telesoccorso');
    assert.equal(t('scheda.section.centralina'), 'Centralina');
    assert.equal(t('scheda.field.buonoLavoro'), 'Buono di lavoro');
    assert.equal(t('scheda.buonoRiferimento'), 'Buono di lavoro');
    assert.equal(t('scheda.field.pattinoRetrattileTipo'), 'Tipo di pattino retrattile');
    assert.equal(t('scheda.field.controlloQuadro'), 'Controllo su quadro manovra');
    assert.equal(t('scheda.question.centralinaDaFare'), 'Centralina da sostituire?');
    assert.equal(t('riepilogo.sezioniHint'), 'Togli la spunta alle sezioni da lasciare fuori dal foglio stampato. L’intestazione con indirizzo, matricola e n° impianto c’è sempre.', 'the typographic apostrophe');
  });
});

describe('the alarm and the emergency call', () => {
  it('are one section, the porter’s lodge last', () => {
    assert.deepEqual(fieldsOf('allarme'), ['telesoccorsoInstallare', 'perifericaInstallare', 'cornettaInstallare', 'allarmePortineria', 'displayPortineria']);
    assert.ok(!SECTIONS.some((s) => (s.key as string) === 'telesoccorso'));
  });

  it('refuse in the print choice a section the sheet does not have, «telesoccorso» included', () => {
    const merged = { 'stampa-_': '1', stampa: ['quadro', 'allarme', 'telesoccorso', 'note'] };
    assert.equal(sezioniEscluseDi(merged).success, false);
    assert.equal(sezioniEscluseDi({ 'stampa-_': '1', stampa: 'nonEsiste' }).success, false);
    const result = parseScheda({ ...minimal, ...merged });
    assert.equal(!result.ok && result.errors.stampa, 'option');
    assert.deepEqual(stampaFromBody(merged), ['quadro', 'allarme', 'note'], 'the form comes back with the known ones');
  });
});

describe('the supplier forms in the form', () => {
  it('stand after their question and what follows from it, before the notes of the section', () => {
    const after = (key: string) => Object.fromEntries(moduliDopo(SECTIONS.find((s) => s.key === key)?.fields ?? []));
    assert.deepEqual(after('quadro'), { quadroOrdine: ['ordineQuadro'] });
    assert.deepEqual(after('argano'), { controlloQuadroTipo: ['preventivoArgano'] });
    assert.deepEqual(after('serrature'), { sospensioniNumero: ['ordineSospensioni'] });
    assert.deepEqual(after('note'), {});
    for (const key of ['quadro', 'argano', 'serrature']) {
      assert.equal(fieldsOf(key).at(-1), `${key}Note`, key);
      assert.equal(fieldByKey(`${key}Note`)?.kind, 'textarea');
    }
  });
});
