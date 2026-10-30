// The rules of round 30, checked against forms written out by hand: the car's and the counterweight's pulleys at 2:1
// (term III) and the rope from a bottom machine (MSR1) of UNI EN 81-50:2020 5.11.3, the rescue forces of UNI EN 81-20:2020
// 5.9.2.3 by the machine's standard, the electric device against stalling (5.5.3 c) 2)), and the remarks on two ropes,
// the speed, the ropes retained in the grooves, the gravity and the reduced-stroke buffers' deceleration; of round 34, the
// static power at the static torque of a machine faster than the rated speed and the retainer over a diverting pulley.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, PRESETS, compute, readInputs } from '../index';
import type { BrakeCase, FormValues, Results } from '../index';

const G = 9.81;
const near = (name: string, got: number, exp: number, tol = 1e-9): void => {
  assert.ok(Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp)), `${name}: calcolato ${got} · atteso ${exp}`);
};
const run = (V: FormValues) => { const c = readInputs(V); return { ...c, r: compute(c.I, c.N) }; };
const status = (r: Results, id: string) => r.checks.find((c) => c.id === id)?.status;
const ROPE10 = { n_n: 4, n_d: 10, n_Fmin: 47.5, n_qf: 0.336 };
// the loaded car moving down at the lowest floor, decelerating: the car side is T1
const loadedDownAtBottom = (cs: readonly BrakeCase[]): BrakeCase => {
  const c = cs.find((x) => x.load === 'q' && x.dir === 'dn' && x.pos === 'b');
  assert.ok(c);
  return c;
};

test('termine III a 2:1: le pulegge di cabina e contrappeso aggiungono ±(J_p/R_p²)·a/r ai tiri; a 1:1 niente', () => {
  const base = { ...PRESETS.C, ...ROPE10, compare: false, r: '2' };
  const j0 = run({ ...base, Jp: 0 }).r, j1 = run({ ...base, Jp: 1.5 }).r;
  const Rp = 500 / 2000, a = 0.5, mP = 1.5 / (Rp * Rp);
  const c0 = loadedDownAtBottom(j0.brk), c1 = loadedDownAtBottom(j1.brk);
  near('T1 (lato cabina)', c1.T1 - c0.T1, (mP * a) / 2);
  near('T2 (lato contrappeso)', c1.T2 - c0.T2, -(mP * a) / 2);
  // at 1:1 there are no such pulleys: the same numbers, bit for bit
  const k0 = run({ ...base, r: '1', Jp: 0 }).r, k1 = run({ ...base, r: '1', Jp: 1.5 }).r;
  assert.deepEqual(k1.brk.map((c) => c.ratio), k0.brk.map((c) => c.ratio));
});

test('macchina in basso a 2:1: il tratto MSR1 con a come stampato, la riga «r·a» più severa e solo un avviso', () => {
  const V = { ...PRESETS.B, compare: false, r: '2' };
  const { I, N, r } = run(V);
  const w = N.n * N.qf, a = I.ae, Rp = I.Dp / 2000, Lc = I.H + I.L0;
  // car side, loaded car moving down at the lowest floor (UNI EN 81-50:2020, 5.11.3 with r = 2, machine below)
  const T1 = ((I.P + I.Q) * (G + a) + (I.Jp / (Rp * Rp)) * a) / 2 + w * Lc * (G + 2 * a) + (I.Jp * 2 * a) / (Rp * Rp) - w * I.Hv * (G - a);
  near('T1 stampato', loadedDownAtBottom(r.brk).T1, T1);
  assert.ok(r.msr1, 'riga r·a presente');
  assert.ok(r.msr1.util >= Math.max(r.dn.util, r.up.util), 'con r·a l’utilizzo non cala');
  assert.ok(['info', 'warn'].includes(status(r, 'tr_msr1') ?? ''), 'mai KO');
  // 1:1 or a machine at the top: no such row
  assert.equal(run({ ...V, r: '1' }).r.msr1, undefined);
  assert.equal(run({ ...PRESETS.C, compare: false, r: '2' }).r.msr1, undefined);
});

test('manovra di emergenza: 400 N per salire con Q, 150 N fino a una fermata con (q ± 0,1)·Q secondo la UNI EN 81-20', () => {
  const V = { ...PRESETS.C, ...ROPE10, compare: false };
  const { I, N, r } = run(V);
  // the worse of the two loads, directions and ends: 0,1·Q plus the ropes of the travel, at the handwheel
  const w = N.n * N.qf, ub = (K.rescueLoadBand * I.Q + w * I.H) * G;
  near('F_a', r.rescue.Fa, (ub * (N.D / 2000)) / (N.i * N.etaD * I.etaShaft) / I.rh);
  assert.equal(status(r, 's_fa'), r.rescue.Fa <= K.rescueForceMech ? 'ok' : 'warn');
  // a small handwheel: over 150 N, the mechanical means is not allowed (a remark: the electric means is needed)
  const small = run({ ...V, rh: 0.05 }).r;
  assert.ok(small.rescue.Fa > K.rescueForceMech && status(small, 's_fa') === 'warn');
  // to UNI EN 81-1 only the 400 N: no 150 N row, no gravity remark
  const old = run({ ...V, context: 'repl', machineStd: 'en81-1', n_etaI: '0' }).r;
  assert.equal(status(old, 's_fa'), undefined);
  assert.equal(status(old, 's_gravity'), undefined);
  // a self-locking gear to UNI EN 81-20: the car does not move by gravity (information)
  assert.equal(status(run({ ...V, n_etaI: '0' }).r, 's_gravity'), 'info');
});

test('stallo: con il dispositivo elettrico «Attenzione» solo con la macchina secondo la UNI EN 81-20, mai OK', () => {
  // light car, long heavy ropes, V groove: the stalled check keeps traction (T1/T2 < e^(f·α)) and fails
  const V = { ...PRESETS.A, compare: false, alphaManual: 180, n_groove: 'VH', n_gamma: 35, H: 60, n_n: 6, n_d: 13, n_Fmin: 100, n_qf: 0.6, P: 500 };
  const r = run(V).r;
  assert.equal(status(r, 'tr_stall'), 'fail');
  assert.equal(status(run({ ...V, stallDevice: true }).r, 'tr_stall'), 'warn');
  assert.equal(status(run({ ...V, context: 'repl', machineStd: 'en81-1', stallDevice: true }).r, 'tr_stall'), 'fail');
  // a passed check stays OK with or without the device
  const ok = run({ ...PRESETS.C, compare: false }).r;
  assert.equal(status(ok, 'tr_stall'), 'ok');
});

test('promemoria: due funi, velocità e compensazione, funi trattenute con la macchina in basso', () => {
  const C = { ...PRESETS.C, compare: false };
  assert.equal(status(run({ ...C, n_n: 2, n_d: 13, n_Fmin: 100, n_qf: 0.6 }).r, 'r_two'), 'info');
  assert.equal(status(run(C).r, 'r_two'), undefined);
  assert.equal(status(run({ ...C, v: 1.6 }).r, 'v_comp'), undefined);
  assert.equal(status(run({ ...C, v: 2 }).r, 'v_comp'), 'warn');
  assert.equal(status(run({ ...C, v: 3.5 }).r, 'v_comp'), 'fail');
  assert.equal(status(run({ ...PRESETS.B, compare: false }).r, 'g_retain'), 'info');
  assert.equal(status(run(C).r, 'g_retain'), undefined);
});

test('ammortizzatori a corsa ridotta: la decelerazione inserita, mai sotto il minimo; vuoto 0,8 m/s²', () => {
  const C = { ...PRESETS.C, compare: false };
  assert.equal(readInputs({ ...C, buffers: false, ae: '1.2' }).I.ae, K.aeMin);
  assert.equal(readInputs({ ...C, buffers: true }).I.ae, K.aeReducedStroke);
  assert.equal(readInputs({ ...C, buffers: true, ae: '1,2' }).I.ae, 1.2);
  const low = readInputs({ ...C, buffers: true, ae: '0.3' });
  assert.ok(low.bad.includes('ae') && low.I.ae === K.aeReducedStroke);
});

test('potenza statica: con la macchina più veloce della nominale vale la coppia statica (il motore sotto la frequenza base)', () => {
  const C = { ...PRESETS.C, compare: false, n_Pn: 6 };
  // i = 43: 0,989 m/s, sotto la velocità nominale: la potenza, come prima
  const slow = run({ ...C, n_i: 43 }).r;
  near('P_eq = P_st', slow.drive.Peq, slow.drive.Pst);
  assert.equal(status(slow, 'd_pst'), 'ok');
  // i = 39: 1,090 m/s; la potenza alla velocità nominale passerebbe, la coppia statica supera la nominale (M_n = 9550·P_n/n)
  const fast = run({ ...C, n_i: 39 }).r;
  near('P_eq', fast.drive.Peq, (fast.drive.Pst * fast.kin.vReal) / 1.0);
  near('utilizzo = M_st/M_n', fast.drive.powerUtil, fast.drive.MmSt / fast.drive.Mn, 1e-4);
  assert.ok(fast.drive.Pst / 6000 < 1 && fast.drive.powerUtil > 1);
  assert.equal(status(fast, 'd_pst'), 'fail');
});

test('fermo intermedio delle funi: con il rinvio un avvolgimento oltre 180° scende sotto l’asse di altrettanto', () => {
  const A = { ...PRESETS.A, compare: false, layout: 'topDefl', alphaMode: 'geo', n_D: 560, Dp: 400 };
  // dx 0,05 m and h 0,5 m: the rope wraps the diverting pulley from the inside, 247° on the sheave, 67° under the axis
  const c = run({ ...A, dx: 0.05, h: 0.5 }).r.checks.find((x) => x.id === 'g_retain');
  assert.ok(c && c.status === 'info' && c.value !== null && c.value - 180 > K.retainBelow && c.value > K.retainWrap, `${c?.value}`);
  assert.equal(status(run({ ...A, dx: 0.3, h: 0.6 }).r, 'g_retain'), undefined);
});
