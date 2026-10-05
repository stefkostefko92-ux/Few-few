// A replacement's calculator on a brand new project: nothing of the installation or of the machines filled in, only the
// software's standard values set (each marked as such in the form). Nothing is worked out until each step has what it
// needs: the installation (and the existing machine when it is compared) for the proposals and the advice, then the new
// machine for the verdict. An empty value is one the calculation flags (or, for the roping, would read as 1:1).
import type { FormValues } from '@/calc/types';
import { FIELD_IDS, LAYOUT, MACHINE, PLANT, ROPES, SERVICE } from '@/components/calc/fields';
import { visibleBad } from './calc-input';

/**
 * The software's standard values: the wrap angle from the geometry, the falls centred, the rope beyond the travel, no
 * extra bends, the shaft's efficiency, the design and braking decelerations, the rope's hanging length, ordinary
 * buffers, the motors' 50 Hz and 4 poles, and the assumptions the proposal sizes the new machine with (the gear's
 * efficiency, the motor's speed, the inertias, the groove's undercut) — the research's typical values, chapter 7.
 */
export const CALC_STANDARD: FormValues = {
  alphaMode: 'geo', dropAlign: 'center', L0: 2, nps: 0, npr: 0, etaShaft: 0.85, aDesign: 0.8, aBrake: 0.5, rh: 0.2, buffers: false,
  n_fn: 50, o_fn: 50, n_poles: '4', o_poles: '4', n_etaD: 0.7, n_nm: 1450, n_Jm: 0.08, n_Js: 2.5, n_gamma: 35,
};

/** A new calculation of a replacement: the existing machine compared, the new ropes keeping its number and diameter. */
export function blankCalc(): FormValues {
  return { ...Object.fromEntries(FIELD_IDS.map((id) => [id, ''])), context: 'repl', compare: true, keepD: false, keepRopes: true, ...CALC_STANDARD };
}

const isBlank = (V: FormValues, id: string): boolean => String(V[id] ?? '').trim() === '';

/** The form's order: the installation, the geometry, the existing machine and its ropes, the new machine and its ropes. */
const ORDER: readonly string[] = [...PLANT, ...LAYOUT, ...MACHINE('o_'), ...ROPES('o_'), ...MACHINE('n_'), ...ROPES('n_'), ...SERVICE].map((f) => f.id);
const orderOf = (id: string): number => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };

/** The fields still to enter that the form shows (the roping included), in the form's order: the installation's before
 *  the new machine's. */
export function calcMissing(V: FormValues, bad: readonly string[]): string[] {
  const out = visibleBad(bad, V).filter((id) => isBlank(V, id));
  if (isBlank(V, 'r') && !out.includes('r')) out.push('r');
  return out.sort((a, b) => orderOf(a) - orderOf(b));
}

/** Whether the proposals can be worked out: nothing of the installation (or of the existing machine) still to enter. */
export const plantReady = (missing: readonly string[]): boolean => missing.every((id) => id.startsWith('n_'));

/** A standard value still as the software set it. */
export const isStandard = (V: FormValues, id: string): boolean => id in CALC_STANDARD && String(V[id]) === String(CALC_STANDARD[id]);
