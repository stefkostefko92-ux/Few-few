// The values the technician confirmed put into a form (round 50, src/lib/schizzi/applica.ts): each through the form's
// own helpers and out of the values still to enter — the stops first by their number, the entrances with what they
// bring, a machine room added, a panel placed by hand switching the software's place off —, the rest refused with why
// (no such field, wrong value, a stop the floors have not got, not asked with these choices, no room, a governor or a
// support not whole); the forms' schemas still read the result; what the form holds is shown only once entered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankLift, filled, missingOf, type LiftDraft } from '@/lib/lift/blank';
import { dalComposto } from '@/lib/lift/progetto';
import { progettoInputsReadSchema } from '@/lib/lift-input';
import { surveyDraftSchema } from '@/lib/draft-input';
import { blankSurvey } from '@/lib/room/survey';
import { applicaLocale, applicaVano, valoreLocale, valoreVano, type Valore } from '@/lib/schizzi/applica';

/** A new one form whose calculation has its machine above (topDefl) and its layout entered. */
function nuovo(): LiftDraft {
  const d = blankLift();
  return { ...d, blank: filled(d.blank, ['layout', 'r', 'v', 'Q', 'Qkg']) };
}
const ids = (vs: readonly Valore[]): string[] => vs.map((v) => v.id);

test('vano: le misure confermate entrano come digitate — prima il numero di fermate, poi le loro quote e porte', () => {
  const valori: Valore[] = [
    { id: 'rise.0', value: 3200 }, { id: 'rise.1', value: 3000 }, { id: 'fdoor.0', value: 'A' }, { id: 'fdoor.1', value: 'AB' }, { id: 'fdoor.2', value: 'B' },
    { id: 'main', value: 1 }, { id: 'W', value: 1600 }, { id: 'D', value: 1750 }, { id: 'wall', value: 250 }, { id: 'door', value: 'T2' },
    { id: 'doorWidth', value: 800 }, { id: 'doorHeight', value: 2000 }, { id: 'pit', value: 1400 }, { id: 'headroom', value: 3600 },
    { id: 'floors', value: 3 }, { id: 'entrances', value: 'opposite' },
  ];
  const r = applicaVano(nuovo(), valori);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.applied, ids(valori), 'every one, in the order given');
  const S = r.draft.inputs.shaft, V = S.vertical;
  assert.deepEqual([S.W, S.D, S.wall, S.door, S.doorWidth, S.doorHeight, S.entrances], [1600, 1750, 250, 'T2', 800, 2000, 'opposite']);
  assert.deepEqual(V.floors.map((f) => [f.rise, f.door]), [[3200, 'A'], [3000, 'AB'], [0, 'B']]);
  assert.deepEqual([V.main, V.pit, V.headroom], [1, 1400, 3600]);
  for (const k of ['W', 'D', 'floors', 'rise.0', 'rise.1', 'fdoor.0', 'fdoor.2', 'main', 'entrances', 'pit']) assert.ok(!r.draft.blank.includes(k as never), `${k} entered`);
  // with two opposite entrances the counterweight's side is not asked: what is left is the accessibility and the room
  assert.deepEqual(missingOf(r.draft).filter((k) => !k.startsWith('room.')), ['access']);
  // the Progetto's draft still reads
  assert.ok(progettoInputsReadSchema.safeParse(dalComposto(r.draft, undefined).progetto).success);
});

test('vano: ciò che il modulo non può prendere non entra e dice perché', () => {
  const r = applicaVano(nuovo(), [
    { id: 'floors', value: 2 }, { id: 'rise.0', value: 3000 }, { id: 'rise.1', value: 3000 }, { id: 'fdoor.0', value: 'A' }, { id: 'main', value: 2 },
    { id: 'side2', value: 'left' }, { id: 'Q', value: 630 }, { id: 'pit', value: 50 }, { id: 'door', value: 'C4' }, { id: 'W', value: '1600' },
  ]);
  assert.deepEqual(r.applied, ['floors', 'rise.0']);
  assert.deepEqual(r.refused.map((x) => [x.id, x.code]), [
    ['rise.1', 'fermate'], ['fdoor.0', 'nonPertinente'], ['main', 'fermate'], ['side2', 'nonPertinente'], ['Q', 'campo'], ['pit', 'valore'], ['door', 'valore'], ['W', 'valore'],
  ]);
  assert.ok(r.draft.blank.includes('main'), 'the main stop still to enter');
  // the counterweight's side with two entrances is the software's
  const two = applicaVano(nuovo(), [{ id: 'entrances', value: 'adjacent' }, { id: 'side2', value: 'left' }, { id: 'cw', value: 'rear' }]);
  assert.deepEqual([two.applied, two.refused], [['entrances', 'side2'], [{ id: 'cw', code: 'nonPertinente' }]]);
  assert.equal(two.draft.inputs.shaft.side2, 'left');
});

test('vano: il locale sopra il vano — aggiunto se manca, il quadro messo a mano toglie il posto del software', () => {
  const start = nuovo(), none: LiftDraft = { ...start, inputs: { ...start.inputs, shaft: { ...start.inputs.shaft, room: null } }, blank: start.blank.filter((k) => !k.startsWith('room.')) };
  const r = applicaVano(none, [{ id: 'room.W', value: 3200 }, { id: 'room.ridge', value: 3400 }, { id: 'room.panelWall', value: 'rear' }]);
  assert.deepEqual(r.applied, ['room.W', 'room.ridge', 'room.panelWall']);
  const R = r.draft.inputs.shaft.room;
  assert.ok(R);
  assert.deepEqual([R.W, R.ridge, R.panelWall], [3200, 3400, 'rear']);
  assert.equal(r.draft.inputs.auto.panel, false, 'the panel placed on the sketch');
  const missing = missingOf(r.draft);
  assert.ok(missing.includes('room.panelAt') && missing.includes('room.D') && !missing.includes('room.W') && !missing.includes('room.panelWall'), missing.join());
  // a machine below without a pulley room: no room to put them in
  const below: LiftDraft = { ...none, inputs: { ...none.inputs, calc: { ...none.inputs.calc, layout: 'bottom' } } };
  assert.deepEqual(applicaVano(below, [{ id: 'room.W', value: 3200 }]).refused, [{ id: 'room.W', code: 'nessunLocale' }]);
});

test('vano: il valore del modulo si mostra solo se inserito e chiesto', () => {
  const d = nuovo();
  assert.equal(valoreVano(d, 'W'), null, 'still to enter');
  const r = applicaVano(d, [{ id: 'W', value: 1600 }, { id: 'entrances', value: 'one' }, { id: 'floors', value: 4 }, { id: 'rise.2', value: 2900 }]);
  assert.deepEqual([valoreVano(r.draft, 'W'), valoreVano(r.draft, 'floors'), valoreVano(r.draft, 'rise.2'), valoreVano(r.draft, 'rise.0')], [1600, 4, 2900, null]);
  assert.equal(valoreVano(r.draft, 'side2'), null, 'one entrance: no second side');
  assert.equal(valoreVano(r.draft, 'room.panelAt'), null, 'the software places the panel');
  assert.equal(valoreVano(r.draft, 'Q'), null, 'not a value of the drawing');
});

test('locale: le misure del rilievo entrano e escono da quelle da inserire; limitatore e basamento solo se completi', () => {
  const d = blankSurvey(600);
  const r = applicaLocale(d, [
    { id: 'room.W', value: 3000 }, { id: 'room.doorWall', value: 'front' }, { id: 'room.ridge', value: 3200 }, { id: 'shaft.W', value: 1600 }, { id: 'car.x', value: 800 },
    { id: 'cw.y', value: 1175 }, { id: 'governor.x', value: 600 }, { id: 'governor.ropes', value: false }, { id: 'existingSupport.keep', value: true },
    { id: 'shaft.D', value: 20 }, { id: 'W', value: 1600 },
  ]);
  assert.deepEqual(r.applied, ['room.W', 'room.doorWall', 'room.ridge', 'shaft.W', 'car.x', 'cw.y']);
  assert.deepEqual(r.refused.map((x) => [x.id, x.code]), [
    ['governor.x', 'incompleto'], ['governor.ropes', 'incompleto'], ['existingSupport.keep', 'incompleto'], ['shaft.D', 'valore'], ['W', 'campo'],
  ]);
  const s = r.draft.survey;
  assert.deepEqual([s.room.W, s.room.doorWall, s.room.ridge, s.shaft.W, s.car.x, s.cw.y], [3000, 'front', 3200, 1600, 800, 1175]);
  for (const k of ['room.W', 'room.doorWall', 'shaft.W', 'car.x', 'cw.y'] as const) assert.ok(!r.draft.blank.includes(k), k);
  assert.ok(r.draft.blank.includes('room.D'));
  assert.ok(surveyDraftSchema.safeParse(r.draft).success, 'the survey\'s draft still reads');
  // the governor's whole footprint makes it (its ropes through the slab unless said), a support's kind makes it
  const g = applicaLocale(r.draft, [
    { id: 'governor.x', value: 600 }, { id: 'governor.y', value: 700 }, { id: 'governor.W', value: 400 }, { id: 'governor.D', value: 300 }, { id: 'existingSupport.kind', value: 'beams' },
  ]);
  assert.deepEqual(g.refused, []);
  assert.deepEqual(g.draft.survey.governor, { x: 600, y: 700, W: 400, D: 300, ropes: true });
  assert.deepEqual(g.draft.survey.existingSupport, { kind: 'beams', keep: false });
  const h = applicaLocale(g.draft, [{ id: 'governor.ropes', value: false }, { id: 'existingSupport.keep', value: true }, { id: 'governor.W', value: 450 }]);
  assert.deepEqual([h.draft.survey.governor?.ropes, h.draft.survey.governor?.W, h.draft.survey.existingSupport?.keep], [false, 450, true]);
  assert.deepEqual([valoreLocale(h.draft, 'governor.W'), valoreLocale(h.draft, 'existingSupport.kind'), valoreLocale(h.draft, 'room.D'), valoreLocale(h.draft, 'room.W')], [450, 'beams', null, 3000]);
});
