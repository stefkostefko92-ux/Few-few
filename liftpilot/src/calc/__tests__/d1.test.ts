// UNI 10411-1:2024, D.1 (round 46, B10): C1 by the rated speed's band, C2 and f by the groove, the two static cases
// written out by hand, and the same pulls as compute()'s loading cases (the golden and hand checks stay untouched).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, compute, readInputs } from '../index';
import { K } from '../norme';
import { aOfC1, c1Min, c1Of, c2Of, d1Of, fD1 } from '../d1';
import type { FormValues, Groove } from '../types';

const G = 9.81;
const near = (name: string, got: number, exp: number, tol = 1e-9): void => {
  assert.ok(Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp)), `${name}: calcolato ${got} · atteso ${exp}`);
};
const rad = (d: number): number => (d * Math.PI) / 180;
const gr = (type: Groove['type'], beta = 0, gamma = 0): Groove => ({ type, beta, gamma });

test('D.1: C1 minimo per fascia di velocità (limite inferiore escluso, superiore incluso)', () => {
  for (const [v, c] of [[0.3, 1.1], [0.63, 1.1], [0.64, 1.15], [1.0, 1.15], [1.01, 1.2], [1.6, 1.2], [1.61, 1.25], [2.5, 1.25], [3, 1.25]] as const) {
    assert.equal(c1Min(v), c, `v ${v}`);
  }
  // a small deceleration: the band's minimum (0,63 / 0,64 m/s); a larger one: (g + a)/(g − a) — with a 0,5 m/s² it is
  // 1,107, over the first band's 1,10
  assert.equal(c1Of(0.63, 0.3), 1.1);
  assert.equal(c1Of(0.64, 0.3), 1.15);
  near('C1 a 0,63 m/s con a 0,5', c1Of(0.63, 0.5), (G + 0.5) / (G - 0.5));
  near('C1 calcolato con a 1,5', c1Of(1, 1.5), (G + 1.5) / (G - 1.5));
  // over 2,5 m/s computed, never under 1,25
  assert.equal(c1Of(3, 0.5), K.c1Min);
  near('C1 oltre 2,5 m/s calcolato', c1Of(3, 1.2), (G + 1.2) / (G - 1.2));
  assert.equal(c1Of(1, G), Infinity);
});

test('D.1: C2 e f per tipo di gola, μ = 0,09', () => {
  assert.equal(c2Of(gr('VH', 0, 40)), 1.2);
  assert.equal(c2Of(gr('VN', 90, 40)), 1.2);
  assert.equal(c2Of(gr('UU', 90)), 1);
  assert.equal(c2Of(gr('U', 0, 30)), 1);
  const mu = 0.09;
  near('semicircolare senza intaglio: 4μ/π', fD1(gr('U', 95, 30)), (4 * mu) / Math.PI);
  const b = rad(95);
  near('semicircolare con intaglio β 95°', fD1(gr('UU', 95)), (4 * mu * (1 - Math.sin(b / 2))) / (Math.PI - b - Math.sin(b)));
  near('a cuneo temprata γ 40°', fD1(gr('VH', 0, 40)), mu / Math.sin(rad(20)));
  // a V groove not hardened with its undercut: the smaller of the two
  const b2 = rad(90), semi = (4 * mu * (1 - Math.sin(b2 / 2))) / (Math.PI - b2 - Math.sin(b2));
  near('a cuneo non temprata γ 40° β 90°', fD1(gr('VN', 90, 40)), Math.min(mu / Math.sin(rad(20)), semi));
});

test('D.1 a mano: macchina in alto 1:1, α 180°, le due posizioni statiche', () => {
  // the plant of example C with four ropes Ø10 (0,336 kg/m), α set by hand
  const V: FormValues = { ...PRESETS.C, compare: false, alphaMode: 'manual', alphaManual: 180, n_n: 4, n_d: 10, n_Fmin: 47.5, n_qf: 0.336 };
  const { I, N } = readInputs(V), d = d1Of(I, N);
  const P = 700, Q = 630, Mcw = 700 + 0.5 * 630, w = 4 * 0.336, H = 18, L0 = 2;
  assert.deepEqual([I.P, I.Q, I.H, I.L0, I.r, I.layout], [P, Q, H, L0, 1, 'top']);
  const C1 = Math.max((G + I.ae) / (G - I.ae), c1Min(I.v)), C2 = c2Of(N.groove), efa = Math.exp(fD1(N.groove) * Math.PI);
  // car at the lowest landing with 1,25·Q: car side over the travel, counterweight side over L0
  const Tb = [(P + 1.25 * Q) * G + w * (H + L0) * G, Mcw * G + w * L0 * G] as const;
  // empty car at the highest landing: the counterweight hangs over the travel
  const Tt = [P * G + w * L0 * G, Mcw * G + w * (H + L0) * G] as const;
  const [b, t] = d.cases;
  near('T1 in basso', b.T1, Math.max(...Tb));
  near('T2 in basso', b.T2, Math.min(...Tb));
  near('T1 in alto', t.T1, Math.max(...Tt));
  near('T2 in alto', t.T2, Math.min(...Tt));
  near('C1', d.C1, C1);
  near('utilizzo in basso', b.util, (Math.max(...Tb) / Math.min(...Tb)) * C1 * C2 / efa);
  near('utilizzo in alto', t.util, (Math.max(...Tt) / Math.min(...Tt)) * C1 * C2 / efa);
  assert.equal(d.worst, b.util >= t.util ? b : t);
});

test('D.1: le tensioni del caso in basso sono quelle del caricamento di compute(), per ogni schema', () => {
  for (const V of [PRESETS.A, PRESETS.B, PRESETS.C, { ...PRESETS.A, r: '2' }, { ...PRESETS.B, layout: 'bottom' }] as FormValues[]) {
    const { I, N } = readInputs(V), d = d1Of(I, N), res = compute(I, N), lb = res.loadCases.find((c) => c.pos === 'b');
    assert.ok(lb);
    assert.equal(d.cases[0].T1, lb.T1);
    assert.equal(d.cases[0].T2, lb.T2);
    assert.equal(d.cases[0].alpha, lb.alpha);
    // the efa of D.1 with its own f, not the loading's
    near('e^(f·α) della D.1', d.cases[0].efa, Math.exp(fD1(N.groove) * lb.alpha));
  }
});

test('D.1: la decelerazione a è quella della verifica di frenatura del calcolo, se non indicata', () => {
  const { I, N } = readInputs({ ...PRESETS.C, buffers: true, ae: 0.8 });
  assert.equal(d1Of(I, N).a, I.ae);
  assert.equal(d1Of(I, N, 2).a, 2);
  assert.ok(d1Of(I, N, 2).C1 > d1Of(I, N).C1);
});

// Round 46 final check (norms lens): the verdict stays at C1 = max(band minimum, (gn + a_e)/(gn − a_e)); with it, as
// information, the deceleration the band minimum stands for and the limit deceleration up to which D.1 holds.
test('D.1: la decelerazione del C1 minimo di ogni fascia, a = g·(C1 − 1)/(C1 + 1)', () => {
  assert.deepEqual(K.c1Bands.map(([, c]) => aOfC1(c).toFixed(2)), ['0.47', '0.68', '0.89', '1.09']);
  // the inverse of (g + a)/(g − a): at or over the band minimum, C1 of that deceleration is that C1
  for (const [top, c] of K.c1Bands) {
    near(`C1 ${c}`, c1Of(top, aOfC1(c)), c);
    near(`C1 ${c + 0.3}`, c1Of(top, aOfC1(c + 0.3)), c + 0.3);
  }
  for (const v of [0.5, 1, 1.5, 2, 3]) assert.equal(d1Of(readInputs({ ...PRESETS.C, v: String(v) } as FormValues).I, readInputs(PRESETS.C).N).aMin, aOfC1(c1Min(v)));
});

test('D.1: a_lim, la decelerazione limite — a quella decelerazione l’utilizzo è 1 (andata e ritorno)', () => {
  let seen = 0;
  for (const P of [PRESETS.A, PRESETS.B, PRESETS.C]) {
    for (const v of [0.5, 0.6, 1, 1.2, 1.6, 2]) {
      const { I, N } = readInputs({ ...P, v: String(v) } as FormValues), d = d1Of(I, N);
      // the limit C1 is the worse case's e^(f·α)/((T1/T2)·C2): the verdict at C1 is over 1 exactly when C1 is over it
      near('C1 limite', d.c1Lim, Math.min(...d.cases.map((c) => c.efa / (c.ratio * d.C2))));
      assert.equal(d.worst.util <= 1 + 1e-9, d.C1 <= d.c1Lim + 1e-12, `${v} m/s`);
      // no new verdict: C1 and the utilisation as before (a_e, the band minimum)
      assert.equal(d.C1, c1Of(I.v, I.ae));
      if (d.aLim === null) {
        assert.ok(d.c1Lim < d.c1Min, 'not even the band minimum holds');
        assert.ok(d1Of(I, N, 0).worst.util > 1);
        continue;
      }
      seen += 1;
      assert.ok(d.aLim >= d.aMin - 1e-12 && d.aLim < G);
      // the round trip: D.1 at a_lim is met with equality, a little more breaks it
      near('utilizzo a a_lim', d1Of(I, N, d.aLim).worst.util, 1, 1e-9);
      assert.ok(d1Of(I, N, d.aLim + 0.01).worst.util > 1);
      assert.equal(d1Of(I, N, d.aLim).aLim, d.aLim, 'a_lim does not depend on the a it is taken at');
    }
  }
  assert.ok(seen >= 3, `cases with a limit: ${seen}`);
});
