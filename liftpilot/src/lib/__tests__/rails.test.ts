// The check of the car's guide rails (UNI EN 81-50:2020, 5.10) and of the safety gear's type for the speed: the omega
// method on the worked example of Mellor (4th Symposium on Lift & Escalator Technologies, 2014), the forces the same as
// the sheet's, the stresses and deflections by hand, the outcomes on sheet 1 and its note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV_VERT, RAILS, defaultInputs, layout } from '@/shaft';
import { RAIL_SECTIONS, RAIL_TYPES, iMin } from '@/shaft/rails';
import { impactFactor, loadCases, loadingCases, railForces, sillFactor } from '../tavole/forces';
import { omega, railCheck, railChecks, railLimits } from '../tavole/rail-check';
import { railNote } from '../tavole/notes';
import { makeFmt } from '../present/tr';

const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('metodo omega (Rm 370): i valori dell’esempio di Mellor e i limiti della tabella', () => {
  near(omega(4000 / 23.61) ?? 0, 4.85, 0.005);
  near(omega(2500 / 23.61) ?? 0, 2.02, 0.005);
  // continuous across the ranges, growing, and nothing past λ 250
  for (const [upTo] of KV_VERT.omega370.slice(0, -1)) near(omega(upTo) ?? 0, omega(upTo + 1e-9) ?? 0, 0.02);
  assert.ok((omega(100) ?? 0) < (omega(150) ?? 0));
  assert.equal(omega(251), null);
});

test('sezioni dei profili: ogni guida ha i suoi valori, coerenti con la massa al metro e con la forma', () => {
  for (const t of RAIL_TYPES) {
    const S = RAIL_SECTIONS[t], R = RAILS[t];
    // steel 7850 kg/m³: q ≈ A · 0,00785 (kg/m with A in mm²), within the makers' rounding
    near(S.A * 0.00785, R.q, R.q * 0.02);
    // the least section moduli: about the symmetry axis to the foot's edge, about x to the blade's tip at most
    near(S.Wy, S.Iy / (R.b / 2), S.Wy * 0.02);
    assert.ok(S.Wx >= S.Ix / R.h && S.Wx <= S.Ix / (R.h / 2), t);
    assert.ok(S.c > 0 && S.c <= R.k, t);
  }
  // ISO 8100-33:2022's radii of T127-1/B (ISO 7465:2007 printed its section moduli instead), and T125/B's least about x
  near(iMin(RAIL_SECTIONS['T127-1/B']), 25.67, 0.01);
  near(iMin(RAIL_SECTIONS['T125/B']), Math.sqrt(RAIL_SECTIONS['T125/B'].Ix / RAIL_SECTIONS['T125/B'].A), 1e-9);
});

test('guide di cabina: forze come sul foglio, tensioni e frecce a mano', () => {
  const L = layout(defaultInputs(1600, 1750)), P = 700, Q = 630, t = L.inputs.carRail, S = RAIL_SECTIONS[t], l = 2000, len = 18000;
  const F = railForces(L, P, Q, 'progressive'), g = loadCases(L, P, Q, impactFactor('progressive'));
  // the sheet's Fx and Fy [daN] are the worst of the two cases
  near(Math.max(...g.cases.map((c) => c.fx)) / 10, F.fx, 1e-9);
  near(Math.max(...g.cases.map((c) => c.fy)) / 10, F.fy, 1e-9);
  const R = railCheck(L, t, P, Q, 'progressive', l, len), G = 9.81;
  const sm = Math.max(...g.cases.map((c) => (3 * c.fx * l) / 16 / S.Wy + (3 * c.fy * l) / 16 / S.Wx));
  const fk = (2 * G * (P + Q)) / 2 + (G * RAILS[t].q * len) / 1000, w = omega(l / iMin(S)) ?? NaN;
  near(R.gear.sm, sm, 1e-9);
  near(R.gear.s, sm + fk / S.A, 1e-9);
  near(R.gear.sc ?? NaN, (fk * w) / S.A + 0.9 * sm, 1e-9);
  near(R.flange.gear, (1.85 * F.fx * 10) / S.c ** 2, 1e-9);
  near(R.dx, (0.7 * F.fx * 10 * l ** 3) / (48 * 210000 * S.Iy), 1e-9);
  near(R.dy, (0.7 * F.fy * 10 * l ** 3) / (48 * 210000 * S.Ix), 1e-9);
  // the deflections go with l³: brackets twice as far apart, eight times as much
  near(railCheck(L, t, P, Q, 'progressive', 2 * l, len).dx, 8 * R.dx, 1e-9);
});

test('carico al piano: Fs = 0,4·g·Q al centro della soglia (0,6 e 0,85 per uso), cabina vuota, nessun coefficiente; tensioni ammissibili Rm/St', () => {
  const L = layout(defaultInputs(1600, 1750)), P = 700, Q = 630, G = 9.81, c = L.car, d = L.doors[0];
  // central sling: the sill of entrance A on the car's front, across the rails' line by the car's half depth
  const [ld] = loadingCases(L, P, Q), n = 2, h = (L.inputs.vertical.frameTop + L.inputs.vertical.frameBelow) / 1000;
  const xi = Math.abs(c.y - L.frame.axis) / 1000, mid = L.rails.filter((r) => r.kind === 'car').reduce((s, r) => s + r.x, 0) / 2;
  near(ld.fx, (0.4 * G * Q * xi) / (n * h) + (G * P * Math.abs(c.y + c.h / 2 - L.frame.axis)) / 1000 / (n * h), 1e-9);
  near(ld.fy, (0.4 * G * Q * Math.abs((d.u0 + d.u1) / 2 - mid)) / 1000 / ((n / 2) * h) + (G * P * Math.abs(c.x + c.w / 2 - mid)) / 1000 / ((n / 2) * h), 1e-9);
  // the use not given: 2500 kg and more 0,6·g·Q (UNI EN 81-1:2008, G.2.5)
  const heavy = loadingCases(L, P, 2500)[0], light = loadingCases(L, P, 2499)[0];
  assert.ok(heavy.fx / light.fx > 1.45);
  // by the use (UNI EN 81-20:2020, 5.7.2.3.6): passengers 0,4 at any load, goods passenger 0,6, heavy handling devices 0,85
  assert.equal(sillFactor(2500, 'passengers'), 0.4);
  assert.equal(sillFactor(630, 'goods'), 0.6);
  assert.equal(sillFactor(630, 'goodsHeavy'), 0.85);
  assert.deepEqual(loadingCases(L, P, Q, 'passengers'), loadingCases(L, P, Q));
  const fsOf = (use: 'passengers' | 'goods' | 'goodsHeavy'): number => loadingCases(L, 0, Q, use)[0].fx;
  near(fsOf('goodsHeavy') / fsOf('passengers'), 0.85 / 0.4, 1e-9);
  // Rm 370 with St 1,8 and 2,25
  near(railLimits().gear, 370 / 1.8, 1e-9);
  near(railLimits().use, 370 / 2.25, 1e-9);
  // the note says the factor the check took and the permissible stresses as the registry does
  const note = (q: number, use?: 'passengers' | 'goods' | 'goodsHeavy'): string =>
    railNote(railCheck(L, L.inputs.carRail, P, q, 'progressive', 2000, 18000, use), 'T70-1/A', 'progressive', use, 'NOTA 1', makeFmt('it')).text;
  assert.ok(note(Q).includes('carico al piano (0,4·g·Q alla soglia, secondo la portata)') && note(2500).includes('carico al piano (0,6·g·Q'));
  assert.ok(note(Q, 'goodsHeavy').includes('carico al piano (0,85·g·Q alla soglia, per merci accompagnate con mezzi di carico pesanti)'));
  assert.ok(note(Q).includes('Rm/1,8 = 205,6') && note(Q).includes('Rm/2,25 = 164,4'));
});

test('esiti sul foglio 1: tensioni, suola, frecce; paracadute istantaneo solo fino a 0,63 m/s', () => {
  const L = layout(defaultInputs(1600, 1750)), R = railCheck(L, L.inputs.carRail, 700, 630, 'progressive', 2000, 18000);
  const ids = railChecks(R, 'progressive', 1).map((c) => c.id);
  assert.deepEqual(ids, ['gr_stress', 'gr_flange', 'gr_defl', 'sg_type']);
  const sg = (gear: 'progressive' | 'roller' | 'instantaneous', v: number) => railChecks(R, gear, v).find((c) => c.id === 'sg_type');
  assert.equal(sg('progressive', 2.5)?.status, 'ok');
  assert.equal(sg('progressive', 2.5)?.limit, null);
  assert.equal(sg('instantaneous', 0.63)?.status, 'ok');
  assert.equal(sg('instantaneous', 1)?.status, 'fail');
  assert.equal(sg('roller', 1)?.status, 'fail');
  // brackets too far apart: λ past the table fails the stresses
  const far = railCheck(L, L.inputs.carRail, 700, 630, 'progressive', 6000, 18000);
  assert.equal(far.omega, null);
  assert.equal(railChecks(far, 'progressive', 1)[0].status, 'fail');
});
