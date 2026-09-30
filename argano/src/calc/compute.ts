// Verification of one machine on one installation (research chapters 4 and 5). Pure and deterministic: the same
// inputs give the same numbers, bit for bit, in the browser and on the server.
import { K } from './norme';
import { G, deg, rad, ratio } from './math';
import { grooveF, neqT } from './groove';
import { wrapAngles } from './geometry';
import type {
  BrakeCase, BrakeResult, BrakeWindow, Check, CheckId, CheckStatus, DriveResult, EndPosition, Kinematics, Levers,
  Machine, Plant, Results, RopesResult, SensitivityVariant, ShaftResult, StallCase, TractionCase,
} from './types';

/** A rope segment of length L going up (1) or down (−1) from the load towards the sheave, or a diverting pulley. */
type Segment = readonly ['s', number, 1 | -1] | readonly ['p'];
interface RopePath { car: readonly Segment[]; cwt: readonly Segment[] }
interface End { pos: EndPosition; p: RopePath; alpha: number }

const worst = <T extends { util: number }>(list: readonly T[]): T => list.reduce((a, b) => (b.util > a.util ? b : a));

export function compute(I: Plant, M: Machine): Results {
  const Q = I.Q, P = I.P, r = I.r;
  const k = I.qeq > 0 ? I.qeq / Q : I.k;
  const Mcw = P + k * Q;
  const wa = wrapAngles(I, M), alphaB = rad(wa.B), alphaT = rad(wa.T);
  const w = M.n * M.qf;
  const pulleys = I.layout === 'top' ? [] : I.layout === 'topDefl' ? [1] : [1, 1];
  const Rp = I.Dp / 2000;
  const path = (carAtBottom: boolean): RopePath => {
    const Lc = carAtBottom ? I.H + I.L0 : I.L0, Lw = carAtBottom ? I.L0 : I.H + I.L0;
    if (I.layout === 'top') return { car: [['s', Lc, 1]], cwt: [['s', Lw, 1]] };
    if (I.layout === 'topDefl') return { car: [['s', Lc, 1]], cwt: [['s', Lw, 1], ['p'], ['s', I.h, 1]] };
    return { car: [['s', Lc, 1], ['p'], ['s', I.Hv, -1]], cwt: [['s', Lw, 1], ['p'], ['s', I.Hv, -1]] };
  };
  // pull at the sheave: the hanging mass accelerating upwards with aUp, then each rope segment and pulley on the way
  const walk = (mass: number, aUp: number, els: readonly Segment[]): number => {
    let T = (mass * (G + aUp)) / r;
    const aw = r * aUp;
    for (const e of els) {
      if (e[0] === 's') { const m = w * e[1]; T = e[2] > 0 ? T + m * (G + aw) : T - m * (G - aw); }
      else T += (I.Jp * aw) / (Rp * Rp);
      if (T < 0) T = 0;
    }
    return T;
  };
  const pB = path(true), pT = path(false);
  // the two end positions of the car, each with its rope path and wrap angle
  const eB: End = { pos: 'b', p: pB, alpha: alphaB }, eT: End = { pos: 't', p: pT, alpha: alphaT }, ends = [eB, eT];
  const alphaDeg = Math.min(wa.B, wa.T);
  // inertia referred to the motor shaft: moving masses, ropes, traction sheave and pulleys
  const R = M.D / 2000;
  const ropeLen = I.layout === 'top' ? I.H + 2 * I.L0 : I.layout === 'topDefl' ? I.H + 2 * I.L0 + I.h : I.H + 2 * I.L0 + 2 * I.Hv;
  const Jpul = pulleys.length * I.Jp * Math.pow(M.D / I.Dp, 2);
  const Jext = (load: number): number => (P + load + Mcw) * Math.pow(R / (r * M.i), 2) + w * ropeLen * Math.pow(R / M.i, 2) + (M.Js + Jpul) / (M.i * M.i);
  // static unbalance at the sheave: car side minus counterweight side [N]
  const unbalance = (load: number, e: End): number => walk(P + load, 0, e.p.car) - walk(Mcw, 0, e.p.cwt);

  // traction, car loading: 1.25·Q, static, both end positions
  const muL = K.muLoading, fL = grooveF(muL, M.groove, 'loading');
  const loadCases: TractionCase[] = ends.map((e) => {
    const Tc = walk(P + K.loadTestFactor * Q, 0, e.p.car), Tw = walk(Mcw, 0, e.p.cwt), efa = Math.exp(fL * e.alpha), q = ratio(Tc, Tw);
    return { pos: e.pos, alpha: e.alpha, mu: muL, f: fL, efa, T1: Math.max(Tc, Tw), T2: Math.min(Tc, Tw), ratio: q, util: q / efa };
  });
  const load = worst(loadCases);

  // traction, emergency braking (UNI EN 81-50 5.11.2.2.2): empty and loaded car, moving down and up, at both end
  // positions. The standard's check uses its minimum deceleration; a second pass uses the deceleration the brake
  // really gives with all its sets (never below that minimum).
  const Tb = M.brakeNm * M.brakeSets;
  const vf = I.v * r, muB = K.muBrakingBase / (1 + vf / K.muBrakingSpeed), fB = grooveF(muB, M.groove, 'braking');
  // car deceleration for a total brake torque tb on the motor shaft; tg = torque of the unbalance at the sheave, > 0
  // when it drives the motion. Slow side driving the gear: reverse efficiency η_i; motor side driving it: η_d.
  const brakeDecel = (tb: number, tg: number, load: number): number => {
    const i = M.i, Jls = Jext(load) * i * i;
    let beta = (tb - (M.etaI * tg) / i) / (M.Jm * i + (M.etaI * Jls) / i);
    if (tg + Jls * beta < 0) {
      beta = (M.etaD * i * tb - tg) / (Jls + M.etaD * M.Jm * i * i);
      if (M.Jm * i * beta < tb) beta = (tb - tg / i) / (M.Jm * i + Jls / i); // between the two regimes: friction left out
    }
    return (beta * R) / r;
  };
  // tb null: the minimum deceleration of the standard; a number: the brake's own deceleration with that total torque
  const brakeCase = (load: number, e: End, dir: 1 | -1, tb: number | null, ub: number): BrakeCase => {
    const a = tb == null ? I.ae : brakeDecel(tb, dir * ub * R, load), aEff = Math.max(I.ae, a);
    const aUp = dir * aEff; // a car moving down (dir 1) decelerates upwards
    const Tc = walk(P + load, aUp, e.p.car), Tw = walk(Mcw, -aUp, e.p.cwt), efa = Math.exp(fB * e.alpha), q = ratio(Tc, Tw);
    return { load: load > 0 ? 'q' : 'e', pos: e.pos, dir: dir > 0 ? 'dn' : 'up', a, aEff, fromBrake: tb != null && a > I.ae,
      alpha: e.alpha, mu: muB, f: fB, efa, T1: Math.max(Tc, Tw), T2: Math.min(Tc, Tw), ratio: q, util: q / efa };
  };
  const brakeCases = (tb: number | null): BrakeCase[] => [Q, 0].flatMap((load) => ends.flatMap((e) => {
    const ub = tb == null ? 0 : unbalance(load, e);
    return ([1, -1] as const).map((dir) => brakeCase(load, e, dir, tb, ub));
  }));
  const brk = brakeCases(null);
  const dn = worst(brk.filter((c) => c.dir === 'dn'));
  const up = worst(brk.filter((c) => c.dir === 'up'));
  const brkReal = brakeCases(Tb);
  const real = worst(brkReal);
  const brakeUtil = (tb: number): number => Math.max(...brakeCases(tb).map((c) => c.util));

  // traction, car stalled: counterweight on its buffers (car at the top), empty car, machine turning upwards
  let stall: StallCase;
  {
    const mu = K.muStalled, f = grooveF(mu, M.groove, 'stalled'), efa = Math.exp(f * alphaT);
    const Tc = walk(P, 0, pT.car), Tw = walk(0, 0, pT.cwt);
    stall = { alpha: alphaT, mu, f, efa, T1: Math.max(Tc, Tw), T2: Math.min(Tc, Tw), ratio: ratio(Tc, Tw) };
  }

  // ropes. Bends (UNI EN 81-50 5.12) counted from the layout: the deflector (a reverse bend when the rope wraps it
  // from the inside), the two pulleys at the top for a bottom machine, one car and one counterweight pulley for 2:1;
  // plus the extra pulleys entered
  let ropes: RopesResult;
  {
    const rev = wa.reverse ? 1 : 0;
    const nps = I.nps + (I.layout === 'topDefl' ? 1 - rev : I.layout === 'bottom' ? 2 : 0) + (r === 2 ? 2 : 0), npr = I.npr + rev;
    const Dd = M.D / M.d, nq = neqT(M.groove);
    const Kp = nps + npr > 0 ? Math.pow(M.D / I.Dp, K.kpExponent) : 0, NeqP = Kp * (nps + K.reverseBendWeight * npr), Neq = nq.v + NeqP;
    const a = Math.log10((K.sfC1 * Neq) / Math.pow(Dd, K.sfE1)), b = Math.log10(K.sfC2 * Math.pow(Dd, K.sfE2));
    const SfCalc = Math.pow(10, K.sfC0 - a / b), SfMin = M.n >= 3 ? K.sfMin3 : K.sfMin2, SfReq = Math.max(SfCalc, SfMin);
    const Tmax = (I.layout === 'bottom' ? walk(P + Q, 0, pB.car.slice(0, 1)) : walk(P + Q, 0, pB.car)) / M.n;
    // diverting pulleys (layout or bends entered): their D/d counts too
    const DpD = nps + npr > 0 ? I.Dp / M.d : null;
    ropes = { Dd, DpD, nps, npr, NeqT: nq.v, neqVerified: nq.verified, Kp, NeqP, Neq, SfCalc, SfMin, SfReq, Tmax, SfAct: (M.Fmin * 1000) / Tmax };
  }

  // kinematics
  let kin: Kinematics;
  {
    const Dm = M.D / 1000, nS = (60 * vf) / (Math.PI * Dm);
    const vReal = (Math.PI * Dm * M.nm) / (60 * M.i * r), ns = (120 * M.fn) / M.poles;
    kin = { nS, iIdeal: M.nm / nS, vReal, dev: vReal / I.v - 1, fRated: (M.fn * I.v) / vReal, ns, slip: (ns - M.nm) / ns };
  }

  // drive: the heavier of loaded car up from the bottom and empty car down from the top
  const eta = M.etaD * I.etaShaft;
  const dF = unbalance(Q, eB), dFe = -unbalance(0, eT);
  let drive: DriveResult;
  {
    const Mn = (9550 * M.Pn) / M.nm, aM = (I.aDesign * r * M.i) / R;
    const run = (dFx: number, load: number) => {
      const Ms = dFx * R, MmSt = Ms / (M.i * eta), J = Jext(load);
      return { dF: dFx, Ms, MmSt, Pst: (dFx * I.v * r) / eta, Macc: MmSt + (J * aM) / eta + M.Jm * aM, MpMax: Ms + J * M.i * aM };
    };
    const upRun = run(dF, Q), dnRun = run(dFe, 0), g = dnRun.Pst > upRun.Pst ? dnRun : upRun, Macc = Math.max(upRun.Macc, dnRun.Macc);
    drive = { dF: g.dF, Ms: g.Ms, MmSt: g.MmSt, Pst: g.Pst, empty: g === dnRun, Pbal: ((1 - k) * Q * G * I.v) / eta, Mn,
      Macc, accRatio: Macc / Mn, MpMax: Math.max(upRun.MpMax, dnRun.MpMax), powerUtil: g.Pst / (M.Pn * 1000) };
  }

  // brake requirements (the gear's friction helps the brake: not counted)
  let brake: BrakeResult;
  {
    const kB = (r * M.i) / R;
    const req = (dFx: number, load: number): number => (Math.abs(dFx) * R) / M.i + (M.Jm + Jext(load)) * I.aBrake * kB;
    const hard = brkReal.reduce((a, b) => (b.a > a.a ? b : a));
    brake = { all: req(unbalance(K.loadTestFactor * Q, eB), K.loadTestFactor * Q), one: req(dF, Q), up: req(dFe, 0), avail: Tb, perSet: M.brakeNm,
      sets: M.brakeSets, aMax: hard.a, aMaxCase: hard };
  }

  // manual rescue: car with rated load moved upwards from the bottom
  const rescueM = (dF * R) / (M.i * M.etaD * I.etaShaft);
  const rescue = { M: rescueM, F: rescueM / I.rh };

  let shaft: ShaftResult;
  {
    const res = (a: number, b: number): number => Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(Math.PI - alphaB));
    const Tct = walk(P + K.loadTestFactor * Q, 0, pB.car), Tw = walk(Mcw, 0, pB.cwt);
    const testKg = res(Tct, Tw) / G;
    shaft = { testKg, up: I.layout === 'bottom', uplift: I.layout === 'bottom' ? testKg - M.mass : null };
  }

  // levers when braking traction fails (worst case)
  let levers: Levers | undefined;
  {
    const wc = dn.util >= up.util ? dn : up;
    if (wc.util > 1 && Number.isFinite(wc.ratio)) {
      const need = Math.log(wc.ratio), lv: Levers = { need, alphaMin: deg(need / wc.f) };
      if (M.groove.type === 'UU' || M.groove.type === 'U' || M.groove.type === 'VN') {
        const type = M.groove.type === 'VN' ? 'VN' : 'UU';
        for (let b = Math.max(M.groove.type === 'U' ? 0 : M.groove.beta, 0); b <= K.betaMax; b += 0.1) {
          if (grooveF(wc.mu, { type, beta: b, gamma: M.groove.gamma }, 'braking') * wc.alpha >= need) { lv.betaMin = b; break; }
        }
      } else {
        for (let g = M.groove.gamma; g >= K.gammaMin; g -= 0.1) {
          if (grooveF(wc.mu, { ...M.groove, gamma: g }, 'braking') * wc.alpha >= need) { lv.gammaMax = g; break; }
        }
      }
      levers = lv;
    }
  }

  // checks
  const C: Check[] = [];
  const add = (id: CheckId, status: CheckStatus, value: number | null, limit: number | null, util: number | null, dec = 3,
    cs: TractionCase | BrakeCase | null = null): void => { C.push({ id, status, value, limit, util, dec, cs }); };
  const trac = (u: number): CheckStatus => (u <= 1 ? (u > K.tractionWarn ? 'warn' : 'ok') : 'fail');
  add('tr_load', trac(load.util), load.ratio, load.efa, load.util, 3, load);
  add('tr_dn', trac(dn.util), dn.ratio, dn.efa, dn.util, 3, dn);
  add('tr_up', trac(up.util), up.ratio, up.efa, up.util, 3, up);
  add('tr_real', real.util <= K.tractionWarn ? 'ok' : 'warn', real.ratio, real.efa, real.util, 3, real);
  add('tr_stall', stall.ratio >= stall.efa ? 'ok' : 'fail', stall.ratio, stall.efa, stall.efa / stall.ratio);
  add('r_dd', ropes.Dd >= K.ddMin ? 'ok' : 'fail', ropes.Dd, K.ddMin, K.ddMin / ropes.Dd, 1);
  if (ropes.DpD != null) add('r_ddp', ropes.DpD >= K.ddMin ? 'ok' : 'fail', ropes.DpD, K.ddMin, K.ddMin / ropes.DpD, 1);
  add('r_nd', M.n < K.ropesMin || M.d < K.ropeDiameterMin ? 'fail' : 'ok', M.n, K.ropesMin, null, 0);
  {
    const g = M.groove, hasBeta = g.type === 'UU' || g.type === 'VN', hasV = g.type === 'VH' || g.type === 'VN';
    const st: CheckStatus = (hasBeta && g.beta > K.betaMax) || (hasV && g.gamma < K.gammaMin) ? 'fail' : hasBeta && g.beta > K.betaRecommended ? 'warn' : 'ok';
    add('g_geom', st, g.type === 'U' ? null : hasBeta ? g.beta : g.gamma, null, null, 1);
  }
  add('r_sfa', ropes.SfAct >= ropes.SfReq ? 'ok' : 'fail', ropes.SfAct, ropes.SfReq, ropes.SfReq / ropes.SfAct, 2);
  add('d_pst', drive.powerUtil <= 1 ? 'ok' : 'fail', drive.Pst / 1000, M.Pn, drive.powerUtil, 2);
  add('d_ratio', drive.accRatio > K.accelTorqueRatioMax ? 'warn' : 'info', drive.accRatio, null, null, 2);
  if (M.MpCat > 0) add('d_mp', drive.MpMax <= M.MpCat ? (drive.MpMax / M.MpCat > K.nearLimit ? 'warn' : 'ok') : 'fail', drive.MpMax, M.MpCat, drive.MpMax / M.MpCat, 0);
  if (M.shaftMax > 0) add('s_shaft', shaft.testKg <= M.shaftMax ? (shaft.testKg / M.shaftMax > K.nearLimit ? 'warn' : 'ok') : 'fail', shaft.testKg, M.shaftMax, shaft.testKg / M.shaftMax, 0);
  add('b_sets', M.brakeSets >= K.brakeSetsMin ? 'ok' : 'fail', M.brakeSets, K.brakeSetsMin, null, 0);
  add('b_all', brake.avail >= brake.all ? 'ok' : 'fail', brake.all, brake.avail, brake.all / brake.avail, 1);
  if (M.brakeSets >= K.brakeSetsMin) {
    add('b_one', brake.perSet >= brake.one ? 'ok' : 'fail', brake.one, brake.perSet, brake.one / brake.perSet, 1);
    add('b_up', brake.perSet >= brake.up ? 'ok' : 'fail', brake.up, brake.perSet, brake.up / brake.perSet, 1);
  }
  add('b_amax', brake.aMax <= K.brakeDecelMax ? 'ok' : 'warn', brake.aMax, K.brakeDecelMax, brake.aMax / K.brakeDecelMax, 2, brake.aMaxCase);
  add('s_force', rescue.F <= K.rescueForceMax ? 'ok' : 'warn', rescue.F, K.rescueForceMax, rescue.F / K.rescueForceMax, 0);
  if (shaft.up) add('s_uplift', shaft.uplift != null && shaft.uplift > 0 ? 'warn' : 'ok', shaft.uplift, null, null, 0);

  return {
    M, k, Mcw, alphaDeg, wa, loadCases, load, brk, dn, up, brkReal, real, brakeCasesAt: brakeCases, brakeUtil, stall,
    ropes, kin, drive, brake, rescue, shaft, ...(levers ? { levers } : {}), checks: C, fails: C.filter((c) => c.status === 'fail'),
  };
}

/**
 * Admissible total brake torque: from the UNI EN 81-20 requirements (every set alone, all sets with 1.25·Q) up to
 * the largest torque that keeps traction in every emergency-braking case. hi null: none keeps traction.
 */
export function brakeWindow(res: Results): BrakeWindow {
  const b = res.brake, lo = Math.max(b.all, b.sets >= K.brakeSetsMin ? b.sets * Math.max(b.one, b.up) : 0);
  const ok = (tb: number): boolean => res.brakeUtil(tb) <= 1;
  if (!ok(lo)) return { lo, hi: null, sets: b.sets };
  let good = lo, bad = Math.max(2 * lo, lo + 10);
  while (ok(bad)) {
    good = bad; bad *= 2;
    if (bad > 1e6) return { lo, hi: Infinity, sets: b.sets };
  }
  for (let j = 0; j < 40; j++) { const m = (good + bad) / 2; if (ok(m)) good = m; else bad = m; }
  return { lo, hi: good, sets: b.sets };
}

/**
 * Sensitivity (research 8.9): the checks again with the car mass at ±10 % and, when the balance is not measured,
 * with the balance at ±0.05. changed: the checks whose pass/fail differs from the result with the data entered.
 */
export function sensitivity(I: Plant, M: Machine, res: Results): SensitivityVariant[] {
  const variants: [SensitivityVariant['key'], number][] = [['P', -K.sensP], ['P', K.sensP], ...(I.qeq > 0 ? [] : [['k', -K.sensK], ['k', K.sensK]] as [SensitivityVariant['key'], number][])];
  return variants.map(([key, d]) => {
    const r = compute(key === 'P' ? { ...I, P: I.P * (1 + d) } : { ...I, k: Math.min(1, Math.max(0, I.k + d)) }, M);
    const changed = r.checks.filter((c) => {
      const c0 = res.checks.find((x) => x.id === c.id);
      return !c0 || (c0.status === 'fail') !== (c.status === 'fail');
    });
    return { key, d, r, changed };
  });
}
