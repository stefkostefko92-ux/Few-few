// The prefilled values of a module from the survey: date, the lift's number, stops, doors, load, ropes, machine
// position — and the company and the person writing. Only at the module's first opening; afterwards everything is
// edited. The browser applies the same rules while the survey is typed (prefill-client.ts). Ported 1:1 from rilievi
// (src/ordini/prefill.ts).
import type { FormValues } from '../field-parsers';
import { fieldsOf, type Modulo, type PrefillToken } from './moduli';
import { rifImpianto } from './rif';
import type { Valori } from './valori';

export { rifImpianto } from './rif';

export interface PrefillContext {
  /** The survey's values in the shape of the form. */
  values: FormValues;
  azienda: string;
  utente: string;
  ruolo: string;
  email: string;
}

const text = (values: FormValues, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value.trim() : '';
};


function textToken(token: PrefillToken, ctx: PrefillContext): string {
  switch (token) {
    case 'data': {
      const day = text(ctx.values, 'data');
      return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : '';
    }
    case 'rif':
      return rifImpianto(ctx.values);
    case 'azienda':
      return ctx.azienda;
    case 'utente':
      return ctx.utente;
    case 'ruolo':
      return ctx.ruolo;
    case 'email':
      return ctx.email;
    case 'accessi': {
      const doppio = ctx.values.doppioAccesso;
      return doppio === 'si' ? '2' : doppio === 'no' ? '1' : '';
    }
    default:
      return text(ctx.values, token);
  }
}

function checked(token: string, values: FormValues): boolean {
  const [name = '', option = ''] = token.split('=');
  const value = values[name];
  return Array.isArray(value) ? value.includes(option) : value === option;
}

/** The module's values from the survey — only where there is something to take. */
export function prefillValori(modulo: Modulo, ctx: PrefillContext): Valori {
  const valori: Valori = {};
  for (const field of fieldsOf(modulo)) {
    if (!field.prefill) continue;
    if (field.kind === 'check') {
      if (checked(field.prefill, ctx.values)) valori[field.key] = true;
      continue;
    }
    const value = textToken(field.prefill, ctx).slice(0, field.maxLength);
    if (value) valori[field.key] = value;
  }
  return valori;
}
