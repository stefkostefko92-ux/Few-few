// «Porta nel calcolo» (round 45, phase 3 step 7): the drawing gives its «Calcolo argano» the travel, the rope beyond it
// (switched on), the diverting pulley's distance and height (topDefl, switched on or the height set on the plan), a
// machine below's head pulleys' height (switched on) — never the extra bends (the drawing counts its head pulleys again),
// the machine, the rated load, the speed or the car's mass; each value marked, with the value it replaced only when it
// held another; the drawing itself untouched. The calculator held to a direct pull's drawn sheave lists only it; the
// largest car of the drawn shaft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { cabinaMassima, chiaviDelDisegno, chiaviNascoste, portaNelCalcolo } from '@/lib/lift/porta';
import { analyse, sizingWithSheave } from '@/lib/present/analysis';
import { layout } from '@/shaft';

const NEVER = ['nps', 'Q', 'v', 'P', 'n_D', 'n_i', 'n_n', 'n_d', 'r', 'layout', 'context'];

test('chiaviDelDisegno: la corsa sempre, il resto con il suo interruttore e la sua sospensione', () => {
  const on = { L0: true, dx: true, Hv: true }, off = { L0: false, dx: false, Hv: false };
  assert.deepEqual(chiaviDelDisegno('top', on), ['H', 'L0']);
  assert.deepEqual(chiaviDelDisegno('topDefl', on), ['H', 'L0', 'dx', 'h']);
  assert.deepEqual(chiaviDelDisegno('bottom', on), ['H', 'L0', 'Hv']);
  assert.deepEqual(chiaviDelDisegno('topDefl', off), ['H']);
  assert.deepEqual(chiaviDelDisegno('topDefl', off, true), ['H', 'h'], 'the height set on the plan');
  assert.deepEqual(chiaviDelDisegno('bottom', off, true), ['H'], 'no diverting pulley below');
});

test('portaNelCalcolo: solo i valori del disegno, segnati; «prima» solo se era un altro valore; il disegno non cambia', () => {
  const V: FormValues = { H: '18', L0: 2, dx: 0.3, h: '', Hv: 20, nps: 1, Q: 630, n_D: 400, layout: 'topDefl' };
  const drawn: FormValues = { H: 18.0, L0: 2.15, dx: 0.312, h: 0.6, Hv: 24.2, nps: 3, Q: 630, n_D: 520, layout: 'topDefl' };
  const frozen = JSON.stringify(drawn);
  const r = portaNelCalcolo(V, drawn, ['H', 'L0', 'dx', 'h']);
  assert.deepEqual(r.values, { ...V, H: 18, L0: 2.15, dx: 0.312, h: 0.6 });
  assert.deepEqual(r.valori, { H: '18', L0: '2.15', dx: '0.312', h: '0.6' });
  assert.deepEqual(r.prima, { L0: '2', dx: '0.3' }, 'H was the same number, h was empty');
  assert.equal(JSON.stringify(drawn), frozen, 'the drawing untouched');
  // a key the drawing has no number for stays as it was
  assert.deepEqual(portaNelCalcolo(V, { ...drawn, Hv: '' }, ['Hv']).values, V);
  // the head pulleys' height with the machine above: brought, never marked (it is no value of this roping's form)
  assert.deepEqual(chiaviNascoste('topDefl', { dx: true, Hv: true }), ['Hv']);
  assert.deepEqual(chiaviNascoste('top', { dx: true, Hv: true }), ['dx', 'Hv']);
  assert.deepEqual([chiaviNascoste('bottom', { dx: false, Hv: true }), chiaviNascoste('top', { dx: false, Hv: false })], [[], []]);
  const silent = portaNelCalcolo(V, drawn, ['H'], ['Hv']);
  assert.equal(silent.values.Hv, 24.2);
  assert.ok(!('Hv' in silent.valori) && !('Hv' in silent.prima));
});

test('ogni valore del disegno nel calcolo: il calcolo del progetto è lo stesso calcolo (stesso snapshot)', () => {
  for (const layoutOf of ['topDefl', 'top', 'bottom'] as const) {
    const L: LiftInputs = { ...newLift(), calc: { ...newLift().calc, layout: layoutOf }, ...(layoutOf === 'bottom' ? { bottom: 'head' as const } : {}) };
    const { V, d } = drawnOn(L);
    const auto = { L0: true, dx: true, Hv: true };
    const r = portaNelCalcolo(V, d.values, chiaviDelDisegno(V.layout, auto), chiaviNascoste(V.layout, auto));
    // drawn again on the calculation that took its values: the same values (a machine below adds its extra bends)
    const again = deriveLift(liftInputsOf({ ...progettoOf(L), auto: { ...auto, panel: true } }, { values: r.values, collaudo: L.collaudo ?? null })).values;
    const extra = d.headPulleys > 2 ? d.headPulleys - 2 : 0;
    assert.deepEqual(JSON.stringify(canon({ ...again, nps: Number(again.nps) - extra })), JSON.stringify(canon({ ...r.values, nps: Number(r.values.nps) })), layoutOf);
  }
});

/** A drawing on its calculation as the Progetto composes it, with every switch on. */
function drawnOn(L: LiftInputs) {
  const base = { values: L.calc, collaudo: L.collaudo ?? null };
  const p = { ...progettoOf(L), auto: { L0: true, dx: true, Hv: true, panel: true } };
  return { V: base.values, d: deriveLift(liftInputsOf(p, base)) };
}

test('il disegno porta nel calcolo: mai i rinvii in più di una macchina in basso, mai argano, portata, velocità o massa', () => {
  const cases: Record<string, LiftInputs> = {
    rinvio: newLift(),
    diretto: { ...newLift(), calc: { ...newLift().calc, layout: 'top' } },
    ...Object.fromEntries((['head', 'room', 'under'] as const).map((b) => [`in basso, ${b}`, { ...newLift(), calc: { ...newLift().calc, layout: 'bottom' }, bottom: b }])),
  };
  for (const [name, L] of Object.entries(cases)) {
    const { V, d } = drawnOn(L);
    const keys = chiaviDelDisegno(V.layout, { L0: true, dx: true, Hv: true });
    const r = portaNelCalcolo(V, d.values, keys);
    for (const k of NEVER) assert.deepEqual(r.values[k], V[k], `${name}: ${k} stays the calculation's`);
    for (const k of keys) assert.equal(String(r.values[k]), String(d.values[k]), `${name}: ${k} the drawing's`);
    if (V.layout === 'bottom') assert.ok(Number(d.values.nps) >= Number(V.nps), `${name}: the drawing counts its head pulleys`);
  }
});

test('sizingWithSheave: solo la puleggia del disegno, nessuna fuori dalla griglia', () => {
  const V = { ...newLift().calc, layout: 'top' }, ctx = analyse(V).ctx;
  const held = sizingWithSheave(ctx, 520);
  assert.ok(held.options.length > 0);
  assert.ok(held.options.every((o) => o.D === 520), 'only that sheave');
  assert.deepEqual(sizingWithSheave(ctx, 900).options, [], 'off the grid: none');
  assert.equal(sizingWithSheave(ctx, 900).pick, null);
});

test('cabinaMassima: la cabina più grande del vano, qualunque portata abbia il calcolo', () => {
  const S = newLift().shaft, free = layout({ ...S, Q: null }).Q;
  assert.equal(cabinaMassima({ ...S, Q: 320 }), free);
  assert.equal(cabinaMassima({ ...S, Q: 320, plan: { A: 800, B: 900 } }), free, 'a car sized by hand counts as left to the software');
  assert.ok(cabinaMassima({ ...S, W: S.W + 400, D: S.D + 400 }) > free, 'a larger shaft takes a larger car');
});
