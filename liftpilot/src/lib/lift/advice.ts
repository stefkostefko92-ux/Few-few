// The machine to order among the makers whose whole range of geared machines the software holds (SICOR and Montanari,
// src/lib/catalog/machines.ts). Every model of theirs is verified on its own: its proposal for the installation (the
// option of the sizing it takes, as the proposal from a catalogue takes it, catalog.ts), the calculation's outcome with
// it, the room it must fit, and with a diverting pulley the maker's bedplate that carries machine and pulley
// (src/lib/catalog/bedplates.ts). Then the ranking, on the data alone (no price), criterion after criterion: no check
// failed; data from the maker's documents rather than from extracts of its pages; the maker's bedplate with the pulley
// (one supply, the maker's heights); the smallest machine that suffices (static load: an oversized machine loads the
// building and the room for nothing, and passing checks are what makes one acceptable — a bigger one is not taken for
// its margins); fewer values at the limit; drawn as it is (the maker's dimensions: the drawings and the room's check
// exact); the speed nearest the rated one (to 1 %); the lighter. Pure: the screens may spread the models over time
// (ADVICE_MODELS, one candidate each).
import type { CheckStatus, FormValues, Machine, Plant, Results } from '@/calc/types';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { catalogOf, type Brand, type CatalogFit } from '@/lib/catalog/machines';
import { shapeOf } from '@/lib/catalog/shapes';
import { analyse, mirrorRopes, proposalValues, type Analysis } from '@/lib/present/analysis';
import type { MakerBedplate } from '@/shaft/rinvio';
import { bestFit, catalogValues, pickOption } from './catalog';
import { deriveLift, type LiftDerived, type LiftInputs } from './derive';

/** The makers the advice compares, and every model of theirs it verifies (those proposed only by name are out). */
export const ADVICE_BRANDS: readonly Brand[] = ['SICOR', 'Montanari'];
export interface AdviceModel { brand: Brand; model: string }
export const ADVICE_MODELS: readonly AdviceModel[] =
  ADVICE_BRANDS.flatMap((brand) => catalogOf(brand).filter((c) => !c.byName).map((c) => ({ brand, model: c.model })));

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
  /** the counterweight's mass [kg] */
  Mcw: number;
  /** the load on the sheave's shaft in the test [kg] and what the machine allows */
  testKg: number;
  staticKg: number;
  mass: number | null;
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
  ['lighter', (a, b) => (a.mass ?? Infinity) - (b.mass ?? Infinity)],
];

const rank = (a: MachineCandidate, b: MachineCandidate): number => {
  for (const [, f] of CRITERIA) { const d = f(a, b); if (d) return d; }
  return 0;
};

/** The advice from the candidates found (any order). */
export function adviceOf(found: readonly MachineCandidate[]): MachineAdvice {
  const candidates = [...found].sort(rank);
  const best = ADVICE_BRANDS.flatMap((b) => candidates.find((c) => c.brand === b) ?? []).sort(rank), [a, b] = best;
  const why = !a ? null : !b ? 'only' : CRITERIA.find(([, f]) => f(a, b) < 0)?.[0] ?? null;
  return { candidates, best, none: ADVICE_BRANDS.filter((x) => !candidates.some((c) => c.brand === x)), why };
}

/** The candidate of the machine `fit` of the catalogue, verified with the installation I and the machine N (results
 *  `res`, its failures and warnings), on `bedplate`; `values`: what loads it into the calculator. */
export function candidateOf(fit: CatalogFit, I: Plant, N: Machine, res: Results, fails: number, warns: number, bedplate: MakerBedplate | null,
  values: FormValues): MachineCandidate | null {
  const c = fit.machine;
  if (!fit.ratio) return null;
  return {
    brand: c.brand, model: c.model, ratio: fit.ratio, i: fit.i, dv: fit.dv, I, N, Mcw: res.Mcw, testKg: res.shaft.testKg, staticKg: c.staticKg,
    mass: c.mass, kWmax: c.kWmax, bedplate, drawn: shapeOf(c.brand, c.model) !== null, fails, warns, src: c.src, sources: sourcesOf(c.src), values,
  };
}

/** The machine of the catalogue the one form derived (`d.catalog`), as a candidate: its checks with the support's and
 *  the room's, an issue of the geometry as a failure, the bedplate it stands on; null without one. */
export function derivedCandidate(d: LiftDerived): MachineCandidate | null {
  const fit = d.catalog?.fit, { I, N } = d.analysis.ctx, res = d.analysis.res, checks = [...res.checks, ...d.supportChecks], rf = d.machine.rinvio;
  return fit ? candidateOf(fit, I, N, res, count(checks, 'fail') + d.issues.length, count(checks, 'warn'), rf?.on === 'frame' ? rf.maker : null, {}) : null;
}

/** One model for the one form: derived as the form derives it with that model chosen (proposed even when the machine
 *  is entered by hand). */
export const liftCandidate = (inp: LiftInputs, m: AdviceModel): MachineCandidate | null =>
  derivedCandidate(deriveLift({ ...inp, catalog: { brand: m.brand, model: m.model }, auto: { ...inp.auto, machine: true } }));

/** One model for the calculator's values `V` (their analysis `a`): the option of the sizing it takes, the calculation
 *  with its values, the maker's bedplate by the sheave and the diverting pulley of the values. */
export function valuesCandidate(V: FormValues, a: Analysis, m: AdviceModel): MachineCandidate | null {
  const { I } = a.ctx;
  const fits = a.sizing.options.flatMap((o) => { const fit = bestFit(m, o, I.Q, I.r); return fit ? [{ o, fit }] : []; });
  const best = pickOption(fits, a.sizing.keep !== null);
  if (!best) return null;
  const values = { ...proposalValues(best.o), ...catalogValues(best.fit) }, b = analyse(mirrorRopes({ ...V, ...values })), N = b.ctx.N;
  return candidateOf(best.fit, b.ctx.I, N, b.res, b.res.fails.length, count(b.res.checks, 'warn'),
    b.ctx.I.layout === 'topDefl' ? makerBedplate(m.brand, m.model, N.D, b.ctx.I.Dp) : null, values);
}

/** The whole advice at once (the server, the documents, the tests). */
export const liftAdvice = (inp: LiftInputs): MachineAdvice => adviceOf(ADVICE_MODELS.flatMap((m) => liftCandidate(inp, m) ?? []));

/** With direct pull the sheave is the rope drop of the plan: the same inputs with the diverting pulley in the machine
 *  room (on the machine's bedplate), whose traction sheave is then free; null when the layout is not direct pull. */
export const deflectorInputs = (inp: LiftInputs): LiftInputs | null => (inp.calc.layout === 'top' ? { ...inp, calc: { ...inp.calc, layout: 'topDefl' } } : null);

/** The advice with the diverting pulley when direct pull finds no machine of the advice's makers; null otherwise. */
export function liftAlternative(inp: LiftInputs, advice: MachineAdvice): MachineAdvice | null {
  const d = advice.candidates.length ? null : deflectorInputs(inp);
  return d ? liftAdvice(d) : null;
}
export function valuesAdvice(V: FormValues): MachineAdvice {
  const a = analyse(V);
  return adviceOf(ADVICE_MODELS.flatMap((m) => valuesCandidate(V, a, m) ?? []));
}
