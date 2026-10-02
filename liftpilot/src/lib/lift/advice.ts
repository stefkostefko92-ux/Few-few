// The machine to order among the makers whose whole range of geared machines the software holds (SICOR and Montanari,
// src/lib/catalog/machines.ts): for each, its proposal for the installation — the smallest of its machines that takes
// the option of the sizing, as the proposal from a catalogue takes it (catalog.ts) —, the calculation's outcome with it
// and, with a diverting pulley, the maker's bedplate that carries machine and pulley (src/lib/catalog/bedplates.ts);
// then which to order. The ranking, criterion after criterion: no check failed, fewer warnings, the maker's bedplate
// with the pulley when there is one (one supply, the maker's heights), the smallest machine that suffices (the static
// load it allows: price and mass follow the size), the speed nearest the rated one, the lighter. Pure.
import type { CheckStatus, FormValues, Machine, Plant, Results } from '@/calc/types';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { catalogFit, catalogOf, type Brand, type CatalogFit } from '@/lib/catalog/machines';
import { analyse, mirrorRopes, proposalValues } from '@/lib/present/analysis';
import type { MakerBedplate } from '@/shaft/rinvio';
import { bestFit, catalogValues, pickOption } from './catalog';
import { deriveLift, type LiftDerived, type LiftInputs } from './derive';
import { KL } from './norme';

/** The makers the advice compares. */
export const ADVICE_BRANDS: readonly Brand[] = ['SICOR', 'Montanari'];

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
  fails: number;
  warns: number;
  /** the brand's other machines that take the same sheave, ropes, load and motor, the smallest first */
  others: string[];
  src: string;
  /** the calculator's values that load it (the replacement's calculator); empty for the one form, which takes the brand
   *  and model */
  values: FormValues;
}

/** Why the first comes before the second: the first criterion that tells them apart; 'only' with one candidate. */
export type AdviceReason = 'checks' | 'warns' | 'bedplate' | 'smaller' | 'speed' | 'lighter' | 'only';

export interface MachineAdvice {
  /** best first */
  candidates: MachineCandidate[];
  /** the makers none of whose machines takes an option of the sizing */
  none: Brand[];
  why: AdviceReason | null;
}

const count = (checks: readonly { status: CheckStatus }[], s: CheckStatus): number => checks.filter((c) => c.status === s).length;

/** The criteria in order: negative when `a` ranks first. */
const CRITERIA: readonly [Exclude<AdviceReason, 'only'>, (a: MachineCandidate, b: MachineCandidate) => number][] = [
  ['checks', (a, b) => a.fails - b.fails],
  ['warns', (a, b) => a.warns - b.warns],
  ['bedplate', (a, b) => Number(b.bedplate !== null) - Number(a.bedplate !== null)],
  ['smaller', (a, b) => a.staticKg - b.staticKg],
  ['speed', (a, b) => Math.abs(a.dv) - Math.abs(b.dv)],
  ['lighter', (a, b) => (a.mass ?? Infinity) - (b.mass ?? Infinity)],
];

export function rankCandidates(found: readonly MachineCandidate[], none: readonly Brand[]): MachineAdvice {
  const by = (a: MachineCandidate, b: MachineCandidate): number => {
    for (const [, f] of CRITERIA) { const d = f(a, b); if (d) return d; }
    return 0;
  };
  const candidates = [...found].sort(by), [a, b] = candidates;
  const why = !a ? null : !b ? 'only' : CRITERIA.find(([, f]) => f(a, b) < 0)?.[0] ?? null;
  return { candidates, none: [...none], why };
}

/** The candidate of the machine `fit` of the catalogue, verified with the installation I and the machine N (results
 *  `res`, its failures and warnings), on `bedplate`; `values`: what loads it into the calculator. */
export function candidateOf(fit: CatalogFit, I: Plant, N: Machine, res: Results, fails: number, warns: number, bedplate: MakerBedplate | null, values: FormValues): MachineCandidate | null {
  const c = fit.machine;
  if (!fit.ratio) return null;
  // the same sheave, ropes, load and motor taken by the brand's other machines (as the proposal reads the catalogue)
  const iIdeal = fit.i * (1 + fit.dv), testKg = res.shaft.testKg;
  const others = catalogOf(c.brand).filter((x) => !x.byName && x.model !== c.model)
    .map((x) => catalogFit(x, { D: N.D, iIdeal, Pn: N.Pn, staticKg: testKg, Q: I.Q, r: I.r }, KL.catalogRatioTol))
    .filter((f) => f.fails.length === 0).sort((x, y) => x.machine.staticKg - y.machine.staticKg).map((f) => f.machine.model);
  return {
    brand: c.brand, model: c.model, ratio: fit.ratio, i: fit.i, dv: fit.dv, I, N, Mcw: res.Mcw, testKg, staticKg: c.staticKg, mass: c.mass, kWmax: c.kWmax,
    bedplate, fails, warns, others, src: c.src, values,
  };
}

/** The machine of the catalogue the one form derived (`d.catalog`), as a candidate: its checks with the support's, an
 *  issue of the geometry as a failure, the bedplate it stands on; null without one. */
export function derivedCandidate(d: LiftDerived): MachineCandidate | null {
  const fit = d.catalog?.fit, { I, N } = d.analysis.ctx, res = d.analysis.res, checks = [...res.checks, ...d.supportChecks], rf = d.machine.rinvio;
  return fit ? candidateOf(fit, I, N, res, count(checks, 'fail') + d.issues.length, count(checks, 'warn'), rf?.on === 'frame' ? rf.maker : null, {}) : null;
}

/** The advice for the one form: each maker's proposal derived as the form derives it with that maker chosen (the
 *  machine proposed even when entered by hand). */
export function liftAdvice(inp: LiftInputs): MachineAdvice {
  const found: MachineCandidate[] = [], none: Brand[] = [];
  for (const brand of ADVICE_BRANDS) {
    const c = derivedCandidate(deriveLift({ ...inp, catalog: { brand }, auto: { ...inp.auto, machine: true } }));
    if (c) found.push(c);
    else none.push(brand);
  }
  return rankCandidates(found, none);
}

/** The advice for the calculator's values (the replacement): each maker's machine for the options of the sizing, as
 *  the proposal from a catalogue takes it, and the calculation with its values; the maker's bedplate by the sheave and
 *  the diverting pulley of the values. */
export function valuesAdvice(V: FormValues): MachineAdvice {
  const a = analyse(V), { I } = a.ctx, found: MachineCandidate[] = [], none: Brand[] = [];
  for (const brand of ADVICE_BRANDS) {
    const fits = a.sizing.options.flatMap((o) => { const fit = bestFit({ brand }, o, I.Q, I.r); return fit ? [{ o, fit }] : []; });
    const best = pickOption(fits, a.sizing.keep !== null);
    const values = best ? { ...proposalValues(best.o), ...catalogValues(best.fit) } : null;
    const b = values ? analyse(mirrorRopes({ ...V, ...values })) : null;
    const c = best && values && b ? candidateOf(best.fit, b.ctx.I, b.ctx.N, b.res, b.res.fails.length, count(b.res.checks, 'warn'),
      b.ctx.I.layout === 'topDefl' ? makerBedplate(brand, best.fit.machine.model, b.ctx.N.D, b.ctx.I.Dp) : null, values) : null;
    if (c) found.push(c);
    else none.push(brand);
  }
  return rankCandidates(found, none);
}
