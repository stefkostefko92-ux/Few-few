// From the data entered once to everything the checks and the simulation need: the shaft laid out (the car, and
// the rated load when not given), the calculator's values with the travel, the speed and the rated load taken from
// the shaft, the car mass estimated when missing, the rope geometry measured on the plan and the section, the machine
// proposed by the sizing (and the geometry again with its sheave). Every automatic value can be switched off and
// entered by hand (AutoFlags); one the plan cannot give is reported (issues) and must be entered. Pure: the browser and
// the server derive the same.
import { SHEAVE_GRID, readInputs, sizeMachine } from '@/calc/index';
import { deflectorAngle } from '@/calc/geometry';
import type { FormValues, SizingOption } from '@/calc/types';
import { HEB_PROFILES, layout, roomGeo, section, travel, type Layout, type ShaftInputs } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import { analyse, mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { simModel } from '@/sim';
import { belowChecks } from './below-checks';
import { bottomGapNeeded, bottomGeo, extraBends, sheaveHalfBelow, type BottomScheme } from './bottom';
import { catalogFits, catalogValues, choiceMachines, firstTaken, offGrid, throughWall } from './catalog';
import type { CatalogFit } from '@/lib/catalog/machines';
import { machineShapeOf, machineSpec, rinvioOf, sheaveAxis, sheaveAxisBelow, type Made } from './machine';
import type { MachineShape } from '@/shaft/machine-shape';
import { rinvioClash, type RinvioFrame } from '@/shaft/rinvio';
import { fallsOf } from '@/shaft/falls';
import { headTopChecks, refugeHeadroom } from './head';
import { withRig } from './shaft-rig';
import { cwGapOver } from '@/shaft/cw-gap';
import { carriedMass, governorSideFor, hebOf, placedPanel, supportChecks, supportLoad } from './support';
import { drawnIssues, type Drawn } from './drawn';
import { collaudoOf } from './collaudo';
import { rigLength } from './rope';
import { KL } from './norme';
import { catalogMachineOf, massModelOf, modelOf } from './known';
import { dropSheaves, planFalls } from './direct';
import { existingRoomCheck } from '@/shaft/room-above';
import { slingCheck } from './arcata';
import { carichiOf } from './modifica';

export type { AutoFlags, DerivedKey, IssueKey, LiftDerived, LiftInputs, Origin } from './derive-types';
import type { DerivedKey, IssueKey, LiftDerived, LiftInputs, Origin } from './derive-types';

const num = (V: FormValues, id: string): number => {
  const x = parseFloat(String(V[id] ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
const m3 = (x: number): number => Math.round(x * 1000) / 1000;

/** P = ratio · Q, rounded up to the step (registry impianto.massa.cabina). */
export const carMassEstimate = (Q: number): number => Math.ceil((KL.carMassRatio * Q) / KL.carMassStep - 1e-9) * KL.carMassStep;

/** Rope beyond the travel: from the crosshead at the top floor to the sheave axis, with the machine below to the axes of
 *  the head pulleys (registry impianto.L0); the axis of the maker's machine as it is (`shape`), on the bedplate with
 *  the diverting pulley when there is one (`rinvio`). */
function ropeBeyond(S: ShaftInputs, V: FormValues, headOver: number | null, shape: MachineShape | null, rinvio: RinvioFrame | null): number {
  const vt = S.vertical, D = num(V, 'n_D');
  const above = headOver !== null ? headOver : S.room ? S.room.slab + sheaveAxis(S.room, D, shape, rinvio) : 0;
  return Math.max(0.1, m3((vt.headroom - vt.frameTop + above) / 1000));
}

/** Spacing in the plan of the two falls of the rope over the machine [mm]: from the car's drop to the counterweight's,
 *  with 2:1 roping from a side of each one's pulley, which turns between its guide rails (falls.ts; until LIFT 1.27.0
 *  the pulleys turned in the drops' plane and the falls stood Dp closer). */
function fallSpacing(L: Layout, V: FormValues): number {
  const f = fallsOf(L, num(V, 'r'), num(V, 'Dp'));
  return Math.hypot(f.cw[0] - f.car[0], f.cw[1] - f.car[1]);
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
function propose(V0: FormValues, L: Layout, geometry: (W: FormValues) => FormValues, planned: boolean, fitsOf: ((o: SizingOption, W: FormValues) => readonly CatalogFit[]) | null, only: readonly number[] | null,
  extra: readonly number[] = [], finish: (fit: CatalogFit, W: FormValues) => FormValues | null = () => null): { V: FormValues; fit: CatalogFit | null } | null {
  // (`finish`: the maker's machine taken for an option, as it stands, its parts sized again on it; null: it does not
  // take the option after all, the next machine of the choice that takes it is tried, then the next option in the
  // sizing's order)
  // (`extra`: a chosen model's own sheave off the grid)
  const c0 = readInputs(V0), sheaves = c0.fixedD ? [c0.fixedD] : only ?? [...SHEAVE_GRID, ...extra.filter((D) => !SHEAVE_GRID.includes(D))].sort((a, b) => a - b);
  const found: { o: SizingOption; V: FormValues; fit: CatalogFit | null }[] = [];
  for (const D of sheaves) {
    const W = geometry({ ...V0, n_D: D });
    if (planned && !deflectorDx(L, W).fits) continue;
    const c = readInputs(W);
    for (const o of sizeMachine(c.I, c.N, D, c.rope).options) {
      // the machines that take the option in their order, one after the other (pickOption keeps the first of equal ones)
      if (fitsOf) for (const fit of fitsOf(o, W)) found.push({ o, V: W, fit });
      else found.push({ o, V: W, fit: null });
    }
  }
  const taken = firstTaken(found, !!c0.rope, (best) => {
    const W = mirrorRopes({ ...best.V, ...proposalValues(best.o) });
    return best.fit ? finish(best.fit, W) : geometry(W);
  });
  return taken ? { V: taken.r, fit: taken.x.fit } : null;
}

function deriveOnce(inp: LiftInputs): LiftDerived {
  const S = inp.shaft, L = layout(S), vt = S.vertical, rise = travel(vt.floors), Sec = section(L);
  let V: FormValues = { ...inp.calc, Q: L.Q, v: vt.v, H: rise / 1000 };
  if (inp.auto.P) V = { ...V, P: carMassEstimate(L.Q) };
  // a machine below: the scheme's head pulleys beyond the two the calculation counts are extra simple bends, Hv runs
  // from their axes to the sheave's (both with the sheave of each sizing step)
  const scheme: BottomScheme | null = V.layout === 'bottom' ? inp.bottom ?? 'head' : null, npsEntered = num(inp.calc, 'nps');
  if (inp.auto.Hv && !scheme) V = { ...V, Hv: m3((rise + vt.headroom) / 1000) };
  // the maker's machine the proposal takes, as it is: its own axis over the floor (and the maker's bedplate with the
  // diverting pulley); null (the generic machine) while the proposal runs
  let shape: MachineShape | null = null, made: Made | null = null;
  // the diverting pulley in the room, in the machine's bedplate or on its stand: its h is the sheave's axis over its own
  // (registry locale.rinvio), with the distance dx from the plan; an h entered by hand stays
  const rinvioFor = (X: FormValues, sh = shape, md = made): RinvioFrame | null =>
    (X.layout === 'topDefl' ? rinvioOf(S.room, num(X, 'n_D'), num(X, 'Dp'), sh, md, inp.auto.dx ? null : num(X, 'h') * 1000) : null);
  // the rope geometry with the machine `sh` (`md`) where it stands; `drawn`: L0 and Hv from the design even where entered
  const geometryOf = (sh: MachineShape | null, md: Made | null, drawn = false) => (W: FormValues): FormValues => {
    let X = W;
    const D = num(X, 'n_D'), g = scheme ? bottomGeo(L, scheme, D, num(X, 'Dp'), num(X, 'n_n'), num(X, 'n_d'), num(X, 'r'), sheaveAxisBelow(D, sh),
      sheaveHalfBelow(D, num(X, 'n_n'), num(X, 'n_d'), sh)) : null;
    const rf = rinvioFor(X, sh, md);
    if (g) X = { ...X, nps: npsEntered + extraBends(g), ...(inp.auto.Hv || drawn ? { Hv: m3((g.zHead - g.zSheave) / 1000) } : {}) };
    if (inp.auto.L0 || drawn) X = { ...X, L0: ropeBeyond(S, X, g ? g.zHead - Sec.ceiling : null, sh, rf) };
    if (inp.auto.dx && rf) X = { ...X, h: m3((sheaveAxis(S.room, D, sh, rf) - rf.pulleyAxis) / 1000) };
    if (inp.auto.dx) X = { ...X, dx: deflectorDx(L, X).dx };
    return X;
  };
  const geometry = (W: FormValues): FormValues => geometryOf(shape, made)(W);
  V = geometry(mirrorRopes(V));
  // the diverting pulley's distance comes from the plan: only geometries the wrap-angle model reads as drawn
  const p0 = readInputs(V), c0 = p0.I, planned = inp.auto.dx && c0.layout === 'topDefl' && c0.alphaMode !== 'manual';
  // a direct pull hangs the falls from the sheave's two sides: its pitch diameter is their spacing in the plan, so the
  // proposal takes that sheave (within the grid's range; direct.ts); when the existing machine is compared, its sheave
  // set the hitches and the new one may differ (the calculation inclines the ropes)
  const direct = c0.layout === 'top', oldHitches = direct && !planFalls(p0);
  const fallD = direct ? Math.round(fallSpacing(L, V)) : 0;
  const only = direct && !oldHitches ? dropSheaves(fallD) : null;
  let noProposal = false, catalog: LiftDerived['catalog'] = null;
  if (inp.auto.machine) {
    // from the maker chosen when one of its machines takes an option, else from the calculation grid; the machine below
    // beside the shaft only from the long-shaft and outboard-support variants (the sheave through the wall).
    // A maker's machine: its geometry as it stands (its axis, its bedplate), its motor, groove and brake sized again on
    // it (catalog.ts), the diverting pulley still where the plan places it
    const finish = (fit: CatalogFit, W: FormValues): FormValues | null => {
      const X = geometryOf(machineShapeOf(fit), fit.machine)(W), own = catalogValues(fit, X), Y = own ? { ...X, ...own } : null;
      return Y && !(planned && !deflectorDx(L, Y).fits) ? Y : null;
    };
    const choice = inp.catalog && throughWall(V.layout, scheme) ? { ...inp.catalog, wall: true } : inp.catalog;
    const fromCat = choice ? propose(V, L, geometry, planned, (o, W) => catalogFits(choice, o, num(W, 'Q'), num(W, 'r')), only, offGrid(choice), finish) : null;
    const proposed = fromCat ?? propose(V, L, geometry, planned, null, only);
    if (choice) catalog = { fit: fromCat?.fit ?? null, miss: fromCat ? false : choice.wall && !choiceMachines(choice).length ? 'wall' : 'checks' };
    if (proposed) V = proposed.V;
    else noProposal = true;
    // the maker's machine stands on our bedframe: where its own axis is higher than the generic machine's, the rope
    // beyond the travel (and a machine below's Hv) follow it
    shape = proposed && fromCat ? machineShapeOf(fromCat.fit) : null;
    made = proposed && fromCat?.fit ? fromCat.fit.machine : null;
    if (shape || made) V = geometry(V);
  }
  // a machine entered by hand (switched off from the proposal, carried from the calculator) whose values are a
  // catalogue's — ratio, static load, mass, sheave (known.ts: as the relazione names it and the loads weigh it): that
  // machine as it stands, as if proposed (its axis, its bedplate), so the drawings, the 3D and its support's checks are
  // the machine the documents name
  const own = made || (inp.auto.machine && !noProposal) ? null : readInputs(V), known = own ? catalogMachineOf(own.I, own.N, modelOf(V)) : null;
  if (known) {
    shape = machineShapeOf(known);
    made = known.machine;
    catalog = { fit: known, miss: catalog?.miss ?? false };
    V = geometry(V);
  }
  const analysis = analyse(V, true), { I, N, O } = analysis.ctx;
  // a distance the plan cannot give is reported: it must be measured and entered; falls of a direct pull that are not
  // the sheave's diameter apart contradict the plan (registry impianto.calata)
  const calata = direct ? fallSpacing(L, V) : null;
  const rinvio = rinvioFor(V), pulleyRim = rinvio ? sheaveAxis(S.room, N.D, shape, rinvio) - I.h * 1000 - I.Dp / 2 : 0;
  // L0 and a machine below's Hv entered by hand against the design's (drawn.ts)
  const G0 = geometryOf(shape, made, true)(V), drawn: Drawn = { L0: inp.auto.L0 ? null : num(G0, 'L0'), Hv: scheme && !inp.auto.Hv ? num(G0, 'Hv') : null };
  const issues: IssueKey[] = [
    ...drawnIssues({ L0: I.L0, Hv: I.Hv }, drawn),
    ...(planned && !deflectorDx(L, V).fits ? ['dx' as const] : []),
    ...(rinvio && pulleyRim < 0 ? ['rinvio' as const] : []),
    ...(calata !== null && Math.abs(calata - (oldHitches ? O.D : N.D)) > KL.calataTol ? ['calata' as const] : []),
  ];
  const spec = machineSpec(analysis.ctx, analysis.ctx.N.mass, '', S.room, shape, made);
  const machine: MachineSpec = spec.rinvio ? { ...spec, rinvio: { ...spec.rinvio, auto: inp.auto.dx } } : spec;
  // the governor's rope on the other free side wall when only there the governor stands clear of the machine in the
  // room (registry limitatore.posto), the control panel where the software puts it for this machine (registry
  // locale.quadro.posto): the design goes on with them there (the room's drawings, the 3D, the shaft's record)
  const govSide = S.room && I.layout !== 'bottom' ? governorSideFor(L, machine) : null;
  const Sg: ShaftInputs = govSide ? { ...S, governorSide: govSide } : S, Lg = govSide ? layout(Sg) : L;
  const spot = inp.auto.panel && S.room && I.layout !== 'bottom' ? placedPanel(Lg, machine) : null;
  const Lp = spot && S.room ? layout({ ...Sg, room: { ...S.room, panelWall: spot.wall, panelAt: spot.at } }) : Lg;
  const origin: Record<DerivedKey, Origin> = {
    Q: S.Q === null ? 'auto' : 'entered', v: 'entered', H: 'auto', P: inp.auto.P ? 'estimate' : 'entered',
    L0: inp.auto.L0 ? 'auto' : 'entered', dx: inp.auto.dx ? 'auto' : 'entered', Hv: inp.auto.Hv ? 'auto' : 'entered',
    machine: inp.auto.machine && !noProposal ? 'auto' : 'entered', panel: spot ? 'auto' : 'entered',
  };
  // the beams under the machine (with the maker's bedplate it stands on) and the machine in its room; the car's highest
  // part under what hangs over it. The whole machine is the catalogue's model the proposal took, else the one the values
  // are (one entered by hand, carried from the replacement's calculator): as the relazione names it (known.ts); the ropes
  // at their cut length on the rope rig (sheet 1 and the bill take the same)
  const load = supportLoad(analysis.ctx, analysis.res.Mcw, {
    machine: carriedMass(roomGeo(Lp, machine), machine, N, massModelOf(I, N, V, made)), rope: rigLength({ layout: Lp, analysis, machine, bottom: scheme }),
  }), above = I.layout !== 'bottom';
  // the diverting pulley up over the bedplate's top into the machine (an h or a height set by hand): as the replacement says
  const clash = rinvio && pulleyRim < 0 ? 'floor' : above && machine.rinvio ? rinvioClash(roomGeo(Lp, machine), machine) : null;
  if (clash && !issues.includes('rinvio')) issues.push('rinvio');
  const g = scheme ? bottomGeo(L, scheme, N.D, I.Dp, N.n, N.d, I.r, sheaveAxisBelow(N.D, shape), sheaveHalfBelow(N.D, N.n, N.d, shape)) : null;
  // a machine below: its room as a machine room, the pulley room over the shaft (below-checks.ts)
  // the rope rig in the shaft (shaft-rig.ts): the car roof's spaces under what hangs there, the 3D and the sheets
  const Lr = withRig(Lp, I.r, I.Dp, N.n, N.d, g), head = refugeHeadroom(Lr);
  const supportCk = [...supportChecks(Lp, machine, load, above), ...headTopChecks(Lr, I.r, I.Dp, scheme), ...(g ? belowChecks(Lp, g, machine, I.Dp) : [])];
  // the clearance on the counterweight's sign with the car's top under what hangs over it (cw-gap.ts)
  supportCk.push(...cwGapOver(Lp, supportCk));
  // a modification: the existing room's height under 2,0 m (UNI 10411-1:2024, 9.2; registry locale.esistente.altezza)
  if (V.context === 'repl' && above && Lp.inputs.room) supportCk.push(existingRoomCheck(Lp.inputs.room));
  // a modification that keeps the sling under a new car or rated load: the sling for the new loads (arcata.ts)
  const collaudo = collaudoOf(V, inp.collaudo), sling = slingCheck(collaudo, carichiOf(V));
  if (sling) supportCk.push(sling);
  const beams = above ? hebOf(Lp, machine, load) : null, chosenBy = Lp.inputs.room?.heb;
  const bottomGap = scheme && g && !g.fits ? { now: S.cwWallGap, need: bottomGapNeeded(S, scheme, N.D, I.Dp, N.n, N.d, I.r, sheaveHalfBelow(N.D, N.n, N.d, shape)) } : null;
  return {
    shaft: Lp.inputs, values: V, layout: Lr, analysis, origin, noProposal, issues, calata, rinvioClash: clash, machine, supportChecks: supportCk, bottom: scheme, bottomGap,
    refugeHead: head !== null ? { now: Lp.inputs.vertical.headroom, need: head } : null,
    heb: beams && chosenBy ? { ...beams, auto: { profile: !chosenBy.profile, dir: !chosenBy.dir } } : null,
    headPulleys: g ? 2 + extraBends(g) : 0, catalog, collaudo, drawn,
    sim: simModel(I, N, analysis.res, Sec, vt),
  };
}

/**
 * The derivation of the form. The HEB beams on the shaft's walls (registry locale.putrelle.vano) raise the machine by
 * their height, which the rope beyond the travel and the diverting pulley's h follow: with their profile or direction
 * left to the software, the form is derived with the tallest (or the profile chosen), the beams taken among the six for
 * that machine and that load, and — when another profile — derived again on them; the design goes on with them named in
 * its room (the drawings, the 3D, the shaft's record), marked as the software's.
 */
export function deriveLift(inp: LiftInputs): LiftDerived {
  const R = inp.shaft.room, chosenBy = R?.heb, first = deriveOnce(inp), taken = first.heb?.chosen;
  if (!R || !chosenBy || (chosenBy.profile && chosenBy.dir) || !first.heb || !taken) return first;
  const auto = { profile: !chosenBy.profile, dir: !chosenBy.dir }, heb = { profile: taken.profile, dir: taken.dir };
  if (taken.profile !== (chosenBy.profile ?? HEB_PROFILES[HEB_PROFILES.length - 1])) {
    const again = deriveOnce({ ...inp, shaft: { ...inp.shaft, room: { ...R, heb } } });
    return { ...again, heb: again.heb ? { ...again.heb, auto } : null };
  }
  // the same profile: only the room names the beams taken
  const own = first.shaft.room, shaft = own ? { ...first.shaft, room: { ...own, heb } } : first.shaft;
  return { ...first, shaft, layout: { ...first.layout, inputs: shaft }, heb: { ...first.heb, auto } };
}
