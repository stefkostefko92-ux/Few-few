// Which machine the draft order is for. The machine the saved record verified, when it is one of the catalogue (the
// one form's maker and model; in the replacement's calculator, values that are a catalogue machine's: its ratio, its
// static load, its mass, its sheaves); else the first of the advice among SICOR and Montanari (src/lib/lift/advice.ts),
// verified with the same installation — the record verifies another machine, and the order says so. Pure.
import type { FormValues } from '@/calc/types';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { candidateOf, derivedCandidate, liftAdvice, valuesAdvice, type MachineAdvice, type MachineCandidate } from '@/lib/lift/advice';
import { deriveLift, type LiftDerived, type LiftInputs } from '@/lib/lift/derive';
import { catalogMachineOf, modelOf } from '@/lib/lift/known';
import { analyse } from '@/lib/present/analysis';

// the recognition of a catalogue's machine is the loads' too (known.ts): the importers of the order keep their names
export { catalogMachineOf, modelOf };

export interface OrderMachine {
  machine: MachineCandidate;
  /** the saved record verified this machine; false: it verifies another, and this is the advice's first */
  recorded: boolean;
  advice: MachineAdvice;
}

const pick = (machine: MachineCandidate | null | undefined, recorded: boolean, advice: MachineAdvice): OrderMachine | null =>
  (machine ? { machine, recorded, advice } : null);

/** The machine a saved design verified, when it is a catalogue's: the one the proposal took, or the one the machine
 *  entered by hand is (derive.ts; known.ts, as for a saved calculation). */
export const designMachine = (d: LiftDerived): MachineCandidate | null => derivedCandidate(d);

/** The order of a saved design (the one form's inputs); the advice and the derivation when the caller has them. */
export function designOrder(inp: LiftInputs, advice: MachineAdvice = liftAdvice(inp), d: LiftDerived = deriveLift(inp)): OrderMachine | null {
  return pick(designMachine(d), true, advice) ?? pick(advice.best[0], false, advice);
}

/** The machine a saved calculation verified, when its values are a catalogue machine's. */
export function calcMachine(V: FormValues): MachineCandidate | null {
  const a = analyse(V), { I, N } = a.ctx, fit = catalogMachineOf(I, N, modelOf(V));
  return fit ? candidateOf(fit, I, N, a.res, a.res.fails.length, a.res.checks.filter((c) => c.status === 'warn').length,
    I.layout === 'topDefl' ? makerBedplate(fit.machine.brand, fit.machine.model, N.D, I.Dp) : null, {}) : null;
}

/** The order of a saved calculation (the calculator's values); the advice when the caller has it. */
export function calcOrder(V: FormValues, advice: MachineAdvice = valuesAdvice(V)): OrderMachine | null {
  return pick(calcMachine(V), true, advice) ?? pick(advice.best[0], false, advice);
}
