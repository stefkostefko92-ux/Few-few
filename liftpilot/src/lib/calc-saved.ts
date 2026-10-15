// The values a «Calcolo argano» is saved with (round 46). The form keeps every value as typed — switching the layout
// back brings back what was entered —, but a field it does not show in the current state is no value of the
// calculation: the save stores in its place the value the engine reads there and does not use (src/calc/inputs.ts),
// so that a field nobody can see never stops a save nor travels with the record (its inputs, its hash, the documents,
// the Progetto and the machine room drawn on it). One rule with the form: `inForm` (src/components/calc/fields.ts).
// The results are the same bit for bit (calc-saved.test.ts). Pure; shared by the calculator, the server's save and
// «Aggiorna con il software attuale».
import type { FormValues } from '@/calc/types';
import { FIELD_IDS, SERVICE, inForm } from '@/components/calc/fields';
import { CALC_STANDARD } from './calc-blank';
import { mirrorRopes } from './present/analysis';

/** Values a save keeps whatever the form shows: the calculation's context (the type of intervention sets it), the
 *  choices the type of intervention and the documents read (compare, keepRopes), the new ropes that follow the existing
 *  ones (mirrorRopes) and the catalogue's model of the new machine. */
const KEPT: ReadonlySet<string> = new Set(['context', 'compare', 'keepRopes', 'n_n', 'n_d', 'n_model']);

/** The engine's fallbacks (inputs.ts) where a blank value is flagged although the form hides the row: the geometry of
 *  the other layouts and ropings (read only by its own), the groove's undercut (read for a groove still to choose,
 *  which is flagged itself). */
const FALLBACK: FormValues = { dx: 0.3, h: 0.6, Hv: 24, Dp: 400, Jp: 0, n_beta: 90, o_beta: 90 };

/** The check boxes: off when out of view. */
const CHECKS: ReadonlySet<string> = new Set(['keepD', ...SERVICE.filter((f) => f.kind === 'check').map((f) => f.id)]);

/** What a field out of view is saved as: the engine's fallback, the software's standard value, a box off, else empty
 *  (a value the engine does not read in this state). */
export function neutralOf(id: string): FormValues[string] {
  if (id in FALLBACK) return FALLBACK[id];
  if (id in CALC_STANDARD) return CALC_STANDARD[id];
  return CHECKS.has(id) ? false : '';
}

/** The fields a save replaces in this state: every field out of view. */
export const outOfView = (V: FormValues): string[] => FIELD_IDS.filter((id) => !KEPT.has(id) && !inForm(id, V));

/** The values `values` as a save stores them: the ropes kept mirrored, every field out of view at its neutral value. */
export function savedValues(values: FormValues): FormValues {
  const V = mirrorRopes(values), out: Record<string, FormValues[string]> = { ...V };
  for (const id of outOfView(V)) out[id] = neutralOf(id);
  return out;
}
