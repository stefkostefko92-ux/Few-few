// The steps of «Calcolo argano» and «Progetto» (round 52): every value still to enter belongs to one step, the step's link
// goes to the first of them, the step now is the first one still needing something, and a section not on screen is no step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInputs } from '@/calc/index';
import { FIELD_IDS } from '@/components/calc/fields';
import { blankCalc, calcMissing, REGOLAZIONE_ID } from '@/lib/calc-blank';
import { blankLift, missingOf, SHAFT_FIELDS, ROOM_FIELDS } from '@/lib/lift/blank';
import { passiDa, passoOra } from '@/lib/passi';
import { passiCalcolo, passiProgetto, passoId } from '@/lib/passi-moduli';

const label = (k: string): string => k;
const TUTTO = { tipo: true, esistente: true, resta: false, servizio: true };
const total = (p: readonly { manca: number | null }[]): number => p.reduce((s, x) => s + (x.manca ?? 0), 0);

test('passi: each value to its first step, the link to the first of them, the step now', () => {
  const p = passiDa([{ id: 'a', label: 'A', di: (id) => id.startsWith('a') }, { id: 'b', label: 'B', di: (id) => id.startsWith('a') || id === 'b1' }, { id: 'c', label: 'C' }],
    ['b1', 'a2', 'a1', 'x']);
  assert.deepEqual(p.map((s) => [s.n, s.manca, s.primo]), [[1, 2, 'a2'], [2, 1, 'b1'], [3, null, null]]);
  assert.equal(passoOra(p)?.id, 'a');
  assert.equal(passoOra(passiDa([{ id: 'a', label: 'A', di: () => true }, { id: 'c', label: 'C' }], [])), null, 'nothing missing: no step now');
});

test('passi: «Calcolo argano» — every field of the form and every answer has its step', () => {
  const checks = new Set(['compare', 'keepD', 'keepRopes', 'n_model']);
  const all = [...FIELD_IDS.filter((id) => !checks.has(id)), 'intervento', 'parte-machine', 'parte-speed', REGOLAZIONE_ID];
  const p = passiCalcolo(all, TUTTO, label);
  assert.equal(total(p), all.length, 'none left out');
  assert.deepEqual(p.map((s) => s.id), ['tipo', 'collaudo', 'impianto', 'disposizione', 'esistente', 'nuovo', 'funi', 'funi10411', 'servizio', 'esito'].map(passoId));
  assert.equal(p.find((s) => s.id === passoId('tipo'))?.manca, 4);
  assert.equal(p.find((s) => s.id === passoId('collaudo'))?.manca, null, 'the test: nothing counted there');
  // a new calculation: the type first, then the installation's fields in the form's order
  const V = blankCalc(), missing = calcMissing(V, readInputs(V).bad, null);
  const start = passiCalcolo(missing, { tipo: false, esistente: true, resta: false, servizio: false }, label);
  assert.equal(total(start), missing.length);
  assert.equal(passoOra(start)?.id, passoId('tipo'));
  assert.equal(start.find((s) => s.id === passoId('impianto'))?.primo, missing.find((id) => id !== 'intervento'));
});

test('passi: «Calcolo argano» — a section not on screen is no step, the numbers stay in a row', () => {
  const p = passiCalcolo([], { tipo: false, esistente: false, resta: false, servizio: false }, label);
  assert.deepEqual(p.map((s) => s.id), ['tipo', 'impianto', 'disposizione', 'nuovo', 'funi', 'esito'].map(passoId));
  assert.deepEqual(p.map((s) => s.n), [1, 2, 3, 4, 5, 6]);
  const resta = passiCalcolo([], { tipo: true, esistente: true, resta: true, servizio: false }, label);
  assert.ok(!resta.some((s) => s.id === passoId('esistente')), 'the machine kept: its group is the machine’s');
  assert.ok(resta.some((s) => s.id === passoId('funi10411')));
});

test('passi: «Progetto» — every value of the drawing has its step', () => {
  const keys = [...SHAFT_FIELDS, 'v', 'pit', 'headroom', 'floors', 'main', 'rise.0', 'rise.12', 'fdoor.3', ...ROOM_FIELDS.map((k) => `room.${k}`), 'bottom', 'r', 'layout', 'n_D', 'o_qf'];
  const p = passiProgetto(keys, { locale: true }, label);
  assert.equal(total(p), keys.length, 'none left out');
  assert.deepEqual(p.map((s) => [s.id, s.manca]), [['base', 4], ['vano', SHAFT_FIELDS.length], ['piani', 8], ['locale', ROOM_FIELDS.length], ['funi', 1], ['verifiche', null]]
    .map(([k, n]) => [passoId(String(k)), n]));
  const d = blankLift(), missing = missingOf(d);
  const start = passiProgetto(missing, { locale: false }, label);
  assert.equal(total(start), missing.length);
  assert.equal(passoOra(start)?.id, passoId('base'), 'r and layout come from the calculation');
  assert.ok(!start.some((s) => s.id === passoId('locale')));
  // the link goes to the field's id, not to the value's key
  const campo = passiProgetto(['entrances', 'room.W'], { locale: true }, label, (k) => `bk-${k.replace('.', '-')}`);
  assert.deepEqual(campo.filter((s) => s.primo).map((s) => s.primo), ['bk-entrances', 'bk-room-W']);
});
