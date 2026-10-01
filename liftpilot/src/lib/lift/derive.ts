// From the data entered once to everything the checks and the simulation need: the shaft laid out (the car, and
// the rated load when not given), the calculator's values with the travel, the speed and the rated load taken from
// the shaft, the car mass estimated when missing, the rope geometry measured on the plan and the section, the machine
// proposed by the sizing (and the geometry again with its sheave). Every automatic value can be switched off and
// entered by hand (AutoFlags); one the plan cannot give is reported (issues) and must be entered. Pure: the browser and
// the server derive the same.
import { SHEAVE_GRID, compareOptions, readInputs, sizeMachine } from '@/calc/index';
import { deflectorAngle } from '@/calc/geometry';
import type { FormValues, SizingOption } from '@/calc/types';
import { layout, section, travel, type Layout, type ShaftCheck, type ShaftInputs } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import { analyse, mirrorRopes, proposalValues, type Analysis } from '@/lib/present/analysis';
import { simModel, type SimModel } from '@/sim';
import { bottomGapNeeded, bottomGeo, extraBends, type BottomScheme } from './bottom';
import { bestFit, catalogValues, type CatalogChoice } from './catalog';
import type { CatalogFit } from '@/lib/catalog/machines';
import { machineSpec, sheaveAxis } from './machine';
import { supportChecks, supportLoad } from './support';
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
/** What the plan cannot give or contradicts: the diverting pulley's distance, a direct pull's falls (calata). */
export type IssueKey = DerivedKey | 'calata';

export interface LiftDerived {
  shaft: ShaftInputs;
  /** the calculator's values, complete: what the calculation record stores */
  values: FormValues;
  layout: Layout;
  analysis: Analysis;
  origin: Readonly<Record<DerivedKey, Origin>>;
  /** the sizing found no machine: the one entered is checked instead */
  noProposal: boolean;
  /** automatic values the plan cannot give (the pulleys do not fit as a simple bend between the rope drops), and a direct
   *  pull whose falls in the plan are not the sheave's diameter apart */
  issues: readonly IssueKey[];
  /** direct pull (no diverting pulley): the spacing of the falls in the plan, which the sheave's pitch diameter must
   *  equal [mm]; null with a diverting pulley or the machine below */
  calata: number | null;
  machine: MachineSpec;
  /** the checks of the machine's support in the room (the beams under it), at the load sheet 1 counts */
  supportChecks: readonly ShaftCheck[];
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
  const above = headOver !== null ? headOver : S.room ? S.room.slab + sheaveAxis(S.room, D) : 0;
  return Math.max(0.1, m3((vt.headroom - vt.frameTop + above) / 1000));
}

/** Spacing in the plan of the two falls of the rope over the machine [mm]: from the car's drop to the counterweight's,
 *  Dp less with 2:1 roping (the ropes run up from the inner sides of the car and counterweight pulleys). */
function fallSpacing(L: Layout, V: FormValues): number {
  const car = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], cw = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  return Math.hypot(cw[0] - car[0], cw[1] - car[1]) - (num(V, 'r') === 2 ? num(V, 'Dp') : 0);
}

/**
 * Horizontal distance from the sheave to the diverting pulley, with the counterweight's rope drop where the plan puts
 * it: past the pulley's outer side (simple bend: the drop spacing less the two radii) or, when the rope must come
 * inwards, past its inner side (reverse bend: Dp further). When neither bend is the one the wrap-angle model reads from
 * that distance, the plan cannot give it (fits: false; the simple value is kept, never clamped).
 */
function deflectorDx(L: Layout, V: FormValues): { dx: number; fits: boolean } {
  const D = num(V, 'n_D'), Dp = num(V, 'Dp'), h = num(V, 'h'), span = fallSpacing(L, V);
  const simple = m3((span - D / 2 - Dp / 2) / 1000), reverse = m3((span - D / 2 + Dp / 2) / 1000);
  if (simple >= 0 && deflectorAngle(D, Dp, simple, h)?.reverse === false) return { dx: simple, fits: true };
  if (reverse >= 0 && deflectorAngle(D, Dp, reverse, h)?.reverse === true) return { dx: reverse, fits: true };
  return { dx: simple, fits: false };
}

/**
 * The machine proposed for the values V. The sheave changes the rope geometry (rope beyond the travel, distance of the
 * diverting pulley), which changes the wrap angle: each sheave of the grid (or the one kept) is sized with its own
 * geometry, and only sheaves whose diverting pulley the plan can place (planned) are taken; a direct pull takes only the
 * sheave `only` lists (its falls are the plan's). The choice is the sizing's own: per rope diameter the fewest ropes,
 * then the smallest sheave (ropes kept: every sheave), then compareOptions. With the geometry entered by hand this is
 * exactly the sizing of the calculator. null: nothing passes (the machine entered is checked).
 */
function propose(V0: FormValues, L: Layout, geometry: (W: FormValues) => FormValues, planned: boolean, fitOf: ((o: SizingOption, W: FormValues) => CatalogFit | null) | null, only: readonly number[] | null): { V: FormValues; fit: CatalogFit | null } | null {
  const c0 = readInputs(V0), sheaves = c0.fixedD ? [c0.fixedD] : only ?? SHEAVE_GRID;
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
  const p0 = readInputs(V), c0 = p0.I, planned = inp.auto.dx && c0.layout === 'topDefl' && c0.alphaMode !== 'manual';
  // a direct pull hangs the falls from the sheave's two sides: its pitch diameter is their spacing in the plan, so the
  // proposal takes that sheave (within the grid's range); when the existing machine is compared, its sheave set the
  // hitches and the new one may differ (the calculation inclines the ropes)
  const direct = c0.layout === 'top', oldHitches = direct && p0.compare && c0.context === 'repl';
  const fallD = direct ? Math.round(fallSpacing(L, V)) : 0;
  const only = direct && !oldHitches ? (fallD >= SHEAVE_GRID[0] && fallD <= SHEAVE_GRID[SHEAVE_GRID.length - 1] ? [fallD] : []) : null;
  let noProposal = false, catalog: LiftDerived['catalog'] = null;
  if (inp.auto.machine) {
    // from the maker chosen when one of its machines takes an option, else from the calculation grid
    const choice = inp.catalog, fromCat = choice ? propose(V, L, geometry, planned, (o, W) => bestFit(choice, o, num(W, 'Q'), num(W, 'r')), only) : null;
    const proposed = fromCat ?? propose(V, L, geometry, planned, null, only);
    if (choice) catalog = { fit: fromCat?.fit ?? null, miss: !fromCat };
    if (proposed) V = proposed.V;
    else noProposal = true;
  }
  const analysis = analyse(V), { I, N, O } = analysis.ctx;
  // a distance the plan cannot give is reported: it must be measured and entered; falls of a direct pull that are not
  // the sheave's diameter apart contradict the plan (registry impianto.calata)
  const calata = direct ? fallSpacing(L, V) : null;
  const issues: IssueKey[] = [
    ...(planned && !deflectorDx(L, V).fits ? ['dx' as const] : []),
    ...(calata !== null && Math.abs(calata - (oldHitches ? O.D : N.D)) > KL.calataTol ? ['calata' as const] : []),
  ];
  const origin: Record<DerivedKey, Origin> = {
    Q: S.Q === null ? 'auto' : 'entered', v: 'entered', H: 'auto', P: inp.auto.P ? 'estimate' : 'entered',
    L0: inp.auto.L0 ? 'auto' : 'entered', dx: inp.auto.dx ? 'auto' : 'entered', Hv: inp.auto.Hv ? 'auto' : 'entered',
    machine: inp.auto.machine && !noProposal ? 'auto' : 'entered',
  };
  const machine: MachineSpec = machineSpec(analysis.ctx, analysis.ctx.N.mass, '', S.room);
  const supportCk = supportChecks(L, machine, supportLoad(analysis.ctx, analysis.res.Mcw));
  const g = scheme ? bottomGeo(L, scheme, N.D, I.Dp, N.n, N.d, I.r) : null;
  const bottomGap = scheme && g && !g.fits ? { now: S.cwWallGap, need: bottomGapNeeded(S, scheme, N.D, I.Dp, N.n, N.d, I.r) } : null;
  return {
    shaft: L.inputs, values: V, layout: L, analysis, origin, noProposal, issues, calata, machine, supportChecks: supportCk, bottom: scheme, bottomGap,
    headPulleys: g ? 2 + extraBends(g) : 0, catalog,
    sim: simModel(I, N, analysis.res, Sec, vt),
  };
}
