// The car's guide rails checked as UNI EN 81-50:2020, 5.10 asks, with the permissible stresses and deflections of UNI
// EN 81-20:2020, 5.7 (registry guide.verifica): between two brackets (the longest span of the rail), the rated load off
// the centre across the rails' line and then along it; at the safety gear's operation (k1) bending, the vertical force
// with the rail's own weight, buckling by the omega method, the combined stresses; in running (k2) and while loading at
// a floor (the force on the sill) bending with the rail's weight; in every case the bending of the foot under a roller
// shoe and the deflections. And the safety gear's type for the rated speed (registry paracadute.tipo). Round 49: the
// check's core on a geometry and a section (railCheckCore), with the options of the relazione tecnica di modifica for
// existing rails — the steel's Rm (ω interpolated between Rm 370 and 520), its elongation A5, the suspension point
// (registry rt.guide.rm, rt.guide.sospensione) — read only when given: without them the very operations of sheet 1.
// Units: N, mm, N/mm². Pure.
import { check } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, RAIL_SECTIONS, iMin, type RailSection, type RailType } from '@/shaft/rails';
import type { Layout, ShaftCheck } from '@/shaft/types';
import { KR } from '../rt/norme';
import { impactFactor, loadCasesAt, loadingCasesAt, railGeometryOf, sillFactor, type LiftUse, type RailGeometry, type SafetyGear, type Suspension } from './forces';

const G = 9.81;

/** ω of a steel Rm 370 rail for its slenderness λ; null beyond the table (λ > 250). */
export function omega(lambda: number): number | null {
  const row = KV_VERT.omega370.find(([upTo]) => lambda <= upTo);
  return row ? row[1] * Math.max(lambda, 20) ** row[2] + row[3] : null;
}

/** ω of a steel Rm 520 rail for its slenderness λ (UNI EN 81-50:2020, 5.10.3; registry rt.guide.rm); null beyond the
 *  table. */
export function omega520(lambda: number): number | null {
  const row = KR.omega520.find(([upTo]) => lambda <= upTo);
  return row ? row[1] * Math.max(lambda, 20) ** row[2] + row[3] : null;
}

/** ω of a steel of tensile strength Rm [N/mm²] between 370 and 520: linear between the two tables; outside them the
 *  method gives none (the relazione's inputs refuse such an Rm). */
export function omegaRm(lambda: number, Rm: number): number | null {
  if (!(Rm >= KR.railRmMin - 1e-9 && Rm <= KR.railRmMax + 1e-9)) throw new RangeError(`Rm ${Rm} fuori da ${KR.railRmMin}–${KR.railRmMax}`);
  const a = omega(lambda), b = omega520(lambda);
  return a === null || b === null ? null : a + ((Rm - KR.railRmMin) / (KR.railRmMax - KR.railRmMin)) * (b - a);
}

/** The options of the relazione tecnica di modifica for existing rails: the steel's Rm, its elongation A5 between 8 and
 *  12 % (else over 12 %), the suspension point. */
export interface RailOpts {
  Rm?: number;
  a5?: 'da8a12';
  S?: Suspension;
}

/** A rail's section for the core: the catalogue's (its least radius of gyration computed) or one typed by hand (`i` given),
 *  with its mass per metre q [kg/m]. */
export type RailCoreSection = RailSection & { q: number; i?: number };

export interface RailCheck {
  /** the longest span between two brackets [mm], the slenderness and ω (null: λ beyond the table) */
  l: number;
  lambda: number;
  omega: number | null;
  /** at the safety gear's operation: σm, σ = σm + Fv/A, σk, σc = σk + 0,9·σm; in running and while loading at a floor:
   *  σm and σ [N/mm²] */
  gear: { sm: number; s: number; sk: number | null; sc: number | null };
  run: { sm: number; s: number };
  /** while loading at a floor, and the factor of the sill's force Fs = factor·g·Q */
  load: { sm: number; s: number; sill: number };
  /** the bending of the foot at the safety gear's operation and the worst in normal use [N/mm²]; the deflections across
   *  and along the rails' line, the worst of every case [mm] */
  flange: { gear: number; use: number };
  dx: number;
  dy: number;
}

/** The permissible stress of the rails' steel at the safety gear's operation and in normal use [N/mm²]; with the options,
 *  of their Rm and elongation (St 3,0 and 3,75 from 8 to 12 %). */
export const railLimits = (o?: Pick<RailOpts, 'Rm' | 'a5'>): { gear: number; use: number } => (o?.Rm === undefined && o?.a5 === undefined
  ? { gear: KV_VERT.railRm / KV_VERT.railStGear, use: KV_VERT.railRm / KV_VERT.railStRun }
  : { gear: (o.Rm ?? KV_VERT.railRm) / (o.a5 ? KR.railStGear812 : KV_VERT.railStGear), use: (o.Rm ?? KV_VERT.railRm) / (o.a5 ? KR.railStRun812 : KV_VERT.railStRun) });

/** The car rails `type` with brackets every `l` mm at most, `len` mm long, under an empty car P and a rated load Q [kg];
 *  the lift's use for the force on the sill while loading. */
export function railCheck(L: Layout, type: RailType, P: number, Q: number, gear: SafetyGear, l: number, len: number, use?: LiftUse): RailCheck {
  return railCheckCore(railGeometryOf(L), { ...RAIL_SECTIONS[type], q: RAILS[type].q }, P, Q, gear, l, len, use);
}

/** railCheck on a geometry and a section; the options of the relazione tecnica di modifica only when given. */
export function railCheckCore(geo: RailGeometry, S: RailCoreSection, P: number, Q: number, gear: SafetyGear, l: number, len: number, use?: LiftUse, o?: RailOpts): RailCheck {
  const K = KV_VERT, E = K.steelE, own = (G * S.q * len) / 1000;
  const lambda = l / (S.i ?? iMin(S)), w = o?.Rm === undefined ? omega(lambda) : omegaRm(lambda, o.Rm);
  const bend = (c: { fx: number; fy: number }): number => (K.railBend * c.fx * l) / S.Wy + (K.railBend * c.fy * l) / S.Wx;
  const g = loadCasesAt(geo, P, Q, impactFactor(gear)), run = loadCasesAt(geo, P, Q, K.k2Running, o?.S).cases, load = loadingCasesAt(geo, P, Q, use, o?.S);
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
    load: { sm: smLoad, s: smLoad + own / S.A, sill: sillFactor(Q, use) },
    flange: { gear: flange(worst(g.cases, (c) => c.fx)), use: flange(worst([...run, ...load], (c) => c.fx)) },
    dx: defl(worst(all, (c) => c.fx), S.Iy),
    dy: defl(worst(all, (c) => c.fy), S.Ix),
  };
}

/** The one of `xs` nearest its permissible value (sorted by the ratio), a missing one first. */
const nearest = (xs: readonly { s: number | null; lim: number }[]): { s: number | null; lim: number } =>
  [...xs].sort((a, b) => (b.s ?? Infinity) / b.lim - (a.s ?? Infinity) / a.lim)[0];

/** The safety gear's type for the rated speed: an instantaneous one (with or without rollers) up to KV_VERT.gearInstantV
 *  (registry paracadute.tipo). */
export function sgTypeCheck(gear: SafetyGear, v: number): ShaftCheck {
  const instant = gear !== 'progressive';
  return check('sg_type', !instant || v <= KV_VERT.gearInstantV + 1e-9, v, instant ? KV_VERT.gearInstantV : null, 2, 'm/s');
}

/** The checks of sheet 1: the stresses (the one nearest its permissible: the safety gear's, running's and loading's), the
 *  foot, the deflections; the safety gear's type for the speed. A slenderness beyond the table fails the stresses. With
 *  the limits of other options (railLimits(o)) for the relazione tecnica di modifica. */
export function railChecks(R: RailCheck, gear: SafetyGear, v: number, lim = railLimits()): ShaftCheck[] {
  const K = KV_VERT;
  const st = nearest([
    ...[R.gear.sm, R.gear.s, R.gear.sc].map((s) => ({ s, lim: lim.gear })),
    ...[R.run.sm, R.run.s, R.load.sm, R.load.s].map((s) => ({ s, lim: lim.use })),
  ]);
  const fl = nearest([{ s: R.flange.gear, lim: lim.gear }, { s: R.flange.use, lim: lim.use }]), d = Math.max(R.dx, R.dy);
  return [
    check('gr_stress', st.s !== null && st.s <= st.lim, st.s, st.lim, 1, 'MPa'),
    check('gr_flange', fl.s !== null && fl.s <= fl.lim, fl.s, fl.lim, 1, 'MPa'),
    check('gr_defl', d <= K.railDeflection, d, K.railDeflection, 1, 'mm'),
    sgTypeCheck(gear, v),
  ];
}
