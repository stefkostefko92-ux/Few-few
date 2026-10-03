// A new installation to start from: a 1600 × 1750 mm shaft with five floors and a machine room above, the machine
// replaced with a diverting pulley, and everything the software can fill in left to it. The assumptions of the
// machine group (poles, speed, efficiencies, inertias) are those of example A of the research (illustrative).
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { defaultInputs } from '@/shaft';
import type { AutoFlags, LiftInputs } from './derive';

export const AUTO_ALL: AutoFlags = { P: true, machine: true, L0: true, dx: true, Hv: true };

const CALC_START: FormValues = {
  ...PRESETS.A, context: 'repl', layout: 'topDefl', alphaMode: 'geo', r: '1', compare: false, keepRopes: true, keepD: false, qeq: '',
};

export function defaultLift(): LiftInputs {
  return { shaft: defaultInputs(1600, 1750), calc: CALC_START, auto: AUTO_ALL };
}

/** A new installation of the module «Progetto completo»: the same start, as a new lift (tested to UNI EN 81-20/50, every
 *  check in its result; no existing ropes to keep). A machine replacement says so in the form. */
export function newLift(): LiftInputs {
  const d = defaultLift();
  return { ...d, calc: { ...d.calc, context: 'new' } };
}
