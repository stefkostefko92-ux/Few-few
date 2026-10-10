// Proposal: the software sizes the machine on a calculation grid, without a catalogue (research chapter 8).
import { K } from './norme';
import { ceilTo } from './math';
import { grooveF } from './groove';
import { compute } from './compute';
import type { BrakeCase, Groove, GrooveType, Machine, Plant, Results, RopeSet, Sizing, SizingOption } from './types';

/** 320…800 mm in steps of 40: a calculation grid, not a catalogue. */
export const SHEAVE_GRID: readonly number[] = Array.from({ length: 13 }, (_, j) => 320 + 40 * j);
export const ROPE_DIAMETERS: readonly number[] = [8, 9, 10, 11, 12, 13];
/** IEC rated outputs [kW]. */
export const MOTOR_KW: readonly number[] = [1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45];

/**
 * Registry funi.stima: 8×19 Seale, fibre core, 1570 N/mm²: 8 mm = 30.4 kN and 0.215 kg/m, scaled with d².
 * Strength rounded down and mass rounded up, so the rounding never helps the checks.
 */
export const ropeFamily = (d: number): { Fmin: number; qf: number } =>
  ({ Fmin: Math.floor(304 * (d / 8) ** 2) / 10, qf: Math.ceil(215 * (d / 8) ** 2) / 1000 });

/**
 * Groove that passes every traction case (loading, braking, stalled) with utilisation ≤ limit; with realCases also
 * at the deceleration of the real brake. The smallest undercut (U, then U with undercut) or the widest hardened V.
 */
export function grooveFor(r0: Results, type: 'UU' | 'VH', gamma: number, limit: number, realCases: BrakeCase[] | null = null): Groove | null {
  // T1/T2 ≤ limit·e^(f·α) ⇔ f ≥ ln(T1/T2 / limit) / α; stalled: T1/T2 ≥ e^(f·α) ⇔ f ≤ ln(T1/T2) / α
  const need = (cases: readonly { ratio: number; alpha: number }[]): number => Math.max(...cases.map((c) => Math.log(c.ratio / limit) / c.alpha));
  const nL = need(r0.loadCases), nB = need(realCases ? r0.brk.concat(realCases) : r0.brk), sMax = Math.min(...[r0.stall, r0.stallLow].map((s) => Math.log(s.ratio) / s.alpha));
  const mub = r0.dn.mu;
  const strong = (g: Groove): boolean => grooveF(K.muLoading, g, 'loading') >= nL && grooveF(mub, g, 'braking') >= nB;
  const fits = (g: Groove): boolean => strong(g) && grooveF(K.muStalled, g, 'stalled') <= sMax;
  // f grows with β and falls with γ: if the most gripping groove in the limits is not enough, none is
  if (!strong(type === 'VH' ? { type: 'VH', beta: 0, gamma: 35 } : { type: 'UU', beta: 105, gamma })) return null;
  if (type === 'VH') {
    for (let k = 90; k >= 70; k--) { const g: Groove = { type: 'VH', beta: 0, gamma: k / 2 }; if (fits(g)) return g; }
    return null;
  }
  for (let k = 0; k <= 210; k++) { const g: Groove = { type: (k ? 'UU' : 'U') as GrooveType, beta: k / 2, gamma }; if (fits(g)) return g; }
  return null;
}

/** The groove's margins in the sizing's order: traction utilisation ≤ the warning threshold, then ≤ 1, first also at the
 *  real brake's deceleration, then without it. */
const GROOVE_TIERS: readonly (readonly [number, boolean])[] = [[K.tractionWarn, true], [1, true], [K.tractionWarn, false], [1, false]];

/**
 * Brake and groove of the machine M0 (its groove and brake are not read): the brake per set, the smallest setting that
 * meets every requirement (they do not depend on the groove), up to 5 N·m; the groove that holds traction also at the
 * real deceleration of both sets when the groove limits allow it (grooveFor, `pref` type, γ `gamma`), with its margins;
 * and the results with both. The margins are tried in the order of GROOVE_TIERS from `from` on; `tier` is the one taken.
 * null: no groove holds traction.
 */
export function sizeParts(I: Plant, M0: Machine, pref: 'UU' | 'VH', gamma: number, from = 0): { brakeSet: number; groove: Groove; tight: boolean; real: boolean; tier: number; M: Machine; res: Results } | null {
  const r0 = compute(I, { ...M0, groove: { type: 'U', beta: 0, gamma }, brakeSets: 2, brakeNm: 0 }), brakeSet = ceilTo(Math.max(r0.brake.one, r0.brake.up, r0.brake.all / 2), 5);
  const realCases = r0.brakeCasesAt(2 * brakeSet);
  let groove: Groove | null = null, tight = false, real = false, tier = from;
  for (; tier < GROOVE_TIERS.length; tier++) {
    const [lim, rl] = GROOVE_TIERS[tier];
    groove = grooveFor(r0, pref, gamma, lim, rl ? realCases : null);
    if (groove) { tight = lim === 1; real = rl; break; }
  }
  if (!groove) return null;
  const M: Machine = { ...M0, groove, brakeSets: 2, brakeNm: brakeSet };
  return { brakeSet, groove, tight, real, tier, M, res: compute(I, M) };
}


/** Motor: the smallest IEC rating (up to `kWmax`) that covers the static power (at the static torque, with the machine
 *  faster than the rated speed) with acceleration torque ≤ 2 × rated (the acceleration torque does not depend on the
 *  rating: Jm is an assumption of the group); undefined: none. */
export const motorFor = (res: Results, nm: number, kWmax: number | null = null): number | undefined =>
  MOTOR_KW.find((kw) => kw >= res.drive.Peq / 1000 && res.drive.Macc / ((9550 * kw) / nm) <= K.accelTorqueRatioMax && (kWmax === null || kw <= kWmax));

/** The grooves after `a` up to `b` by half degrees, each gripping less: less undercut (U with undercut: β down) or wider
 *  (hardened V: γ up); only `b` when it grips no less than `a`. */
function towards(a: Groove, b: Groove): Groove[] {
  if (a.type === 'VH' && b.type === 'VH' && b.gamma > a.gamma) {
    return Array.from({ length: Math.round(2 * (b.gamma - a.gamma)) }, (_, j) => ({ type: 'VH', beta: 0, gamma: a.gamma + (j + 1) / 2 }));
  }
  if (a.type !== 'VH' && b.type !== 'VH' && b.beta < a.beta) {
    return Array.from({ length: Math.round(2 * (a.beta - b.beta)) }, (_, j) => {
      const beta = a.beta - (j + 1) / 2;
      return { type: beta > 0 ? 'UU' : 'U', beta, gamma: b.gamma };
    });
  }
  return [b];
}

/**
 * A maker's machine M (its ratio, sheave, ropes, static load allowed: the catalogue's and the option's) sized again by
 * the sizing's rules at its own ratio and on the installation I as it is with that machine (its geometry): brake, groove
 * and motor (no larger than the catalogue's `kWmax`). The groove that grips least within the widest margin
 * (GROOVE_TIERS); a groove gripping more raises the rope's equivalent bends and the safety factor required, so when a
 * check fails with it the grooves gripping less are tried by half degrees, down to the next margin's: the one with the
 * most traction that passes every check. null when a part cannot be found or a check fails with every groove: the
 * machine does not take the option.
 */
export function resizeMachine(I: Plant, M: Machine, kWmax: number | null): { M: Machine; res: Results } | null {
  const pref = M.groove.type === 'VH' ? 'VH' : 'UU';
  const passing = (M0: Machine, groove: Groove): { M: Machine; res: Results } | null => {
    const r0 = compute(I, { ...M0, groove }), Pn = motorFor(r0, M.nm, kWmax);
    if (!Pn) return null;
    const N: Machine = { ...M0, groove, Pn }, res = Pn === M0.Pn ? r0 : compute(I, N);
    return res.fails.length ? null : { M: N, res };
  };
  let prev: Groove | null = null;
  for (let from = 0; from < GROOVE_TIERS.length; from++) {
    const parts = sizeParts(I, M, pref, M.groove.gamma, from);
    if (!parts) return null;
    for (const g of prev ? towards(prev, parts.groove) : [parts.groove]) {
      const ok = passing(parts.M, g);
      if (ok) return ok;
    }
    prev = parts.groove;
    from = parts.tier;
  }
  return null;
}

/**
 * For each rope diameter: the fewest ropes, then the smallest sheave that passes every check. base carries the
 * assumptions (poles, speed, frequency, η_d, η_i, inertias, groove type and γ); fixedD keeps a sheave; keep keeps the
 * ropes in place (replacement): then every sheave that passes is an option.
 */
export function sizeMachine(I: Plant, base: Machine, fixedD = 0, keep: RopeSet | null = null): Sizing {
  const options: SizingOption[] = [];
  const pref = base.groove.type === 'VH' ? 'VH' : 'UU';
  const hasPulleys = I.layout !== 'top' || I.r === 2 || I.nps + I.npr > 0;
  const sheaves = fixedD ? [fixedD] : SHEAVE_GRID;
  // one configuration: sheave D with n ropes of diameter d; null when a check fails
  const tryConfig = (d: number, n: number, D: number, rope: { Fmin: number; qf: number }): SizingOption | null => {
    if (D / d < K.ddMin) return null;
    const iIdeal = (Math.PI * (D / 1000) * base.nm) / (60 * I.v * I.r), i = Math.max(1, Math.round(iIdeal));
    const M0: Machine = { ...base, D, n, d, Fmin: rope.Fmin, qf: rope.qf, i, groove: { type: 'U', beta: 0, gamma: base.groove.gamma }, brakeSets: 2, brakeNm: 0, shaftMax: 0, MpCat: 0 };
    const parts = sizeParts(I, M0, pref, base.groove.gamma);
    if (!parts) return null;
    const { brakeSet, groove, tight, real, res } = parts;
    if (!(res.ropes.SfAct >= res.ropes.SfReq)) return null;
    const Preq = res.drive.Peq / 1000, Pn = motorFor(res, base.nm);
    if (!Pn) return null;
    const M: Machine = { ...parts.M, Pn, shaftMax: ceilTo(res.shaft.testKg, 100) };
    const final = compute(I, M);
    // every option passes the whole verification (kept ropes may fail number, diameter or deflector checks)
    return final.fails.length ? null : { D, d, n, rope, groove, tight, real, iIdeal, i, Preq, Pn, brakeSet, M, res: final };
  };
  if (keep) {
    if (!(hasPulleys && I.Dp / keep.d < K.ddMin)) for (const D of sheaves) { const o = tryConfig(keep.d, keep.n, D, keep); if (o) options.push(o); }
  } else {
    for (const d of ROPE_DIAMETERS) {
      if (hasPulleys && I.Dp / d < K.ddMin) continue; // D/d ≥ 40 also on the deflector pulleys of the plant
      const rope = ropeFamily(d);
      let found: SizingOption | null = null;
      for (let n = 2; n <= 8 && !found; n++) for (const D of sheaves) { found = tryConfig(d, n, D, rope); if (found) break; }
      if (found) options.push(found);
    }
  }
  const pick = options.slice().sort(compareOptions)[0] ?? null;
  return { options, pick, fixedD, keep };
}

type Ranked = Pick<SizingOption, 'real' | 'tight' | 'n' | 'D' | 'd'>;
/**
 * Order of the proposal: first the options that hold traction at the real brake deceleration, then without reduced
 * margins, then 4 ropes or more, then the fewest ropes, the smallest sheave, the thinnest rope.
 */
export const compareOptions = (a: Ranked, b: Ranked): number => {
  const rank = (o: Ranked): number => (o.real ? 0 : 2) + (o.tight ? 1 : 0);
  return rank(a) - rank(b) || (a.n >= 4 ? 0 : 1) - (b.n >= 4 ? 0 : 1) || a.n - b.n || a.D - b.D || a.d - b.d;
};
