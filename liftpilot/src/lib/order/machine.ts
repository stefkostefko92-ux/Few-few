// Which machine the draft order is for. The machine the saved record verified, when it is one of the catalogue (the
// one form's maker and model; in the replacement's calculator, values that are a catalogue machine's: its ratio, its
// static load, its mass, its sheaves); else the first of the advice among SICOR and Montanari (src/lib/lift/advice.ts),
// verified with the same installation — the record verifies another machine, and the order says so. Pure.
import type { FormValues, Machine, Plant } from '@/calc/types';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { MACHINES, ratioValue, type CatalogFit, type CatalogMachine } from '@/lib/catalog/machines';
import { ADVICE_BRANDS, candidateOf, derivedCandidate, liftAdvice, valuesAdvice, type MachineAdvice, type MachineCandidate } from '@/lib/lift/advice';
import { deriveLift, type LiftInputs } from '@/lib/lift/derive';
import { analyse } from '@/lib/present/analysis';

export interface OrderMachine {
  machine: MachineCandidate;
  /** the saved record verified this machine; false: it verifies another, and this is the advice's first */
  recorded: boolean;
  advice: MachineAdvice;
}

const pick = (machine: MachineCandidate | null | undefined, recorded: boolean, advice: MachineAdvice): OrderMachine | null =>
  (machine ? { machine, recorded, advice } : null);

/** The order of a saved design (the one form's inputs). */
export function designOrder(inp: LiftInputs): OrderMachine | null {
  const advice = liftAdvice(inp), d = deriveLift(inp);
  const own = d.origin.machine === 'auto' ? derivedCandidate(d) : null;
  return pick(own, true, advice) ?? pick(advice.candidates[0], false, advice);
}

/** The catalogue's machine whose values the calculator holds: the ratio as the calculator takes it (to the thousandth),
 *  the static load, the mass when the catalogue gives one, the sheave in its range; the advice's makers and an equal
 *  mass first. */
export function catalogMachineOf(I: Plant, N: Machine): CatalogFit | null {
  const iIdeal = (Math.PI * (N.D / 1000) * N.nm) / (60 * I.v * I.r);
  const rank = (c: CatalogMachine): number => (c.mass === N.mass ? 0 : 4) + (ADVICE_BRANDS.includes(c.brand) ? 0 : 2) + (c.byName ? 1 : 0);
  const found = MACHINES.flatMap((c): CatalogFit[] => {
    const ratio = c.ratios.find((r) => Math.abs(Math.round(ratioValue(r) * 1000) / 1000 - N.i) < 1e-9);
    const fits = ratio !== undefined && c.staticKg === N.shaftMax && (c.mass === null || c.mass === N.mass) && (!c.sheaves || (N.D >= c.sheaves[0] && N.D <= c.sheaves[1]));
    return fits ? [{ machine: c, ratio, i: ratioValue(ratio), dv: iIdeal / ratioValue(ratio) - 1, fails: [] }] : [];
  });
  return found.sort((a, b) => rank(a.machine) - rank(b.machine))[0] ?? null;
}

/** The order of a saved calculation (the calculator's values). */
export function calcOrder(V: FormValues): OrderMachine | null {
  const advice = valuesAdvice(V), a = analyse(V), { I, N } = a.ctx, fit = catalogMachineOf(I, N);
  const own = fit ? candidateOf(fit, I, N, a.res, a.res.fails.length, a.res.checks.filter((c) => c.status === 'warn').length,
    I.layout === 'topDefl' ? makerBedplate(fit.machine.brand, fit.machine.model, N.D, I.Dp) : null, {}) : null;
  return pick(own, true, advice) ?? pick(advice.candidates[0], false, advice);
}
