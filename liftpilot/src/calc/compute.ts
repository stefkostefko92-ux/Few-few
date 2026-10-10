// Verification of one machine on one installation (research chapters 4 and 5). Pure and deterministic: the same
// inputs give the same numbers, bit for bit, in the browser and on the server.
import { K } from './norme';
import { G, deg, rad, ratio } from './math';
import { grooveF, neqT } from './groove';
import { wrapAngles } from './geometry';
import { ropeModel, type RopePath } from './model';
import type {
  BrakeCase, BrakeResult, BrakeWindow, Check, CheckId, CheckStatus, DriveResult, EndPosition, Kinematics, Levers,
  Machine, Plant, Results, RopesResult, SensitivityVariant, ShaftResult, StallCase, TractionCase,
} from './types';

interface End { pos: EndPosition; p: RopePath; alpha: number }

const worst = <T extends { util: number }>(list: readonly T[]): T => list.reduce((a, b) => (b.util > a.util ? b : a));

/** The load in the car of an emergency braking case [kg]: the rated one, none, or the acceptance test's 1,25·Q (UNI EN
 *  81-20:2020, 6.3.3 b)). The verification and the simulation take it from here. */
export const brakeLoad = (kind: BrakeCase['load'], Q: number): number => (kind === 'q' ? Q : kind === 'q125' ? K.loadTestFactor * Q : 0);

export function compute(I: Plant, M: Machine): Results {
  const Q = I.Q, P = I.P, r = I.r;
  // masses, rope paths, the pull at the sheave, the inertia and the brake's deceleration (model.ts)
  const { k, Mcw, R, path, walk, Jext, brakeDecel } = ropeModel(I, M);
  const wa = wrapAngles(I, M), alphaB = rad(wa.B), alphaT = rad(wa.T);
  const pB = path(true), pT = path(false);
  // the two end positions of the car, each with its rope path and wrap angle
  const eB: End = { pos: 'b', p: pB, alpha: alphaB }, eT: End = { pos: 't', p: pT, alpha: alphaT }, ends = [eB, eT];
  const alphaDeg = Math.min(wa.B, wa.T);
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
  // really gives with all its sets (never below that minimum), and predicts the acceptance test: with it also the car
  // with 1,25·Q moving down toward the bottom of the travel (UNI EN 81-20:2020, 6.3.3 b); its a) is the empty car up
  // at the top, among the cases already).
  const Tb = M.brakeNm * M.brakeSets;
  const vf = I.v * r, muB = K.muBrakingBase / (1 + vf / K.muBrakingSpeed), fB = grooveF(muB, M.groove, 'braking');
  // tb null: the minimum deceleration of the standard; a number: the brake's own deceleration with that total torque
  // phys: the rope from a bottom machine to the top at its own acceleration (model.ts), for the remark tr_msr1
  const brakeCase = (load: number, kind: BrakeCase['load'], e: End, dir: 1 | -1, tb: number | null, ub: number, phys = false): BrakeCase => {
    const a = tb == null ? I.ae : brakeDecel(tb, dir * ub * R, load), aEff = Math.max(I.ae, a);
    const aUp = dir * aEff; // a car moving down (dir 1) decelerates upwards
    const Tc = walk(P + load, aUp, e.p.car, phys), Tw = walk(Mcw, -aUp, e.p.cwt, phys), efa = Math.exp(fB * e.alpha), q = ratio(Tc, Tw);
    return { load: kind, pos: e.pos, dir: dir > 0 ? 'dn' : 'up', a, aEff, fromBrake: tb != null && a > I.ae,
      alpha: e.alpha, mu: muB, f: fB, efa, T1: Math.max(Tc, Tw), T2: Math.min(Tc, Tw), ratio: q, util: q / efa };
  };
  const brakeCases = (tb: number | null, phys = false): BrakeCase[] => {
    const design = (['q', 'e'] as const).flatMap((kind) => ends.flatMap((e) => {
      const load = brakeLoad(kind, Q), ub = tb == null ? 0 : unbalance(load, e);
      return ([1, -1] as const).map((dir) => brakeCase(load, kind, e, dir, tb, ub, phys));
    }));
    if (tb == null) return design;
    const test = brakeLoad('q125', Q);
    return [...design, brakeCase(test, 'q125', eB, 1, tb, unbalance(test, eB), phys)];
  };
  const brk = brakeCases(null);
  const msr1 = I.layout === 'bottom' && r > 1 ? worst(brakeCases(null, true)) : null;
  const dn = worst(brk.filter((c) => c.dir === 'dn'));
  const up = worst(brk.filter((c) => c.dir === 'up'));
  const brkReal = brakeCases(Tb);
  const real = worst(brkReal);
  const brakeUtil = (tb: number): number => Math.max(...brakeCases(tb).map((c) => c.util));

  // traction, stalled (UNI EN 81-50 5.11.2.2.3), empty car: at the top the counterweight rests on its buffers and the
  // machine turning upwards must not lift the car; at the bottom the car rests on its buffers and the machine turning
  // downwards must not lift the counterweight
  const stalled = (e: End): StallCase => {
    const mu = K.muStalled, f = grooveF(mu, M.groove, 'stalled'), efa = Math.exp(f * e.alpha), top = e.pos === 't';
    const Tc = walk(top ? P : 0, 0, e.p.car), Tw = walk(top ? 0 : Mcw, 0, e.p.cwt);
    return { pos: e.pos, alpha: e.alpha, mu, f, efa, T1: Math.max(Tc, Tw), T2: Math.min(Tc, Tw), ratio: ratio(Tc, Tw) };
  };
  const stall = stalled(eT), stallLow = stalled(eB);

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
    ropes = { Dd, DpD, nps, npr, NeqT: nq.v, neqVerified: nq.verified, Kp, NeqP, Neq, SfCalc, SfMin, SfReq, Tmax, SfAct: (M.Fmin * 1000) / Tmax, press: groovePressure(I, M, walk(P + Q, 0, pB.car)) };
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
    // a machine faster than the rated speed has the drive turn the motor under its base frequency, where its torque is
    // the limit: the static power at its rated speed for the static torque (registry azionamento.potenza)
    const Peq = g.Pst * Math.max(1, kin.vReal / I.v);
    // the output shaft's torque (registry azionamento.coppia.uscita): in acceleration; at the emergency braking with the
    // real brake (the test with 1,25·Q moving down among its cases), the ropes' pull difference on the sheave and the
    // sheave's own inertia the gear decelerates (r·a/R), both taken with the same sense, on the safe side; at the test
    // with 1,25·Q, static
    const MpAcc = Math.max(upRun.MpMax, dnRun.MpMax), mpBrake = (c: BrakeCase): number => (c.T1 - c.T2) * R + (M.Js * c.aEff * r) / R;
    const MpBrakeCase = brkReal.reduce((a, b) => (mpBrake(b) > mpBrake(a) ? b : a)), MpBrake = mpBrake(MpBrakeCase);
    const MpTest = Math.max(...loadCases.map((c) => (c.T1 - c.T2) * R));
    drive = { dF: g.dF, Ms: g.Ms, MmSt: g.MmSt, Pst: g.Pst, Peq, empty: g === dnRun, Pbal: ((1 - k) * Q * G * I.v) / eta, Mn,
      Macc, accRatio: Macc / Mn, MpAcc, MpBrake, MpBrakeCase, MpTest, MpMax: Math.max(MpAcc, MpBrake, MpTest), powerUtil: Peq / (M.Pn * 1000) };
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

  // manual rescue: car with rated load moved upwards from the bottom (F); to a landing with the car loaded in (k ± 0.1)·Q,
  // against the unbalance, from either end (Fa: UNI EN 81-20:2020, 5.9.2.3.1 a))
  const rescueM = (dF * R) / (M.i * M.etaD * I.etaShaft);
  const band = [Math.max(0, k - K.rescueLoadBand) * Q, (k + K.rescueLoadBand) * Q];
  const Fa = Math.max(...band.flatMap((l) => ends.map((e) => (Math.abs(unbalance(l, e)) * R) / (M.i * M.etaD * I.etaShaft) / I.rh)));
  const rescue = { M: rescueM, F: rescueM / I.rh, Fa };

  let shaft: ShaftResult;
  {
    const res = (a: number, b: number): number => Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(Math.PI - alphaB));
    const Tct = walk(P + K.loadTestFactor * Q, 0, pB.car), Tw = walk(Mcw, 0, pB.cwt);
    const testKg = res(Tct, Tw) / G, ratedKg = res(walk(P + Q, 0, pB.car), Tw) / G;
    shaft = { testKg, ratedKg, up: I.layout === 'bottom', uplift: I.layout === 'bottom' ? testKg - M.mass : null };
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
  {
    // not passed: with the machine to UNI EN 81-20 and an electric safety device stopping it (5.5.3 c) 2)) a remark to
    // document, never OK; to UNI EN 81-1 (9.3 c)) no alternative
    const bind = stallLow.efa / stallLow.ratio > stall.efa / stall.ratio ? stallLow : stall, u = bind.efa / bind.ratio;
    add('tr_stall', u <= 1 ? 'ok' : I.stallDevice && I.std === 'en81-20' ? 'warn' : 'fail', bind.ratio, bind.efa, u);
  }
  if (msr1) add('tr_msr1', msr1.util <= 1 ? 'info' : 'warn', msr1.ratio, msr1.efa, msr1.util, 3, msr1);
  add('r_dd', ropes.Dd >= K.ddMin ? 'ok' : 'fail', ropes.Dd, K.ddMin, K.ddMin / ropes.Dd, 1);
  if (ropes.DpD != null) add('r_ddp', ropes.DpD >= K.ddMin ? 'ok' : 'fail', ropes.DpD, K.ddMin, K.ddMin / ropes.DpD, 1);
  add('r_nd', M.n < K.ropesMin || M.d < K.ropeDiameterMin ? 'fail' : 'ok', M.n, K.ropesMin, null, 0);
  if (M.n === K.ropesMin) add('r_two', 'info', M.n, null, null, 0);
  {
    // the arc of the wrap under the horizontal through the axis (UNI EN 81-20:2020, 5.5.7.2): a bottom machine's ropes
    // wrap the sheave from below; over a diverting pulley a wrap past 180° goes under it by as much
    const wrap = Math.max(wa.B, wa.T), below = I.layout === 'bottom' ? Math.min(wrap, 180) : Math.max(0, wrap - 180);
    if (below > K.retainBelow && wrap > K.retainWrap) add('g_retain', 'info', wrap, K.retainWrap, null, 1);
  }
  if (I.v > K.vCompGuided) add('v_comp', I.v > K.vCompRopes ? 'fail' : 'warn', I.v, I.v > K.vCompRopes ? K.vCompRopes : K.vCompGuided, null, 2);
  {
    const g = M.groove, hasBeta = g.type === 'UU' || g.type === 'VN', hasV = g.type === 'VH' || g.type === 'VN';
    // semicircular grooves: the standard recommends γ ≥ 25° (a warning); the angle is shown when it is the only remark
    const lowU = !hasV && g.gamma < K.gammaMinU, betaRemark = hasBeta && g.beta > K.betaRecommended;
    const st: CheckStatus = (hasBeta && g.beta > K.betaMax) || (hasV && g.gamma < K.gammaMin) ? 'fail' : betaRemark || lowU ? 'warn' : 'ok';
    add('g_geom', st, lowU && !betaRemark ? g.gamma : g.type === 'U' ? null : hasBeta ? g.beta : g.gamma, null, null, 1);
  }
  // the specific pressure in the grooves (UNI 10411-1:2024, D.2): a value to state, binding only with the minimum safety
  // factors in place of the calculation of UNI EN 81-50 (14.1 c)–d)); over its limit a remark
  add('g_press', ropes.press.p <= ropes.press.limit ? 'info' : 'warn', ropes.press.p, ropes.press.limit, ropes.press.p / ropes.press.limit, 2);
  add('r_sfa', ropes.SfAct >= ropes.SfReq ? 'ok' : 'fail', ropes.SfAct, ropes.SfReq, ropes.SfReq / ropes.SfAct, 2);
  add('d_pst', drive.powerUtil <= 1 ? 'ok' : 'fail', drive.Peq / 1000, M.Pn, drive.powerUtil, 2);
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
  if (I.std === 'en81-20') {
    add('s_fa', rescue.Fa <= K.rescueForceMech ? 'ok' : 'warn', rescue.Fa, K.rescueForceMech, rescue.Fa / K.rescueForceMech, 0);
    if (M.etaI <= 0) add('s_gravity', 'info', null, null, null, 0);
  }
  if (shaft.up) add('s_uplift', shaft.uplift != null && shaft.uplift > 0 ? 'warn' : 'ok', shaft.uplift, null, null, 0);

  return {
    M, k, Mcw, alphaDeg, wa, loadCases, load, brk, dn, up, brkReal, real, ...(msr1 ? { msr1 } : {}), brakeCasesAt: brakeCases, brakeUtil, stall, stallLow,
    ropes, kin, drive, brake, rescue, shaft, ...(levers ? { levers } : {}), checks: C, fails: C.filter((c) => c.status === 'fail'),
  };
}

/**
 * Specific pressure in the grooves (UNI 10411-1:2024, D.2; registry gole.pressione) for the car side's static pull T [N]
 * at the sheave: T/(n·d·D) times 8·cos(β/2)/(π − β − sin β) for a semicircular groove (β = 0 without undercut) or
 * 4,5/sin(γ/2) for a V groove; a V groove with undercut the larger of the two. The limit at the ropes' speed v_c of
 * the rated speed: (12,5 + 4·v_c)/(1 + v_c) [N/mm²].
 */
export function groovePressure(I: Plant, M: Machine, T: number): { T: number; p: number; limit: number } {
  const g = M.groove, b = g.type === 'U' ? 0 : rad(g.beta || 0);
  const u = (K.pressU * Math.cos(b / 2)) / (Math.PI - b - Math.sin(b)), v = K.pressV / Math.sin(rad(g.gamma || 0) / 2);
  const f = g.type === 'U' || g.type === 'UU' ? u : g.type === 'VH' ? v : Math.max(u, v), vc = I.v * I.r;
  return { T, p: (T / (M.n * M.d * M.D)) * f, limit: (K.pressBase + K.pressSpeed * vc) / (1 + vc) };
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
