// Hand checks: closed forms, published cases and derivations written independently of the engine (research 10.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, compute, readInputs } from '../index';
import type { FormValues } from '../index';

const G = 9.81;
// relative tolerance on values above 1, absolute below
const near = (name: string, got: number, exp: number, tol = 1e-3): void => {
  assert.ok(Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp)), `${name}: calcolato ${got} · atteso ${exp}`);
};
const run = (V: FormValues) => { const c = readInputs(V); return { ...c, r: compute(c.I, c.N) }; };
// closed forms below use 4 ropes Ø10 (47.5 kN, 0.336 kg/m): pinned, so the checks do not follow the presets' ropes
const ROPE10 = { n_n: 4, n_d: 10, n_Fmin: 47.5, n_qf: 0.336 };

// S_f of UNI EN 81-50 5.12, written out with the division before the subtraction
const sf = (Neq: number, Dd: number): number => 10 ** (2.6834 - Math.log10((695.85e6 * Neq) / Dd ** 8.567) / Math.log10(77.09 * Dd ** -2.894));
// through the engine: top layout with a deflector, groove U (N_equiv(t) = 1) and K_p = (D/Dp)^4 = N_equiv − 1
function engineSf(NeqTarget: number, Dd: number): number {
  const V = { ...PRESETS.C, compare: false, layout: 'topDefl', alphaMode: 'manual', alphaManual: 180, n_groove: 'U', n_d: 10, n_D: 10 * Dd, nps: 0, npr: 0,
    Dp: (10 * Dd) / Math.pow(NeqTarget - 1, 1 / 4) };
  return run(V).r.ropes.SfCalc;
}

test('S_f sui casi pubblicati (liftdesign.it 16,69; Mellor)', () => {
  near('S_f liftdesign.it (N_equiv 20,898, D/d 50,9)', engineSf(20.898, 50.9), 16.69, 2e-3);
  near('S_f Mellor (N_equiv 7, D/d 40)', engineSf(7, 40), sf(7, 40), 1e-9);
  near('Mellor in forma chiusa ≈ 16,4', sf(7, 40), 16.405, 1e-3);
});

test('fattori di gola: coerenza con Mellor e forma limite', () => {
  near('f frenatura VN β 105°', run({ ...PRESETS.A, n_groove: 'VN', n_beta: 105, v: 1, r: '1' }).r.dn.f, 0.219, 3e-3);
  near('f frenatura VH γ 50°', run({ ...PRESETS.A, n_groove: 'VH', n_gamma: 50, v: 1, r: '1' }).r.dn.f, 0.215, 3e-3);
  near('f caricamento U con γ → 0 = 4·0,1/π', run({ ...PRESETS.A, n_groove: 'U', n_gamma: 0.0001 }).r.load.f, 0.4 / Math.PI, 1e-4);
});

test('esempio C in forma chiusa: tiri, squilibrio, potenza, albero, soccorso, cinematica', () => {
  const { r } = run({ ...PRESETS.C, ...ROPE10, compare: false });
  const P = 700, Q = 630, Mcw = 700 + 0.5 * 630, w = 4 * 0.336, H = 18, L0 = 2, a = 0.5;
  const T1load = (P + 1.25 * Q) * G + w * (H + L0) * G, T2load = Mcw * G + w * L0 * G;
  near('T1 caricamento', r.load.T1, T1load);
  near('T2 caricamento', r.load.T2, T2load);
  // braking down, loaded car at the bottom decelerating: masses and ropes accelerate together
  near('T1 frenatura in discesa', r.dn.T1, (P + Q) * (G + a) + w * (H + L0) * (G + a));
  near('T2 frenatura in discesa', r.dn.T2, Mcw * (G - a) + w * L0 * (G - a));
  // braking up, empty car at the top decelerating (car −a, counterweight +a)
  const Tc = P * (G - a) + w * L0 * (G - a), Tw = Mcw * (G + a) + w * (H + L0) * (G + a);
  near('rapporto frenatura in salita', r.up.ratio, Tw / Tc);
  const dF = (P + Q) * G + w * (H + L0) * G - (Mcw * G + w * L0 * G);
  near('ΔF', r.drive.dF, dF);
  near('potenza statica = ΔF·v/(η_d·η_vano)', r.drive.Pst, (dF * 1.0) / (0.7 * 0.85));
  near('albero 1,25·Q [kg] = (T1+T2)/g', r.shaft.testKg, (T1load + T2load) / G);
  const R = 0.28, i = 43;
  near('forza al volantino', r.rescue.F, (dF * R) / (i * 0.7 * 0.85) / 0.2);
  near('velocità reale', r.kin.vReal, (Math.PI * 0.56 * 1450) / (60 * 43));
  near('M_n = 9550·P/n', r.drive.Mn, (9550 * 7.5) / 1450);
  // stalled: empty car at the top, counterweight on the buffers
  near('rapporto cabina bloccata', r.stall.ratio, (P * G + w * L0 * G) / (w * (H + L0) * G));
});

test('angolo di avvolgimento dalla geometria (ricerca 5.3): 160,3°', () => {
  near('α geometrico', run({ ...PRESETS.A, alphaMode: 'geo' }).r.wa.B, 160.3, 1e-3);
});

test('tiro diretto: tangente esatta ricavata con i vettori', () => {
  // tangent point at φ + acos(R/d) from the centre, independent of the engine's formula
  const lean = (R: number, s: number, L: number): number => {
    const hx = R + s, hy = -L, th = Math.atan2(hy, hx) + Math.acos(R / Math.hypot(hx, hy));
    return Math.atan2(hx - R * Math.cos(th), R * Math.sin(th) - hy);
  };
  const wa = run({ ...PRESETS.C }).r.wa;
  near('α cabina in basso', wa.B, 180 - ((lean(0.28, 0.02, 20) + lean(0.28, 0.02, 2)) * 180) / Math.PI, 1e-9);
  near('α cabina in alto', wa.T, 180 - ((lean(0.28, 0.02, 2) + lean(0.28, 0.02, 20)) * 180) / Math.PI, 1e-9);
  near('approssimazione atan(s/L) entro 0,001°', wa.B, 180 - ((Math.atan(0.02 / 2) + Math.atan(0.02 / 20)) * 180) / Math.PI, 1e-3);
});

test('decelerazione reale del freno con la legge di Newton (η_i = 1)', () => {
  const { r } = run({ ...PRESETS.C, ...ROPE10, compare: false, n_etaI: '1' });
  const P = 700, Q = 630, Mcw = 1015, w = 4 * 0.336, H = 18, L0 = 2, R = 0.28, i = 43, Jm = 0.08, Js = 2.5, Tb = 120;
  const meq = (load: number): number => P + load + Mcw + w * (H + 2 * L0) + Js / (R * R) + Jm * (i / R) ** 2, Fb = (Tb * i) / R;
  const find = (load: 'q' | 'e', dir: 'dn' | 'up', pos: 'b' | 't') => {
    const c = r.brkReal.find((x) => x.load === load && x.dir === dir && x.pos === pos);
    assert.ok(c, `caso ${load} ${dir} ${pos}`);
    return c;
  };
  const dFe = (Mcw + w * (H + L0)) * G - (P + w * L0) * G, ae = (Fb - dFe) / meq(0);
  near('cabina vuota in salita, in alto', find('e', 'up', 't').a, ae, 1e-9);
  near('T1/T2 a quella decelerazione', find('e', 'up', 't').ratio, ((Mcw + w * (H + L0)) * (G + ae)) / ((P + w * L0) * (G - ae)), 1e-9);
  const dFq = (P + Q + w * (H + L0)) * G - (Mcw + w * L0) * G;
  near('cabina con portata in discesa, in basso', find('q', 'dn', 'b').a, (Fb - dFq) / meq(Q), 1e-9);
});

test('rendimento inverso η_i = 0,6: equilibrio dei momenti sull’albero motore', () => {
  const at = (etaI: string): number => {
    const c = run({ ...PRESETS.C, ...ROPE10, compare: false, n_etaI: etaI }).r.brkReal.find((x) => x.load === 'e' && x.dir === 'up' && x.pos === 't');
    assert.ok(c);
    return c.a;
  };
  const P = 700, Mcw = 1015, w = 4 * 0.336, H = 18, L0 = 2, R = 0.28, i = 43, Jm = 0.08, Js = 2.5, Tb = 120, eta = 0.6;
  const mls = P + Mcw + w * (H + 2 * L0) + Js / (R * R), dFe = (Mcw + w * (H + L0)) * G - (P + w * L0) * G, a = at('0.6');
  near('Tb = η_i·(ΔF + m·a)·R/i + J_m·α_m', Tb, (eta * (dFe + mls * a) * R) / i + (Jm * a * i) / R, 1e-9);
  assert.ok(a > at('1'), 'l’attrito del riduttore aumenta la decelerazione');
});

test('D/d ≥ 40 sulle pulegge di rinvio e coppia in uscita contro il catalogo', () => {
  const status = (V: FormValues, id: string): string => run(V).r.checks.find((k) => k.id === id)?.status ?? 'assente';
  assert.equal(status({ ...PRESETS.A, n_d: 10 }, 'r_ddp'), 'ok', 'Dp/d 400/10 = 40');
  assert.equal(status({ ...PRESETS.A, n_d: 11 }, 'r_ddp'), 'fail', 'Dp/d 400/11 = 36,4');
  assert.equal(status({ ...PRESETS.A, layout: 'top', nps: 0, npr: 0 }, 'r_ddp'), 'assente', 'senza pulegge nessuna verifica');
  // example B with its 4 × Ø11 ropes: 1 514 N·m in acceleration
  const { r: rB, N: NB, I: IB } = run({ ...PRESETS.B }), dB = rB.drive, R = NB.D / 2000;
  near('coppia in uscita all’accelerazione, esempio B', dB.MpAcc, 1514, 1e-3);
  // emergency braking with the real brake (both sets): the ropes' pull difference on the sheave and the slow shaft's own
  // inertia decelerated, M = (T1 − T2)·R + J_s·a·r/R — the largest of the real brake's cases
  const brake = (c: { T1: number; T2: number; aEff: number }): number => (c.T1 - c.T2) * R + (NB.Js * c.aEff * IB.r) / R;
  near('coppia in uscita alla frenatura di emergenza', dB.MpBrake, Math.max(...rB.brkReal.map(brake)), 1e-9);
  near('esempio B: frenatura (20 031 − 4 261) N · 0,28 m + 2,5 · 4,94 / 0,28', dB.MpBrake, 4460, 1e-3);
  // the static test at 1,25·Q: the pull difference only
  near('coppia in uscita alla prova statica', dB.MpTest, Math.max(...rB.loadCases.map((c) => (c.T1 - c.T2) * R)), 1e-9);
  assert.ok(dB.MpBrake > 2.5 * dB.MpAcc, 'la frenatura di emergenza domina: quasi 3 volte l’accelerazione');
  near('coppia in uscita: la più grande delle tre', dB.MpMax, Math.max(dB.MpAcc, dB.MpBrake, dB.MpTest), 1e-12);
  assert.equal(status({ ...PRESETS.B, n_MpCat: '2000' }, 'd_mp'), 'fail', 'sopra l’accelerazione, sotto la frenatura: KO');
  assert.equal(status({ ...PRESETS.B, n_MpCat: '6000' }, 'd_mp'), 'ok');
  assert.equal(status({ ...PRESETS.B, n_MpCat: '' }, 'd_mp'), 'assente');
});

test('esempio B della ricerca (capitolo 7.3): funi 4 × Ø11 come le esistenti', () => {
  const { r, N } = run({ ...PRESETS.B });
  assert.deepEqual([N.n, N.d], [4, 11], 'le funi nuove seguono quelle esistenti');
  near('D/d', r.ropes.Dd, 50.9, 1e-3);
  near('frenatura a vuoto in salita', r.up.util, 1.005, 1e-3);
  assert.equal(r.checks.find((c) => c.id === 'tr_up')?.status, 'fail', '1,005 > 1: KO');
  near('aderenza alla decelerazione reale', r.real.util, 4.17, 1e-3);
  near('decelerazione reale', r.real.aEff, 5.54, 1e-3);
  near('sollevamento netto', r.shaft.uplift ?? NaN, 2010, 1e-3);
});

test('pressione specifica nella gola (UNI 10411-1:2024, D.2): forma chiusa e limite con la velocità della fune', () => {
  const { r, N, I } = run({ ...PRESETS.A });
  const { T, p, limit } = r.ropes.press;
  // example A: 4 × Ø10 on Ø560, U undercut β 90°: 8·cos 45° / (π − π/2 − sin 90°) = 9,910
  assert.deepEqual([N.n, N.d, N.D, N.groove.type, N.groove.beta], [4, 10, 560, 'UU', 90]);
  const b = Math.PI / 2, fU = (8 * Math.cos(b / 2)) / (Math.PI - b - Math.sin(b));
  near('fattore della gola U con intaglio β 90°', fU, 9.910, 1e-3);
  near('p = T/(n·d·D) · 8 cos(β/2)/(π − β − sin β)', p, (T / (4 * 10 * 560)) * fU, 1e-12);
  near('esempio A: p', p, 5.89, 1e-3);
  // limit (12,5 + 4·vc)/(1 + vc), vc = v·r = 1 m/s: 8,25 N/mm²
  near('limite a vc = 1 m/s', limit, (12.5 + 4 * I.v * I.r) / (1 + I.v * I.r), 1e-12);
  near('limite 8,25', limit, 8.25, 1e-12);
  assert.equal(r.checks.find((c) => c.id === 'g_press')?.status, 'info', 'sotto il limite: informativa');
  // U without undercut: 8/π; hardened V γ 35°: 4,5/sin 17,5° — the V groove presses harder
  const pU = run({ ...PRESETS.A, n_groove: 'U' }).r.ropes.press.p, pV = run({ ...PRESETS.A, n_groove: 'VH', n_gamma: 35 }).r.ropes.press.p;
  near('gola U', pU, (T / (4 * 10 * 560)) * (8 / Math.PI), 1e-9);
  near('gola V', pV, (T / (4 * 10 * 560)) * (4.5 / Math.sin((17.5 * Math.PI) / 180)), 1e-9);
  assert.ok(pV > p && p > pU);
  // over the limit: a warning (the standard's informative appendix), never a KO
  const fast = run({ ...PRESETS.A, n_groove: 'VH', n_gamma: 35, v: 2.5 }).r;
  assert.ok(fast.ropes.press.p > fast.ropes.press.limit);
  assert.equal(fast.checks.find((c) => c.id === 'g_press')?.status, 'warn');
});
