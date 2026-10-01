// From the data entered once to everything the checks and the simulation need: the shaft laid out (the car, and
// the rated load when not given), the calculator's values with the travel, the speed and the rated load taken from
// the shaft, the car mass estimated when missing, the rope geometry measured on the plan and the section, the machine
// proposed by the sizing (and the geometry again with its sheave). Every automatic value can be switched off and
// entered by hand (AutoFlags); one the plan cannot give is reported (issues) and must be entered. Pure: the browser and
// the server derive the same.
import { SHEAVE_GRID, compareOptions, readInputs, sizeMachine } from '@/calc/index';
import { deflectorAngle } from '@/calc/geometry';
import type { FormValues, SizingOption } from '@/calc/types';
import { layout, section, travel, type Layout, type ShaftInputs } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import { analyse, mirrorRopes, proposalValues, type Analysis } from '@/lib/present/analysis';
import { simModel, type SimModel } from '@/sim';
import { bottomGapNeeded, bottomGeo, extraBends, type BottomScheme } from './bottom';
import { bestFit, catalogValues, type CatalogChoice } from './catalog';
import type { CatalogFit } from '@/lib/catalog/machines';
import { machineSpec } from './machine';
import { KL } from './norme';

/** Values the software fills in (true) or takes as entered (false). */
export interface AutoFlags {
  P: boolean;
  machine: boolean;
  L0: boolean;
  dx: boolean;
  Hv: boolean;
}

/** The one form of an installation: the shaft (plan, floors, machine room), the calculator's values, the switches. */
export interface LiftInputs {
  shaft: ShaftInputs;
  calc: FormValues;
  auto: AutoFlags;
  /** the rope scheme of a machine below (bottom.ts); missing: pulleys under the shaft's slab */
  bottom?: BottomScheme;
  /** the maker (and model) the proposal takes the machine from (catalog.ts); missing: the calculation grid */
  catalog?: CatalogChoice;
}

export type Origin = 'entered' | 'auto' | 'estimate';
export type DerivedKey = 'Q' | 'v' | 'H' | 'P' | 'L0' | 'dx' | 'Hv' | 'machine';

export interface LiftDerived {
  shaft: ShaftInputs;
  /** the calculator's values, complete: what the calculation record stores */
  values: FormValues;
  layout: Layout;
  analysis: Analysis;
  origin: Readonly<Record<DerivedKey, Origin>>;
  /** the sizing found no machine: the one entered is checked instead */
  noProposal: boolean;
  /** automatic values the plan cannot give (the pulleys do not fit as a simple bend between the rope drops) */
  issues: readonly DerivedKey[];
  machine: MachineSpec;
  /** the rope scheme of a machine below; null with the machine above */
  bottom: BottomScheme | null;
  /** its runs to the machine do not clear the counterweight and its brackets: the gap behind the counterweight as
   *  designed and the least that clears them (null: none up to 1,5 m more) [mm]; null when they clear */
  bottomGap: { now: number; need: number | null } | null;
  /** the head pulleys of the scheme (the calculation counts two of them for the bottom layout) */
  headPulleys: number;
  /** the proposal from a catalogue: the maker's machine taken, or none of the choice passing (the grid's proposal) */
  catalog: { fit: CatalogFit | null; miss: boolean } | null;
  sim: SimModel;
}

const num = (V: FormValues, id: string): number => {
  const x = parseFloat(String(V[id] ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
const m3 = (x: number): number => Math.round(x * 1000) / 1000;

/** P = ratio · Q, rounded up to the step (registry impianto.massa.cabina). */
export const carMassEstimate = (Q: number): number => Math.ceil((KL.carMassRatio * Q) / KL.carMassStep - 1e-9) * KL.carMassStep;

/** Rope beyond the travel: from the crosshead at the top floor to the sheave axis, with the machine below to the axes of
 *  the head pulleys (registry impianto.L0). */
function ropeBeyond(S: ShaftInputs, V: FormValues, headOver: number | null): number {
  const vt = S.vertical, D = num(V, 'n_D');
  const above = headOver !== null ? headOver : S.room ? S.room.slab + KL.sheaveAxisPerD * D : 0;
  return Math.max(0.1, m3((vt.headroom - vt.frameTop + above) / 1000));
}

/**
 * Horizontal distance from the sheave to the diverting pulley, with the counterweight's rope drop where the plan puts
 * it: past the pulley's outer side (simple bend: the drop spacing less the two radii) or, when the rope must come
 * inwards, past its inner side (reverse bend: Dp further). With 2:1 roping the ropes run up from the inner sides of the
 * car and counterweight pulleys, Dp closer together. When neither bend is the one the wrap-angle model reads from that
 * distance, the plan cannot give it (fits: false; the simple value is kept, never clamped).
 */
function deflectorDx(L: Layout, V: FormValues): { dx: number; fits: boolean } {
  const car = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], cw = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  const D = num(V, 'n_D'), Dp = num(V, 'Dp'), h = num(V, 'h');
  const span = Math.hypot(cw[0] - car[0], cw[1] - car[1]) - (num(V, 'r') === 2 ? Dp : 0);
  const simple = m3((span - D / 2 - Dp / 2) / 1000), reverse = m3((span - D / 2 + Dp / 2) / 1000);
  if (simple >= 0 && deflectorAngle(D, Dp, simple, h)?.reverse === false) return { dx: simple, fits: true };
  if (reverse >= 0 && deflectorAngle(D, Dp, reverse, h)?.reverse === true) return { dx: reverse, fits: true };
  return { dx: simple, fits: false };
}

/**
 * The machine proposed for the values V. The sheave changes the rope geometry (rope beyond the travel, distance of the
 * diverting pulley), which changes the wrap angle: each sheave of the grid (or the one kept) is sized with its own
 * geometry, and only sheaves whose diverting pulley the plan can place (planned) are taken. The choice is the sizing's
 * own: per rope diameter the fewest ropes, then the smallest sheave (ropes kept: every sheave), then compareOptions. With
 * the geometry entered by hand this is exactly the sizing of the calculator. null: nothing passes (the machine entered is
 * checked).
 */
function propose(V0: FormValues, L: Layout, geometry: (W: FormValues) => FormValues, planned: boolean, fitOf: ((o: SizingOption, W: FormValues) => CatalogFit | null) | null): { V: FormValues; fit: CatalogFit | null } | null {
  const c0 = readInputs(V0), sheaves = c0.fixedD ? [c0.fixedD] : SHEAVE_GRID;
  const found: { o: SizingOption; V: FormValues; fit: CatalogFit | null }[] = [];
  for (const D of sheaves) {
    const W = geometry({ ...V0, n_D: D });
    if (planned && !deflectorDx(L, W).fits) continue;
    const c = readInputs(W);
    for (const o of sizeMachine(c.I, c.N, D, c.rope).options) {
      const fit = fitOf ? fitOf(o, W) : null;
      if (!fitOf || fit) found.push({ o, V: W, fit });
    }
  }
  const first = new Map<number, (typeof found)[number]>();
  for (const x of found) {
    const y = first.get(x.o.d);
    if (!y || x.o.n < y.o.n || (x.o.n === y.o.n && x.o.D < y.o.D)) first.set(x.o.d, x);
  }
  const best = (c0.rope ? found : [...first.values()]).sort((a, b) => compareOptions(a.o, b.o))[0];
  return best ? { V: geometry(mirrorRopes({ ...best.V, ...proposalValues(best.o), ...(best.fit ? catalogValues(best.fit) : {}) })), fit: best.fit } : null;
}

export function deriveLift(inp: LiftInputs): LiftDerived {
  const S = inp.shaft, L = layout(S), vt = S.vertical, rise = travel(vt.floors), Sec = section(L);
  let V: FormValues = { ...inp.calc, Q: L.Q, v: vt.v, H: rise / 1000 };
  if (inp.auto.P) V = { ...V, P: carMassEstimate(L.Q) };
  // a machine below: the scheme's head pulleys beyond the two the calculation counts are extra simple bends, Hv runs
  // from their axes to the sheave's (both with the sheave of each sizing step)
  const scheme: BottomScheme | null = V.layout === 'bottom' ? inp.bottom ?? 'head' : null, npsEntered = num(inp.calc, 'nps');
  if (inp.auto.Hv && !scheme) V = { ...V, Hv: m3((rise + vt.headroom) / 1000) };
  const geometry = (W: FormValues): FormValues => {
    let X = W;
    const g = scheme ? bottomGeo(L, scheme, num(X, 'n_D'), num(X, 'Dp'), num(X, 'n_n'), num(X, 'n_d'), num(X, 'r')) : null;
    if (g) X = { ...X, nps: npsEntered + extraBends(g), ...(inp.auto.Hv ? { Hv: m3((g.zHead - g.zSheave) / 1000) } : {}) };
    if (inp.auto.L0) X = { ...X, L0: ropeBeyond(S, X, g ? g.zHead - Sec.ceiling : null) };
    if (inp.auto.dx) X = { ...X, dx: deflectorDx(L, X).dx };
    return X;
  };
  V = geometry(mirrorRopes(V));
  // the diverting pulley's distance comes from the plan: only geometries the wrap-angle model reads as drawn
  const c0 = readInputs(V).I, planned = inp.auto.dx && c0.layout === 'topDefl' && c0.alphaMode !== 'manual';
  let noProposal = false, catalog: LiftDerived['catalog'] = null;
  if (inp.auto.machine) {
    // from the maker chosen when one of its machines takes an option, else from the calculation grid
    const choice = inp.catalog, fromCat = choice ? propose(V, L, geometry, planned, (o, W) => bestFit(choice, o, num(W, 'Q'), num(W, 'r'))) : null;
    const proposed = fromCat ?? propose(V, L, geometry, planned, null);
    if (choice) catalog = { fit: fromCat?.fit ?? null, miss: !fromCat };
    if (proposed) V = proposed.V;
    else noProposal = true;
  }
  const analysis = analyse(V), { I, N } = analysis.ctx;
  // a distance the plan cannot give is reported: it must be measured and entered
  const issues: DerivedKey[] = planned && !deflectorDx(L, V).fits ? ['dx'] : [];
  const origin: Record<DerivedKey, Origin> = {
    Q: S.Q === null ? 'auto' : 'entered', v: 'entered', H: 'auto', P: inp.auto.P ? 'estimate' : 'entered',
    L0: inp.auto.L0 ? 'auto' : 'entered', dx: inp.auto.dx ? 'auto' : 'entered', Hv: inp.auto.Hv ? 'auto' : 'entered',
    machine: inp.auto.machine && !noProposal ? 'auto' : 'entered',
  };
  const machine: MachineSpec = machineSpec(analysis.ctx);
  const g = scheme ? bottomGeo(L, scheme, N.D, I.Dp, N.n, N.d, I.r) : null;
  const bottomGap = scheme && g && !g.fits ? { now: S.cwWallGap, need: bottomGapNeeded(S, scheme, N.D, I.Dp, N.n, N.d, I.r) } : null;
  return {
    shaft: L.inputs, values: V, layout: L, analysis, origin, noProposal, issues, machine, bottom: scheme, bottomGap, headPulleys: g ? 2 + extraBends(g) : 0, catalog,
    sim: simModel(I, N, analysis.res, Sec, vt),
  };
}
