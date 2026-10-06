// Properties that must hold for any valid installation (research 10.1, point 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brakeWindow, compute, readInputs } from '../index';
import type { FormValues, Results } from '../index';
import { makeRandom, randomInstallation } from './random';

const CASES = 3000;

// every number of the results, with its path (the echoed machine and the check list left out)
function numbers(o: object, path = '', out: [string, number][] = []): [string, number][] {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number') out.push([path + k, v]);
    else if (v && typeof v === 'object' && k !== 'M' && k !== 'checks' && k !== 'fails') numbers(v as object, path + k + '.', out);
  }
  return out;
}

test(`proprietà su ${CASES} impianti casuali`, () => {
  const R = makeRandom(12345), violations = new Map<string, number>();
  const note = (what: string): void => { violations.set(what, (violations.get(what) ?? 0) + 1); };
  let slack = 0;
  for (let j = 0; j < CASES; j++) {
    const V = randomInstallation(R), ctx = readInputs(V);
    if (ctx.bad.length) continue;
    for (const M of [ctx.N, ...(ctx.compare ? [ctx.O] : [])]) {
      const r = compute(ctx.I, M);
      for (const [k, v] of numbers(r)) {
        if (Number.isNaN(v)) note('NaN ' + k);
        else if (!Number.isFinite(v)) {
          // a slack rope side (T2 = 0) is a physical answer: allowed where it can happen, and then traction fails
          const allowed = ['stall.ratio', 'stallLow.ratio', 'shaft.uplift'].includes(k) || /^(brkReal\.\d+|real|brake\.aMaxCase|msr1)\.(ratio|util)$/.test(k)
            || (/^(brk\.\d+|up|dn)\.(ratio|util)$/.test(k) && !Number.isFinite(r.up.ratio));
          if (!allowed) note('Infinity ' + k);
        }
      }
      if (!Number.isFinite(r.up.ratio)) {
        slack++;
        if (r.checks.find((c) => c.id === 'tr_up')?.status !== 'fail') note('fune lenta senza KO');
      }
      if (r.brake.all < 0 || r.brake.one < 0 || r.brake.up < 0) note('coppia del freno negativa');
      if (!(r.shaft.testKg > 0)) note('carico sull\'albero ≤ 0');
      for (const c of [r.load, r.dn, r.up]) if (!(c.util > 0)) note('utilizzo ≤ 0');
      if (!(r.ropes.SfAct > 0)) note('S_f effettivo ≤ 0');
    }
    // monotonicity on the new machine
    const with_ = (patch: FormValues): Results => { const c2 = readInputs({ ...V, ...patch }); return compute(c2.I, c2.N); };
    const r0 = compute(ctx.I, ctx.N), num = (x: unknown): number => Number(x);
    if (with_({ Q: num(V.Q) * 1.1 }).drive.Pst < r0.drive.Pst - 1e-9) note('la potenza cala con Q');
    if (V.alphaMode === 'manual') {
      const r2 = with_({ alphaManual: num(V.alphaManual) + 5 });
      if (r2.dn.util > r0.dn.util + 1e-12 || r2.up.util > r0.up.util + 1e-12) note('l\'utilizzo cresce con α');
    }
    if (r0.ropes.nps + r0.ropes.npr === 0 && with_({ n_D: num(V.n_D) * 1.1 }).ropes.SfCalc > r0.ropes.SfCalc + 1e-9) note('S_f,calc cresce con D/d');
    // real brake deceleration: never below the minimum, grows with the brake torque and with the gear friction
    if (r0.brkReal.some((c) => c.aEff < ctx.I.ae - 1e-12)) note('decelerazione reale sotto il minimo');
    const rT = with_({ n_brakeNm: num(V.n_brakeNm) * 1.2 });
    if (rT.brkReal.some((c, i) => c.a < (r0.brkReal[i]?.a ?? NaN) - 1e-9)) note('la decelerazione cala con la coppia del freno');
    const rE1 = with_({ n_etaI: '0.9' }), rE2 = with_({ n_etaI: '0.5' });
    if (rE2.brkReal.some((c, i) => c.a < (rE1.brkReal[i]?.a ?? NaN) - 1e-9)) note('la decelerazione cala con l\'attrito del riduttore');
    // admissible brake range: both ends keep traction and the upper end is tight
    const w = brakeWindow(r0);
    if (w.hi != null && Number.isFinite(w.hi)) {
      if (r0.brakeUtil(w.lo) > 1 + 1e-9 || r0.brakeUtil(w.hi) > 1 + 1e-9) note('un estremo dell\'intervallo del freno rompe l\'aderenza');
      if (r0.brakeUtil(w.hi * 1.01 + 0.01) <= 1) note('l\'estremo superiore del freno non è stretto');
    }
    // N_equiv(t): never decreases with β, never increases with γ
    if (V.n_groove === 'UU' && with_({ n_beta: Math.min(106, num(V.n_beta) + 2) }).ropes.NeqT < r0.ropes.NeqT - 1e-12) note('N_equiv(t) cala con β');
    if (V.n_groove === 'VH' && with_({ n_gamma: num(V.n_gamma) + 2 }).ropes.NeqT > r0.ropes.NeqT + 1e-12) note('N_equiv(t) cresce con γ');
  }
  assert.deepStrictEqual(Object.fromEntries(violations), {});
  assert.ok(slack < CASES / 100, `casi con fune lenta: ${slack}`);
});
