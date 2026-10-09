// A value the one form's software worked out, switched to entered, starts from the one the software showed, so that
// nothing jumps (LiftWorkspace setAuto). For the machine that is every value of the new machine — its fields and its
// ropes as the calculator has them (components/calc/fields.ts) and the catalogue's model it is (n_model): the sizing
// option's and, from a catalogue, the catalogue's own (lift/catalog.ts catalogValues, its mass besides). So a
// catalogue's machine switched to entered is still that machine (known.ts), and the derivation draws and checks it as
// it stands (derive.ts). Pure: the form and its tests share it.
import type { FormValues } from '@/calc/types';
import { MACHINE, ROPES } from '@/components/calc/fields';
import type { AutoFlags, LiftDerived } from './derive';

/** The values of the new machine: those a proposal (from the grid or from a catalogue) fills. */
export const NEW_MACHINE_FIELDS: readonly string[] = [...MACHINE('n_'), ...ROPES('n_')].map((f) => f.id).concat('n_model');

type Switch = Exclude<keyof AutoFlags, 'panel'>;

/** The calculator's values that switching the automatic values `patch` off seeds, each as the derivation `d` shows it
 *  (the panel's wall and place are entered apart: panel-form.ts). */
export function enteredSeed(d: Pick<LiftDerived, 'origin' | 'values'>, patch: Partial<AutoFlags>): Record<string, string | number | boolean> {
  const ids: Readonly<Record<Switch, readonly string[]>> = {
    P: ['P'], L0: ['L0'], dx: ['dx'], Hv: ['Hv'], machine: d.origin.machine === 'auto' ? NEW_MACHINE_FIELDS : [],
  };
  const seed: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(ids) as Switch[]) {
    if (patch[k] !== false) continue;
    for (const id of ids[k]) {
      const v: FormValues[string] = d.values[id];
      if (v !== undefined) seed[id] = v;
    }
  }
  return seed;
}
