// The machine to order among the makers whose whole range of geared machines the software holds (SICOR and Montanari,
// src/lib/catalog/machines.ts). Every model of theirs is verified on its own: its proposal for the installation (the
// option of the sizing it takes, as the proposal from a catalogue takes it, catalog.ts), the calculation's outcome with
// it, the room it must fit, and with a diverting pulley the maker's bedplate that carries machine and pulley
// (src/lib/catalog/bedplates.ts). Then the ranking, on the data alone (no price), criterion after criterion: no check
// failed; data from the maker's documents rather than from extracts of its pages; the maker's bedplate with the pulley
// (one supply, the maker's heights); the smallest machine that suffices (static load: an oversized machine loads the
// building and the room for nothing, and passing checks are what makes one acceptable — a bigger one is not taken for
// its margins); fewer values at the limit; drawn as it is (the maker's dimensions: the drawings and the room's check
// exact); the speed nearest the rated one (to 1 %); the lighter whole machine (what a catalogue's mass leaves out
// estimated, so that the makers compare alike). With the machine below beside the shaft, its sheave through the wall,
// only their long-shaft and outboard-support variants (WALL_MODELS). Pure: the screens may spread the models over time
// (ADVICE_MODELS, one candidate each).
import type { CheckStatus, FormValues, Machine, Plant, Results } from '@/calc/types';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { catalogOf, type Brand, type CatalogFit } from '@/lib/catalog/machines';
import { mountOf } from '@/lib/catalog/mounting';
import { shapeOf } from '@/lib/catalog/shapes';
import { analyse, mirrorRopes, proposalValues, type Analysis } from '@/lib/present/analysis';
import type { MakerBedplate } from '@/shaft/rinvio';
import { sizeMachine } from '@/calc/sizing';
import { catalogFits, catalogValues, firstTaken, offGrid, throughWall } from './catalog';
import { anchorPull, type AnchorPull } from './anchor';
import { ADVICE_BRANDS } from './known';
import { machineMass } from './machine-mass';
import { deriveLift, type LiftDerived, type LiftInputs } from './derive';

/** The makers the advice compares (known.ts, which ranks them first in recognising a machine), and every model of
 *  theirs it verifies (those proposed only by name are out). */
export { ADVICE_BRANDS };
export interface AdviceModel { brand: Brand; model: string }
export const ADVICE_MODELS: readonly AdviceModel[] =
  ADVICE_BRANDS.flatMap((brand) => catalogOf(brand).filter((c) => !c.byName).map((c) => ({ brand, model: c.model })));
/** With the machine below beside the shaft (the sheave through the wall, catalog.ts throughWall) the advice's makers'
 *  long-shaft and outboard-support variants instead, named only or not (registry impianto.basso.albero). */
export const WALL_MODELS: readonly AdviceModel[] =
  ADVICE_BRANDS.flatMap((brand) => catalogOf(brand).filter((c) => mountOf(c)).map((c) => ({ brand, model: c.model })));
/** The models the advice verifies: with the sheave through the wall or not. */
export const adviceModels = (wall: boolean): readonly AdviceModel[] => (wall ? WALL_MODELS : ADVICE_MODELS);
/** The sheave through the wall for the one form's inputs, for the calculator's values (no scheme: beside the shaft). */
export const liftWall = (inp: Pick<LiftInputs, 'calc' | 'bottom'>): boolean => throughWall(inp.calc.layout, inp.bottom);
export const valuesWall = (V: FormValues): boolean => throughWall(V.layout, null);

/** Where the catalogue's data of a machine come from, as its `src` marks them: a document of the maker (D), the maker's
 *  pages or extracts of them (E), a dealer (R), an earlier round (P). */
export type DataSource = 'D' | 'E' | 'R' | 'P';
export function sourcesOf(src: string): DataSource[] {
  const out: DataSource[] = [];
  for (const m of src.matchAll(/(?:^|;\s*)([DERP]):/g)) {
    const c = m[1] as DataSource;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export interface MachineCandidate {
  brand: Brand;
  model: string;
  /** the catalogue's ratio as it writes it, and its value */
  ratio: string;
  i: number;
  /** the car's speed with that ratio at the motor's rated speed, over the rated one, less 1 */
  dv: number;
  /** the installation and the machine the calculation verified with it */
  I: Plant;
  N: Machine;
  /** the counterweight's mass [kg] and the balance it gives (qeq/Q when the balance mass was entered, else k) */
  Mcw: number;
  k: number;
  /** the largest torque on the reducer's output shaft the calculation asks [N·m]; the least brake torque each set must
   *  give [N·m]; a machine below: the pulls on its anchors, at the test with 1,25·Q and with the rated load times the
   *  dynamic coefficient (anchor.ts; null above) */
  mpMax: number;
  brakeMin: number;
  anchor: AnchorPull | null;
  /** the load on the sheave's shaft in the test [kg] and what the machine allows */
  testKg: number;
  staticKg: number;
  /** the catalogue's mass as the maker writes it (null: none); the whole machine, the parts the catalogue leaves out
   *  estimated (machine-mass.ts), so that the makers compare alike, and whether it is an estimate */
  mass: number | null;
  massWhole: number | null;
  massEstimated: boolean;
  /** the largest motor the maker lists [kW] */
  kWmax: number | null;
  /** the maker's bedplate that carries the machine and the diverting pulley; null: none, or no pulley */
  bedplate: MakerBedplate | null;
  /** drawn as it is: the maker's dimensions (src/lib/catalog/shapes.ts) */
  drawn: boolean;
  fails: number;
  warns: number;
  src: string;
  /** where its data come from, the main one first */
  sources: DataSource[];
  /** the calculator's values that load it (the replacement's calculator); empty for the one form, which takes the brand
   *  and model */
  values: FormValues;
}

/** Why the first comes before the second: the first criterion that tells them apart; 'only' with one maker. */
export type AdviceReason = 'checks' | 'documented' | 'bedplate' | 'smaller' | 'warns' | 'drawn' | 'speed' | 'lighter' | 'only';

export interface MachineAdvice {
  /** every model that takes the installation, best first */
  candidates: MachineCandidate[];
  /** the first of each maker, best first */
  best: MachineCandidate[];
  /** the makers none of whose machines takes the installation */
  none: Brand[];
  /** why best[0] comes before best[1] */
  why: AdviceReason | null;
  /** the models verified (adviceModels) and whether they are those for the sheave through the wall */
  models: readonly AdviceModel[];
  wall: boolean;
}

const count = (checks: readonly { status: CheckStatus }[], s: CheckStatus): number => checks.filter((c) => c.status === s).length;

/** The criteria in order: negative when `a` ranks first. */
export const CRITERIA: readonly [Exclude<AdviceReason, 'only'>, (a: MachineCandidate, b: MachineCandidate) => number][] = [
  ['checks', (a, b) => a.fails - b.fails],
  ['documented', (a, b) => Number(b.sources[0] === 'D') - Number(a.sources[0] === 'D')],
  ['bedplate', (a, b) => Number(b.bedplate !== null) - Number(a.bedplate !== null)],
  ['smaller', (a, b) => a.staticKg - b.staticKg],
  ['warns', (a, b) => a.warns - b.warns],
  ['drawn', (a, b) => Number(b.drawn) - Number(a.drawn)],
  ['speed', (a, b) => Math.round(Math.abs(a.dv) * 100) - Math.round(Math.abs(b.dv) * 100)],
  ['lighter', (a, b) => (a.massWhole ?? Infinity) - (b.massWhole ?? Infinity)],
];

const rank = (a: MachineCandidate, b: MachineCandidate): number => {
  for (const [, f] of CRITERIA) { const d = f(a, b); if (d) return d; }
  return 0;
};

/** The advice from the candidates found (any order) among the models for the sheave through the wall (`wall`) or not. */
export function adviceOf(found: readonly MachineCandidate[], wall = false): MachineAdvice {
  const candidates = [...found].sort(rank);
  const best = ADVICE_BRANDS.flatMap((b) => candidates.find((c) => c.brand === b) ?? []).sort(rank), [a, b] = best;
  const why = !a ? null : !b ? 'only' : CRITERIA.find(([, f]) => f(a, b) < 0)?.[0] ?? null;
  return { candidates, best, none: ADVICE_BRANDS.filter((x) => !candidates.some((c) => c.brand === x)), why, models: adviceModels(wall), wall };
}

/** The candidate of the machine `fit` of the catalogue, verified with the installation I and the machine N (results
 *  `res`, its failures and warnings), on `bedplate`; `values`: what loads it into the calculator. */
export function candidateOf(fit: CatalogFit, I: Plant, N: Machine, res: Results, fails: number, warns: number, bedplate: MakerBedplate | null,
  values: FormValues): MachineCandidate | null {
  const c = fit.machine, whole = c.mass === null ? null : machineMass({ ...N, mass: c.mass }, c);
  if (!fit.ratio) return null;
  return {
    brand: c.brand, model: c.model, ratio: fit.ratio, i: fit.i, dv: fit.dv, I, N, Mcw: res.Mcw, k: res.k, mpMax: res.drive.MpMax,
    brakeMin: Math.max(res.brake.all / Math.max(1, res.brake.sets), res.brake.one, res.brake.up), anchor: anchorPull(res.shaft, N.mass), testKg: res.shaft.testKg, staticKg: c.staticKg,
    mass: c.mass, massWhole: whole?.kg ?? null, massEstimated: whole?.estimate ?? false, kWmax: c.kWmax, bedplate, drawn: shapeOf(c.brand, c.model) !== null,
    fails, warns, src: c.src, sources: sourcesOf(c.src), values,
  };
}

/** The machine of the catalogue the one form derived (`d.catalog`), as a candidate: its checks with the support's and
 *  the room's, an issue of the geometry as a failure, the bedplate it stands on; null without one. */
export function derivedCandidate(d: LiftDerived): MachineCandidate | null {
  const fit = d.catalog?.fit, { I, N } = d.analysis.ctx, res = d.analysis.res, checks = [...res.checks, ...d.supportChecks], rf = d.machine.rinvio;
  return fit ? candidateOf(fit, I, N, res, count(checks, 'fail') + d.issues.length, count(checks, 'warn'), rf?.on === 'frame' ? rf.maker : null, {}) : null;
}

/** One model for the one form: derived as the form derives it with that model chosen (proposed even when the machine
 *  is entered by hand). A candidate only where the proposal took it: where nothing is proposed the derivation falls back
 *  on the values entered, and the catalogue's machine they are (derive.ts, known.ts) is not the model tried. */
export function liftCandidate(inp: LiftInputs, m: AdviceModel): MachineCandidate | null {
  const d = deriveLift({ ...inp, catalog: { brand: m.brand, model: m.model }, auto: { ...inp.auto, machine: true } });
  return d.origin.machine === 'auto' ? derivedCandidate(d) : null;
}

/** One model for the calculator's values `V` (their analysis `a`): the option of the sizing it takes, the calculation
 *  with its values, the maker's bedplate by the sheave and the diverting pulley of the values. */
export function valuesCandidate(V: FormValues, a: Analysis, m: AdviceModel): MachineCandidate | null {
  const { I, fixedD, rope } = a.ctx, choice = { ...m, wall: throughWall(I.layout, null) };
  // the grid's options, and those of the model's own sheave off the grid (catalog.ts offGrid) unless the sheave is kept
  const own = fixedD ? [] : offGrid(choice).flatMap((D) => sizeMachine(I, a.ctx.N, D, rope).options);
  const fits = [...a.sizing.options, ...own].flatMap((o) => catalogFits(choice, o, I.Q, I.r).map((fit) => ({ o, fit })));
  // the first in the sizing's order the machine takes with its own ratio (motor, groove and brake sized again on it)
  const taken = firstTaken(fits, a.sizing.keep !== null, (x) => {
    const option = proposalValues(x.o), own = catalogValues(x.fit, mirrorRopes({ ...V, ...option }));
    return own ? { ...option, ...own } : null;
  });
  if (!taken) return null;
  const best = taken.x, values = taken.r, b = analyse(mirrorRopes({ ...V, ...values })), N = b.ctx.N;
  return candidateOf(best.fit, b.ctx.I, N, b.res, b.res.fails.length, count(b.res.checks, 'warn'),
    b.ctx.I.layout === 'topDefl' ? makerBedplate(m.brand, m.model, N.D, b.ctx.I.Dp) : null, values);
}

/** The whole advice at once (the server, the documents, the tests). */
export const liftAdvice = (inp: LiftInputs): MachineAdvice => {
  const wall = liftWall(inp);
  return adviceOf(adviceModels(wall).flatMap((m) => liftCandidate(inp, m) ?? []), wall);
};

/** With direct pull the sheave is the rope drop of the plan: the same inputs with the diverting pulley in the machine
 *  room (on the machine's bedplate), whose traction sheave is then free; null when the layout is not direct pull. */
export const deflectorInputs = (inp: LiftInputs): LiftInputs | null => (inp.calc.layout === 'top' ? { ...inp, calc: { ...inp.calc, layout: 'topDefl' } } : null);

/** The advice with the diverting pulley when direct pull finds no machine of the advice's makers; null otherwise. */
export function liftAlternative(inp: LiftInputs, advice: MachineAdvice): MachineAdvice | null {
  const d = advice.candidates.length ? null : deflectorInputs(inp);
  return d ? liftAdvice(d) : null;
}
export function valuesAdvice(V: FormValues): MachineAdvice {
  const a = analyse(V), wall = valuesWall(V);
  return adviceOf(adviceModels(wall).flatMap((m) => valuesCandidate(V, a, m) ?? []), wall);
}
