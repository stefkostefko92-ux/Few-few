// «Argano: No» in «Calcolo argano» (round 46): the machine kept is the existing one. Its fields — the new machine's in
// the form, under «Argano esistente (resta)» — take the existing machine's data as entered or measured (the survey seeds
// those, «dal rilievo»), never a catalogue's machine of an earlier calculation: no model, no catalogue's static load,
// torque or mass. The ropes that stay are those in place. Answered «Sì» again, the machine replaced comes back as it was
// before the «No», and the existing one keeps what was entered for it. Pure; the form calls it on the change of the answer.
import type { FormValues } from '@/calc/types';
import { MACHINE } from '@/components/calc/fields';
import { CALC_STANDARD } from './calc-blank';

/** The machine's keys without their prefix (D, groove, …, mass). */
const KEYS: readonly string[] = MACHINE('n_').map((f) => f.id.slice(2));
/** The ropes' keys: their number and diameter (kept in place), their breaking load and mass (the same ropes). */
const ROPE_KEYS = ['n', 'd'] as const, SAME_ROPE_KEYS = ['Fmin', 'qf'] as const;

const blank = (x: FormValues[string]): boolean => String(x ?? '').trim() === '';
/** A field of the new machine as a brand new form has it: the software's standard, else empty. */
const empty = (id: string): FormValues[string] => CALC_STANDARD[id] ?? '';

/** What the machine replaced held before the «No» (restored by a «Sì»). */
export function macchinaDi(V: FormValues): FormValues {
  return Object.fromEntries([...KEYS, ...ROPE_KEYS, ...SAME_ROPE_KEYS, 'model'].map((k) => [`n_${k}`, V[`n_${k}`]]));
}

/** The machine kept: its fields are the existing machine's (`o_…` as entered, else as a new form has them); the ropes
 *  in place stay (`funiRestano`: the same ropes, not new ones of their number and diameter). */
export function arganoResta(V: FormValues, funiRestano: boolean): FormValues {
  const out: Record<string, FormValues[string]> = { n_model: '' };
  for (const k of KEYS) out[`n_${k}`] = blank(V[`o_${k}`]) ? empty(`n_${k}`) : V[`o_${k}`];
  const ropes = V.keepRopes ? [...ROPE_KEYS, ...(funiRestano ? SAME_ROPE_KEYS : [])] : [];
  for (const k of ropes) if (!blank(V[`o_${k}`])) out[`n_${k}`] = V[`o_${k}`];
  return out;
}

/** The machine replaced again: the existing machine keeps what was entered for it (the kept machine's data where its
 *  own fields are empty), the new machine is the one replaced before the «No» (`prima`), else a brand new form's. */
export function arganoSostituito(V: FormValues, prima: FormValues | null): FormValues {
  const out: Record<string, FormValues[string]> = {};
  for (const k of [...KEYS, ...ROPE_KEYS, ...SAME_ROPE_KEYS]) if (blank(V[`o_${k}`]) && !blank(V[`n_${k}`])) out[`o_${k}`] = V[`n_${k}`];
  for (const k of [...KEYS, 'model']) out[`n_${k}`] = prima ? prima[`n_${k}`] ?? empty(`n_${k}`) : empty(`n_${k}`);
  if (prima) for (const k of [...ROPE_KEYS, ...SAME_ROPE_KEYS]) out[`n_${k}`] = prima[`n_${k}`] ?? '';
  return out;
}

/** The marks «dal rilievo» of the machine kept: the existing machine's, on its fields (the survey measured it). */
export function segniResta(valori: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...valori };
  for (const k of [...KEYS, ...ROPE_KEYS, ...SAME_ROPE_KEYS]) { const v = valori[`o_${k}`]; if (v !== undefined && out[`n_${k}`] === undefined) out[`n_${k}`] = v; }
  return out;
}
