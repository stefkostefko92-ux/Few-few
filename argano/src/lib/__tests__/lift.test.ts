// One form → shaft, calculation, simulation: the automatic values by hand, the entered ones kept, the records valid
// for the server's schemas, the same derivation twice; the registries of the automatic values and of the simulation
// cover their constants and say their numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInputs } from '@/calc/index';
import { travel } from '@/shaft';
import { formValuesSchema, visibleBad } from '@/lib/calc-input';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { liftInputsSchema } from '@/lib/lift-input';
import { AUTO_ALL, KL, VOCI_IMPIANTO, carMassEstimate, defaultLift, deriveLift, type LiftInputs } from '@/lib/lift';
import { KS, VOCI_SIM, duration, frameAt, runScenario } from '@/sim';

const it = (x: number): string => String(x).replace('.', ',');

test('dal modulo unico: corsa, portata, velocità, massa stimata, macchina proposta', () => {
  const inp = defaultLift(), d = deriveLift(inp);
  assert.equal(d.values.H, travel(inp.shaft.vertical.floors) / 1000);
  assert.equal(d.values.Q, d.layout.Q);
  assert.equal(d.values.v, inp.shaft.vertical.v);
  assert.equal(d.values.P, carMassEstimate(d.layout.Q));
  assert.equal(carMassEstimate(630), 700);
  assert.equal(d.origin.P, 'estimate');
  assert.equal(d.noProposal, false);
  assert.equal(d.origin.machine, 'auto');
  // the machine proposed passes every check of the verification
  assert.deepEqual(d.analysis.res.fails.map((c) => c.id), []);
  assert.deepEqual(visibleBad(d.analysis.ctx.bad, d.values), []);
});

test('i valori inseriti restano: massa della cabina, macchina, geometria', () => {
  const base = defaultLift();
  const inp: LiftInputs = { ...base, calc: { ...base.calc, P: 812, n_D: 480, dx: 0.42, L0: 2.5 }, auto: { ...AUTO_ALL, P: false, machine: false, dx: false, L0: false } };
  const d = deriveLift(inp);
  assert.equal(d.values.P, 812);
  assert.equal(d.values.n_D, 480);
  assert.equal(d.values.dx, 0.42);
  assert.equal(d.values.L0, 2.5);
  assert.deepEqual([d.origin.P, d.origin.machine, d.origin.dx], ['entered', 'entered', 'entered']);
});

test('distanza del rinvio e fune oltre la corsa, a mano', () => {
  const d = deriveLift(defaultLift()), L = d.layout, V = d.values;
  const calata = Math.hypot(L.cw.x + L.cw.w / 2 - (L.car.x + L.car.w / 2), L.cw.y + L.cw.h / 2 - (L.car.y + L.car.h / 2));
  const D = Number(V.n_D), Dp = Number(V.Dp);
  assert.equal(V.dx, Math.round(calata - D / 2 - Dp / 2) / 1000);
  const vt = d.shaft.vertical, room = d.shaft.room;
  assert.ok(room);
  assert.equal(V.L0, Math.round(vt.headroom - vt.frameTop + room.slab + KL.sheaveAxisPerD * D) / 1000);
});

test('i record che il server salva passano gli schemi e si rifanno uguali', () => {
  const inp = defaultLift();
  assert.ok(liftInputsSchema.safeParse(inp).success);
  const d = deriveLift(inp);
  assert.ok(formValuesSchema.safeParse(d.values).success);
  assert.ok(shaftInputsSchema.safeParse(d.shaft).success);
  assert.deepEqual(readInputs(d.values).bad, []);
  assert.deepEqual(deriveLift(inp).values, d.values);
});

test('la simulazione dell\'impianto derivato: la cabina arriva all\'ultimo piano', () => {
  const d = deriveLift(defaultLift()), top = d.sim.levels.length - 1;
  const run = runScenario(d.sim, { id: 'ride', p: { from: 0, to: top, load: 0 } });
  assert.ok(Math.abs(frameAt(run.series, duration(run.series)).s - d.sim.levels[top]) < 1e-9);
});

test('registri dei valori automatici e della simulazione', () => {
  for (const voci of [VOCI_IMPIANTO, VOCI_SIM]) {
    const ids = voci.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const v of voci) for (const f of ['titolo', 'valore', 'riferimento', 'fonte'] as const) assert.ok(v[f].trim(), `${v.id}: ${f}`);
  }
  const usedL = new Set(VOCI_IMPIANTO.flatMap((v) => v.costanti ?? [])), usedS = new Set(VOCI_SIM.flatMap((v) => v.costanti ?? []));
  assert.deepEqual(Object.keys(KL).filter((k) => !usedL.has(k as keyof typeof KL)), []);
  assert.deepEqual(Object.keys(KS).filter((k) => !usedS.has(k as keyof typeof KS)), []);
  const text = (voci: readonly { id: string; valore: string }[], id: string): string => voci.find((v) => v.id === id)?.valore ?? '';
  assert.ok(text(VOCI_IMPIANTO, 'impianto.massa.cabina').includes(`P = ${it(KL.carMassRatio)}·Q`));
  assert.ok(text(VOCI_IMPIANTO, 'impianto.massa.cabina').includes(`${KL.carMassStep} kg`));
  assert.ok(text(VOCI_IMPIANTO, 'impianto.L0').includes(`${it(KL.sheaveAxisPerD)}·D`));
  assert.ok(text(VOCI_SIM, 'sim.profilo').includes(`${it(KS.jerk)} m/s³`));
  for (const k of ['doorOpen', 'doorClose', 'dwell', 'startDelay'] as const) assert.ok(text(VOCI_SIM, 'sim.porte').includes(`${it(KS[k])} s`), k);
  assert.ok(text(VOCI_SIM, 'sim.ammortizzatori').includes(`${it(KS.bufferSpeed)} volte`));
  assert.ok(text(VOCI_SIM, 'sim.bloccata').includes(`${it(KS.stallSpeed)} m/s`));
  assert.ok(text(VOCI_SIM, 'sim.passo').includes(`${it(KS.step)} s`));
});
