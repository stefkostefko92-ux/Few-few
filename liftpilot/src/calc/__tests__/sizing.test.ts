// The proposal: every option passes the whole verification once loaded as the new machine; in a replacement the
// ropes in place are kept; the order follows the stated rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, compareOptions, compute, readInputs, ropeFamily, sizeMachine } from '../index';
import type { FormValues, SizingOption } from '../index';
import { makeRandom, randomInstallation } from './random';

// "Use the proposal": the option goes into the new-machine fields, catalogue output torque rounded up to 10 N·m
const applied = (V: FormValues, o: SizingOption): FormValues => ({
  ...V, n_D: o.M.D, n_groove: o.M.groove.type, n_beta: o.M.groove.beta, n_gamma: o.M.groove.gamma, n_i: o.M.i, n_Pn: o.M.Pn, n_brakeSets: 2,
  n_brakeNm: o.M.brakeNm, n_shaftMax: o.M.shaftMax, n_MpCat: Math.ceil(o.res.drive.MpMax / 10 - 1e-9) * 10, n_n: o.M.n, n_d: o.M.d, n_Fmin: o.M.Fmin, n_qf: o.M.qf,
});
const failsOnceApplied = (V: FormValues, o: SizingOption): string[] => {
  const c = readInputs(applied(V, o));
  return compute(c.I, c.N).fails.map((f) => f.id);
};

test('esempio B: con le funi esistenti una proposta per ogni puleggia, tutte 4 × Ø11', () => {
  const c = readInputs(PRESETS.B), s = sizeMachine(c.I, c.N, c.fixedD, c.rope);
  assert.deepEqual(c.rope && [c.rope.n, c.rope.d], [4, 11]);
  // β 98° between the table's 95° and 100°: N_equiv(t) interpolated (8,68), as UNI EN 81-50:2020 5.12.2.2 allows
  assert.deepEqual(s.options.map((o) => o.D), [480, 520, 560, 600, 640, 680, 720, 760, 800]);
  assert.ok(s.options.every((o) => o.n === 4 && o.d === 11));
  assert.equal(s.pick?.D, 480);
  assert.deepEqual(s.pick?.groove, { type: 'UU', beta: 98, gamma: 35 });
  for (const o of s.options) assert.deepEqual(failsOnceApplied(PRESETS.B, o), [], `D ${o.D}`);
});

test('esempio C: puleggia e funi esistenti tenute, una sola proposta', () => {
  const c = readInputs(PRESETS.C), s = sizeMachine(c.I, c.N, c.fixedD, c.rope);
  assert.equal(c.fixedD, 600);
  assert.deepEqual(s.options.map((o) => [o.D, o.n, o.d]), [[600, 4, 11]]);
  assert.deepEqual(failsOnceApplied(PRESETS.C, s.options[0] as SizingOption), []);
});

test('proposta libera su 200 impianti casuali: nessuna opzione fallisce la verifica', () => {
  const R = makeRandom(7);
  let options = 0;
  const wrong: string[] = [];
  for (let j = 0; j < 200; j++) {
    const V = { ...randomInstallation(R), keepRopes: false }, c = readInputs(V);
    if (c.bad.length) continue;
    const s = sizeMachine(c.I, c.N, c.fixedD, null);
    for (const o of s.options) { options++; const f = failsOnceApplied(V, o); if (f.length) wrong.push(`${j} D${o.D} ${o.n}×Ø${o.d}: ${f.join(',')}`); }
    if (s.pick) assert.equal(s.options.slice().sort(compareOptions)[0], s.pick);
  }
  assert.ok(options > 200, `opzioni controllate: ${options}`);
  assert.deepStrictEqual(wrong, []);
});

test('sostituzione con le funi esistenti su 200 impianti: funi tenute, verifica superata, catalogo ininfluente', () => {
  const R = makeRandom(11);
  let options = 0;
  const wrong: string[] = [];
  for (let j = 0; j < 200; j++) {
    const od = R.pick([8, 9, 10, 11, 12, 13]), on = R.pick([3, 4, 4, 5, 6]), rope = ropeFamily(od);
    const V: FormValues = { ...randomInstallation(R), keepRopes: true, compare: true, context: 'repl', o_n: on, o_d: od, o_Fmin: rope.Fmin, o_qf: rope.qf,
      n_n: 2, n_d: 8, n_Fmin: rope.Fmin, n_qf: rope.qf, n_MpCat: R.rnd() < 0.5 ? String(Math.round(R.U(600, 3000))) : '' };
    const c = readInputs(V);
    if (c.bad.length) continue;
    assert.deepEqual([c.N.n, c.N.d], [on, od], 'le funi nuove seguono quelle esistenti');
    const s = sizeMachine(c.I, c.N, c.fixedD, c.rope);
    const c0 = readInputs({ ...V, n_MpCat: '' }), s0 = sizeMachine(c0.I, c0.N, c0.fixedD, c0.rope);
    if (s0.options.map((o) => o.D).join() !== s.options.map((o) => o.D).join()) wrong.push(`${j}: la coppia di catalogo cambia la proposta`);
    for (const o of s.options) {
      options++;
      if (o.n !== on || o.d !== od) wrong.push(`${j}: funi diverse ${o.n}×Ø${o.d}`);
      const f = failsOnceApplied(V, o);
      if (f.length) wrong.push(`${j} D${o.D}: ${f.join(',')}`);
    }
  }
  assert.ok(options > 100, `opzioni controllate: ${options}`);
  assert.deepStrictEqual(wrong, []);
});

test('ordine della proposta', () => {
  const o = (real: boolean, tight: boolean, n: number, D: number, d: number) => ({ real, tight, n, D, d });
  const sorted = (list: ReturnType<typeof o>[]) => list.slice().sort(compareOptions);
  // traction at the real deceleration first, then without reduced margins
  assert.deepEqual(sorted([o(false, false, 4, 520, 10), o(true, true, 4, 600, 10)])[0], o(true, true, 4, 600, 10));
  assert.deepEqual(sorted([o(true, true, 4, 520, 10), o(true, false, 4, 600, 10)])[0], o(true, false, 4, 600, 10));
  assert.deepEqual(sorted([o(false, true, 4, 520, 10), o(false, false, 4, 600, 10)])[0], o(false, false, 4, 600, 10));
  // then 4 ropes or more, then the fewest ropes, the smallest sheave, the thinnest rope
  assert.deepEqual(sorted([o(true, false, 3, 440, 12), o(true, false, 5, 600, 8)])[0], o(true, false, 5, 600, 8));
  assert.deepEqual(sorted([o(true, false, 5, 480, 9), o(true, false, 4, 600, 10)])[0], o(true, false, 4, 600, 10));
  assert.deepEqual(sorted([o(true, false, 4, 600, 10), o(true, false, 4, 520, 11)])[0], o(true, false, 4, 520, 11));
  assert.deepEqual(sorted([o(true, false, 4, 520, 11), o(true, false, 4, 520, 10)])[0], o(true, false, 4, 520, 10));
});
