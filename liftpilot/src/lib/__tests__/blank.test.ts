// A brand new project starts empty (src/lib/lift/blank.ts, src/lib/calc-blank.ts, src/lib/room/survey.ts): what is
// still to enter, what a choice brings into the form, the floors as they are added and taken off, the existing
// installation of a replacement, the drafts as the server keeps them, and what a whole project carries over from the
// installation (src/lib/lift/carry.ts). Once filled, a blank start gives the design the example gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { levels, type ShaftInputs, type VerticalInputs } from '@/shaft';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { deriveLift, newLift } from '@/lib/lift';
import { LIFT_STANDARD, isLiftStandard } from '@/lib/lift/defaults';
import {
  ROOM_FIELDS, blankLift, emptied, enteredBy, entrancesTo, existingMissing, filled, floorRemoved, floorsTo, layoutTo, missingOf, relevant, roomAdded,
  type BlankKey, type LiftDraft,
} from '@/lib/lift/blank';
import { carriedOver } from '@/lib/lift/carry';
import { panelEntered } from '@/lib/lift/panel-form';
import { blankCalc, calcMissing, isStandard, plantReady } from '@/lib/calc-blank';
import { readInputs } from '@/calc/index';
import { calcDraftSchema, draftScopeSchema, liftDraftSchema, surveyDraftSchema } from '@/lib/draft-input';
import { SURVEY_FIELDS, blankSurvey, startSurvey } from '../room/survey';

/** A change of the shaft as the form makes it: what the patch sets is entered. */
const shaft = (d: LiftDraft, patch: Partial<ShaftInputs>, edit?: (b: readonly BlankKey[]) => BlankKey[]): LiftDraft =>
  ({ inputs: { ...d.inputs, shaft: { ...d.inputs.shaft, ...patch } }, blank: filled(edit ? edit(d.blank) : d.blank, enteredBy(patch)) });
const vertical = (d: LiftDraft, patch: Partial<VerticalInputs>, keys: readonly BlankKey[]): LiftDraft =>
  shaft(d, { vertical: { ...d.inputs.shaft.vertical, ...patch } }, (b) => filled(b, keys));
const floors = (d: LiftDraft, r: { vertical: VerticalInputs; blank: BlankKey[] }): LiftDraft => ({ inputs: { ...d.inputs, shaft: { ...d.inputs.shaft, vertical: r.vertical } }, blank: r.blank });
const calc = (d: LiftDraft, patch: FormValues): LiftDraft => {
  const roping = 'r' in patch ? filled(d.blank, ['r']) : d.blank;
  return { inputs: { ...d.inputs, calc: { ...d.inputs.calc, ...patch } }, blank: typeof patch.layout === 'string' ? layoutTo(String(d.inputs.calc.layout), roping, patch.layout) : roping };
};
const roomKeys = ROOM_FIELDS.map((k): BlankKey => `room.${k}`);

/** The example's installation entered field by field on a blank start. */
function filledIn(): LiftDraft {
  let d = shaft(blankLift(), { W: 1600, D: 1750 });
  d = shaft(d, { Q: null });
  d = shaft(d, { entrances: 'one' }, (b) => entrancesTo(d.inputs.shaft, b, 'one'));
  d = shaft(d, { door: 'T2', doorWidth: 800, doorHeight: 2000, cw: 'rear', wall: 200, access: 'dm236_existing' });
  d = vertical(d, { v: 0.63, pit: 1400, headroom: 3700 }, ['v', 'pit', 'headroom']);
  d = floors(d, floorsTo(d.inputs.shaft.vertical, d.blank, 5, false));
  d = vertical(d, { floors: d.inputs.shaft.vertical.floors.map((f, i) => ({ ...f, rise: i < 4 ? 3000 : 0 })), main: 0 }, ['rise.0', 'rise.1', 'rise.2', 'rise.3', 'main']);
  d = calc(d, { r: '1' });
  d = calc(d, { layout: 'topDefl' });
  return { ...d, blank: filled(d.blank, roomKeys) };
}

test('progetto nuovo: vuoto, nulla da calcolare finché mancano i dati del progetto', () => {
  const d = blankLift();
  assert.deepEqual(missingOf(d), ['W', 'D', 'Q', 'entrances', 'door', 'doorWidth', 'doorHeight', 'cw', 'wall', 'access', 'v', 'pit', 'headroom', 'floors', 'r', 'layout']);
  // the machines' data empty, the software's standard assumptions kept (and marked as such)
  for (const id of ['n_D', 'n_i', 'n_Pn', 'n_brakeNm', 'n_n', 'n_d', 'o_D', 'o_i', 'o_n', 'o_d', 'o_mass']) assert.equal(d.inputs.calc[id], '', id);
  for (const id of Object.keys(LIFT_STANDARD)) assert.ok(isLiftStandard(d.inputs.calc, id), id);
  assert.equal(isLiftStandard({ ...d.inputs.calc, k: 0.45 }, 'k'), false);
  assert.ok(liftDraftSchema.safeParse(d).success, 'the draft keeps it');
  assert.equal(liftDraftSchema.safeParse({ ...d, blank: [...d.blank, 'nonsense'] }).success, false);
});

test('una scelta porta i suoi dati da inserire: portata data, secondo accesso, contrappeso, locale, macchina in basso', () => {
  let d = shaft(blankLift(), { Q: 630 });
  assert.ok(relevant('Qkg', d) && missingOf(d).includes('Qkg'), 'the given load');
  d = shaft(d, { Q: 630 }, (b) => filled(b, ['Qkg']));
  assert.equal(missingOf(d).includes('Qkg'), false);
  d = shaft(d, { entrances: 'adjacent' }, (b) => entrancesTo(d.inputs.shaft, b, 'adjacent'));
  assert.ok(missingOf(d).includes('side2'));
  assert.equal(relevant('cw', d), false, 'two entrances place the counterweight');
  d = calc(d, { layout: 'top' });
  // the panel's wall and place are the software's (registry locale.quadro.posto): to enter only when switched to entered
  const placed: readonly BlankKey[] = ['room.panelWall', 'room.panelAt'];
  assert.ok(roomKeys.every((k) => missingOf(d).includes(k) !== placed.includes(k)), 'a machine above: its room, the panel placed');
  const byHand: LiftDraft = { ...d, inputs: { ...d.inputs, auto: { ...d.inputs.auto, panel: false } } };
  assert.ok(roomKeys.every((k) => missingOf(byHand).includes(k)), 'the panel by hand: its wall and place too');
  assert.deepEqual(panelEntered(byHand, { panelWall: 'left', panelAt: 450 }).blank.filter((k) => placed.includes(k)), [], 'entered where it was');
  d = calc(d, { layout: 'bottom' });
  assert.ok(missingOf(d).includes('bottom') && !missingOf(d).some((k) => k.startsWith('room.')), 'a machine below: its scheme, no room');
  // a room added again starts empty
  assert.deepEqual(roomAdded(filled(d.blank, roomKeys)).filter((k) => k.startsWith('room.')), roomKeys);
  assert.deepEqual(layoutTo('bottom', filled(d.blank, ['bottom']), 'bottom'), filled(d.blank, ['bottom', 'layout']));
});

test('fermate: righe dal numero, interpiani e accessi da inserire; aggiunte, tolte, la principale', () => {
  let d = shaft(blankLift(), { entrances: 'opposite' }, (b) => entrancesTo(blankLift().inputs.shaft, b, 'opposite'));
  d = floors(d, floorsTo(d.inputs.shaft.vertical, d.blank, 4, true));
  assert.deepEqual(d.inputs.shaft.vertical.floors.map((f) => f.label), ['0', '1', '2', '3']);
  assert.deepEqual(missingOf(d).filter((k) => /rise|fdoor|main/.test(k)), ['rise.0', 'rise.1', 'rise.2', 'fdoor.0', 'fdoor.1', 'fdoor.2', 'fdoor.3', 'main']);
  d = vertical(d, { floors: d.inputs.shaft.vertical.floors.map((f, i) => ({ ...f, rise: [3000, 3200, 2900, 0][i] ?? 0 })) }, ['rise.0', 'rise.1', 'rise.2']);
  // one more stop: its interval and its door to enter, the others kept
  const more = floors(d, floorsTo(d.inputs.shaft.vertical, d.blank, 5, true));
  assert.deepEqual(more.blank.filter((k) => k.startsWith('rise.')), ['rise.3']);
  assert.ok(more.blank.includes('fdoor.4') && more.inputs.shaft.vertical.floors[4]?.label === '4');
  // a stop between two others taken off: the others stay at their levels
  const before = levels(d.inputs.shaft.vertical.floors), less = floorRemoved(d.inputs.shaft.vertical, d.blank, 1);
  assert.deepEqual(levels(less.vertical.floors), [before[0], before[2], before[3]]);
  assert.equal(less.blank.includes('rise.0'), false);
  // …still to enter when either rise was
  assert.ok(floorRemoved(d.inputs.shaft.vertical, emptied(d.blank, ['rise.1']), 1).blank.includes('rise.0'));
  // the main floor taken off: to choose again; the top one: the new top asks no rise
  const main = filled(d.blank, ['main']), top = floorRemoved({ ...d.inputs.shaft.vertical, main: 3 }, main, 3);
  assert.ok(top.blank.includes('main') && top.vertical.floors[2]?.rise === 0 && !top.blank.includes('rise.2'));
  // one entrance again: the doors are no longer asked; back to two, each to choose again
  const one = shaft(d, { entrances: 'one' }, (b) => entrancesTo(d.inputs.shaft, b, 'one'));
  assert.equal(missingOf(one).some((k) => k.startsWith('fdoor.')), false);
  const two = shaft(one, { entrances: 'opposite' }, (b) => entrancesTo(one.inputs.shaft, b, 'opposite'));
  assert.ok(missingOf(two).includes('fdoor.0'));
});

test('sostituzione nel progetto: funi in opera e macchina esistente da inserire', () => {
  const V = blankLift().inputs.calc;
  assert.deepEqual(existingMissing(V), [], 'a new lift has none');
  assert.deepEqual(existingMissing({ ...V, context: 'repl' }), ['n_n', 'n_d', 'n_Fmin', 'n_qf']);
  const compared = existingMissing({ ...V, context: 'repl', compare: true });
  assert.ok(compared.includes('o_D') && compared.includes('o_n') && !compared.includes('n_n') && !compared.includes('o_mass'), compared.join());
  assert.deepEqual(existingMissing({ ...PRESETS.C }), [], 'entered');
});

test('progetto nuovo compilato: lo stesso progetto dell’esempio, salvabile', () => {
  const d = filledIn();
  assert.deepEqual(missingOf(d), []);
  assert.deepEqual(existingMissing(d.inputs.calc), []);
  const dv = deriveLift(d.inputs), ex = deriveLift({ ...newLift(), shaft: d.inputs.shaft });
  assert.equal(dv.noProposal, false);
  assert.deepEqual([...dv.analysis.ctx.bad, ...dv.issues], []);
  assert.ok(shaftInputsSchema.safeParse(dv.shaft).success);
  for (const id of ['n_D', 'n_i', 'n_Pn', 'n_brakeNm', 'n_n', 'n_d', 'L0', 'dx', 'h', 'P']) assert.equal(dv.values[id], ex.values[id], id);
  assert.deepEqual(dv.layout.checks, ex.layout.checks);
});

test('calcolatore della sostituzione: vuoto, prima l’impianto poi la macchina nuova', () => {
  const V = blankCalc(), missing = calcMissing(V, readInputs(V).bad);
  const firstNew = missing.findIndex((id) => id.startsWith('n_'));
  assert.ok(missing.includes('r') && missing.includes('Q') && missing.includes('o_D') && firstNew > 0);
  assert.ok(missing.slice(firstNew).every((id) => id.startsWith('n_')), 'the installation before the new machine');
  assert.equal(plantReady(missing), false);
  const C = { ...PRESETS.C };
  assert.deepEqual(calcMissing(C, readInputs(C).bad), []);
  // an empty roping reads as 1:1 without being flagged: only the list of what is missing stops the save (and the server)
  const noRoping = { ...C, r: '' };
  assert.deepEqual([readInputs(noRoping).bad, calcMissing(noRoping, readInputs(noRoping).bad)], [[], ['r']]);
  assert.ok(isStandard(V, 'aDesign') && !isStandard({ ...V, aDesign: 0.6 }, 'aDesign'));
  // what the proposal sizes the new machine with is the software's standard, marked as such — never a hidden fallback
  for (const id of ['n_etaD', 'n_nm', 'n_Jm', 'n_Js', 'n_gamma', 'n_poles', 'n_fn']) assert.ok(isStandard(V, id), id);
  assert.ok(calcDraftSchema.safeParse({ values: V, collaudo: null }).success);
});

test('rilievo del locale: ogni misura da inserire; bozze e loro ambiti', () => {
  const s = blankSurvey(600);
  assert.deepEqual(s.blank, [...SURVEY_FIELDS]);
  assert.equal(s.survey.room.ridge, 0);
  assert.deepEqual({ car: s.survey.car, cw: s.survey.cw }, { car: startSurvey(600).car, cw: startSurvey(600).cw });
  assert.ok(surveyDraftSchema.safeParse(s).success);
  assert.equal(surveyDraftSchema.safeParse({ ...s, blank: ['room.ridge'] }).success, false);
  for (const ok of ['lift', 'calc', 'room:cm1abc']) assert.ok(draftScopeSchema.safeParse(ok).success, ok);
  for (const no of ['room:', 'room:../x', 'shaft', 'room:a b']) assert.equal(draftScopeSchema.safeParse(no).success, false, no);
});

test('sostituzione → progetto completo: quello che c’è entra come inserito, il resto da inserire', () => {
  assert.deepEqual(carriedOver({ shaft: null, calc: null, survey: startSurvey(600) }), blankLift(), 'a survey alone is no project');
  const C = { ...PRESETS.C }, fromCalc = carriedOver({ shaft: null, calc: { values: C, collaudo: null }, survey: null });
  for (const k of ['v', 'Q', 'Qkg', 'r', 'layout'] as const) assert.equal(fromCalc.blank.includes(k), false, k);
  for (const k of ['W', 'D', 'entrances', 'door', 'pit', 'headroom', 'floors', 'access'] as const) assert.ok(fromCalc.blank.includes(k), k);
  assert.equal(fromCalc.inputs.calc, C);
  assert.deepEqual(fromCalc.inputs.auto, { P: false, machine: false, L0: false, dx: false, Hv: false });
  assert.equal(fromCalc.inputs.shaft.Q, 630);
  // with the survey: the shaft under the room, the room, and with a direct pull the counterweight's side at its drop
  const s = { ...startSurvey(600), car: { x: 1000, y: 800 }, cw: { x: 400, y: 800 } };
  const both = carriedOver({ shaft: null, calc: { values: C, collaudo: { norma: '10411-1', parti: ['machine'] } }, survey: s });
  for (const k of ['W', 'D', 'wall', 'cw', ...roomKeys] as const) assert.equal(both.blank.includes(k), false, k);
  assert.equal(both.inputs.shaft.cw, 'left');
  assert.deepEqual(both.inputs.collaudo, { norma: '10411-1', parti: ['machine'] });
  // an earlier shaft design: the shaft as entered, the calculation's choices still to make
  const design = carriedOver({ shaft: newLift().shaft, calc: null, survey: s });
  assert.deepEqual(missingOf(design), ['r', 'layout']);
  assert.equal(design.inputs.shaft.W, newLift().shaft.W);
});
