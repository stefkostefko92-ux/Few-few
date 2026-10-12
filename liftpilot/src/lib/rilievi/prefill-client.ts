// The browser's rules for the suppliers' modules while the survey is typed (rilievi's public/js/app.js, the same as
// ordini/prefill.ts on the server): when a module's question turns to "Sì", every prefilled field of it the person has
// not touched yet and that is still empty takes its value from the survey as it stands; a tick is set when the survey
// has the option ticked. Pure: the form gives the survey's current values (the shape of FormValues, e.g. from
// `valuesOfForm`), the component applies the result to the inputs it has not marked as touched.
import type { FormValues } from './field-parsers';
import { rifImpianto } from './ordini/prefill';

/** The text a token gives from the survey on the screen (app.js `surveyText`). The company has no select in LiftPilot
 *  (one company per user), so «azienda» is '' here as for a non-MASTER in rilievi: the server prefilled it already. */
export function surveyText(token: string, values: FormValues): string {
  const value = (key: string): string => {
    const v = values[key];
    return typeof v === 'string' ? v.trim() : '';
  };
  if (token === 'data') {
    const day = value('data');
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : '';
  }
  if (token === 'rif') return rifImpianto(values);
  if (token === 'accessi') {
    const doppio = values.doppioAccesso;
    return doppio === 'si' ? '2' : doppio === 'no' ? '1' : '';
  }
  if (token === 'azienda') return '';
  return value(token);
}

/** A tick's prefill (`tipoPorte=MANUALI`) holds in the survey on the screen (app.js: the option is checked). */
export function surveyTicked(token: string, values: FormValues): boolean {
  const [name = '', option = ''] = token.split('=');
  const v = values[name];
  return Array.isArray(v) ? v.includes(option) : v === option;
}

/** The new value of one prefilled input of a module, or null to leave it: a checkbox only gets ticked (never unticked),
 *  a text only when it is empty, cut to its maxlength (app.js `prefillModulo`). Untouched inputs only — the caller
 *  skips those the person has typed in. */
export function prefillInput(input: { kind: 'check' | 'text' | 'textarea'; prefill: string; value: string | boolean; maxLength: number | null }, values: FormValues): string | boolean | null {
  if (input.kind === 'check') return input.value !== true && surveyTicked(input.prefill, values) ? true : null;
  if (input.value) return null;
  const text = surveyText(input.prefill, values);
  const cut = input.maxLength && input.maxLength > 0 ? text.slice(0, input.maxLength) : text;
  return cut ? cut : null;
}

/** The survey's values of a form element as FormValues (a repeated name — the ticks — as a list), for the rules above
 *  and for activeFields (fields.ts) while typing. */
export function valuesOfForm(form: HTMLFormElement): FormValues {
  const out: FormValues = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== 'string') continue;
    const before = out[key];
    out[key] = before === undefined ? value : Array.isArray(before) ? [...before, value] : [before, value];
  }
  return out;
}

/** The rows of the measurements the form shows for what is typed in «Fermate» (app.js: 1..300, otherwise none; rows
 *  above the number are hidden, never removed, and are not read by the server). */
export function misureRowsFor(fermate: string, max = 300): number {
  const raw = fermate.trim();
  const n = /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
  return n >= 1 && n <= max ? n : 0;
}
