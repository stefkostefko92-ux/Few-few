// The car's guide rails checked as UNI EN 81-50:2020, 5.10 asks, with the permissible stresses and deflections of UNI
// EN 81-20:2020, 5.7 (registry guide.verifica): between two brackets (the longest span of the rail), the rated load off
// the centre across the rails' line and then along it; at the safety gear's operation (k1) bending, the vertical force
// with the rail's own weight, buckling by the omega method, the combined stresses; in running (k2) and while loading at
// a floor (the force on the sill) bending with the rail's weight; in every case the bending of the foot under a roller
// shoe and the deflections. And the safety gear's type for the rated speed (registry paracadute.tipo). Units: N, mm,
// N/mm². Pure.
import { check } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, RAIL_SECTIONS, iMin, type RailType } from '@/shaft/rails';
import type { Layout, ShaftCheck } from '@/shaft/types';
import { impactFactor, loadCases, loadingCases, type SafetyGear } from './forces';

const G = 9.81;

/** ω of a steel Rm 370 rail for its slenderness λ; null beyond the table (λ > 250). */
export function omega(lambda: number): number | null {
  const row = KV_VERT.omega370.find(([upTo]) => lambda <= upTo);
  return row ? row[1] * Math.max(lambda, 20) ** row[2] + row[3] : null;
}

export interface RailCheck {
  /** the longest span between two brackets [mm], the slenderness and ω (null: λ beyond the table) */
  l: number;
  lambda: number;
  omega: number | null;
  /** at the safety gear's operation: σm, σ = σm + Fv/A, σk, σc = σk + 0,9·σm; in running and while loading at a floor:
   *  σm and σ [N/mm²] */
  gear: { sm: number; s: number; sk: number | null; sc: number | null };
  run: { sm: number; s: number };
  load: { sm: number; s: number };
  /** the bending of the foot at the safety gear's operation and the worst in normal use [N/mm²]; the deflections across
   *  and along the rails' line, the worst of every case [mm] */
  flange: { gear: number; use: number };
  dx: number;
  dy: number;
}

/** The permissible stress of the rails' steel at the safety gear's operation and in normal use [N/mm²]. */
export const railLimits = (): { gear: number; use: number } => ({ gear: KV_VERT.railRm / KV_VERT.railStGear, use: KV_VERT.railRm / KV_VERT.railStRun });

/** The car rails `type` with brackets every `l` mm at most, `len` mm long, under an empty car P and a rated load Q [kg]. */
export function railCheck(L: Layout, type: RailType, P: number, Q: number, gear: SafetyGear, l: number, len: number): RailCheck {
  const S = RAIL_SECTIONS[type], K = KV_VERT, E = K.steelE, own = (G * RAILS[type].q * len) / 1000;
  const lambda = l / iMin(S), w = omega(lambda);
  const bend = (c: { fx: number; fy: number }): number => (K.railBend * c.fx * l) / S.Wy + (K.railBend * c.fy * l) / S.Wx;
  const g = loadCases(L, P, Q, impactFactor(gear)), run = loadCases(L, P, Q, K.k2Running).cases, load = loadingCases(L, P, Q);
  const worst = (cases: readonly { fx: number; fy: number }[], f: (c: { fx: number; fy: number }) => number): number => Math.max(...cases.map(f));
  const smGear = worst(g.cases, bend), smRun = worst(run, bend), smLoad = worst(load, bend);
  // the vertical force on a rail at the safety gear's operation: the car and its load stopped by all the rails, and
  // the rail's own weight standing on the pit floor; in normal use the rail's weight alone
  const fv = (impactFactor(gear) * G * (P + Q)) / g.n + own, sk = w === null ? null : (fv * w) / S.A;
  const all = [...g.cases, ...run, ...load], flange = (fx: number): number => (K.railFlange * fx) / S.c ** 2;
  const defl = (f: number, I: number): number => (K.railDeflK * f * l ** 3) / (48 * E * I);
  return {
    l, lambda, omega: w,
    gear: { sm: smGear, s: smGear + fv / S.A, sk, sc: sk === null ? null : sk + K.railCombine * smGear },
    run: { sm: smRun, s: smRun + own / S.A },
    load: { sm: smLoad, s: smLoad + own / S.A },
    flange: { gear: flange(worst(g.cases, (c) => c.fx)), use: flange(worst([...run, ...load], (c) => c.fx)) },
    dx: defl(worst(all, (c) => c.fx), S.Iy),
    dy: defl(worst(all, (c) => c.fy), S.Ix),
  };
}

/** The one of `xs` nearest its permissible value (sorted by the ratio), a missing one first. */
const nearest = (xs: readonly { s: number | null; lim: number }[]): { s: number | null; lim: number } =>
  [...xs].sort((a, b) => (b.s ?? Infinity) / b.lim - (a.s ?? Infinity) / a.lim)[0];

/** The checks of sheet 1: the stresses (the one nearest its permissible: the safety gear's, running's and loading's), the
 *  foot, the deflections; the safety gear's type for the speed. A slenderness beyond the table fails the stresses. */
export function railChecks(R: RailCheck, gear: SafetyGear, v: number): ShaftCheck[] {
  const K = KV_VERT, lim = railLimits();
  const st = nearest([
    ...[R.gear.sm, R.gear.s, R.gear.sc].map((s) => ({ s, lim: lim.gear })),
    ...[R.run.sm, R.run.s, R.load.sm, R.load.s].map((s) => ({ s, lim: lim.use })),
  ]);
  const fl = nearest([{ s: R.flange.gear, lim: lim.gear }, { s: R.flange.use, lim: lim.use }]), d = Math.max(R.dx, R.dy), instant = gear !== 'progressive';
  return [
    check('gr_stress', st.s !== null && st.s <= st.lim, st.s, st.lim, 0, 'MPa'),
    check('gr_flange', fl.s !== null && fl.s <= fl.lim, fl.s, fl.lim, 0, 'MPa'),
    check('gr_defl', d <= K.railDeflection, d, K.railDeflection, 1, 'mm'),
    check('sg_type', !instant || v <= K.gearInstantV + 1e-9, v, instant ? K.gearInstantV : null, 2, 'm/s'),
  ];
}
