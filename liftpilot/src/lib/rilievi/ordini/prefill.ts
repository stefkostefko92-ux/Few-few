// The prefilled values of a module: the blank module's values (`predefinito`), the date, the lift's reference, the
// company and the person writing (the module's map, `prefill`), and the plant data from the sheet or from the other
// module (collegati.ts) — in this order, each over the one before. The server puts them at the module's first opening;
// afterwards the browser leads them (prefill-client.ts and collegati-client.ts — the same rules) until the person types
// in the field. Ported 1:1 from rilievi (src/ordini/prefill.ts, commit 988f3cf37).
import type { FormValues } from '../field-parsers';
import { activeFields, fieldByKey } from '../fields';
import { prefillCollegati } from './collegati';
import { fieldsOf, type Modulo, type PrefillToken } from './moduli';
import { opzioneDi } from './opzioni';
import { SLOTS } from './registry';
import { rifImpianto } from './rif';
import type { Valori } from './valori';

export { rifImpianto } from './rif';

export interface PrefillContext {
  /** The survey's and the other module's values in the shape of the form. */
  values: FormValues;
  azienda: string;
  utente: string;
  ruolo: string;
  email: string;
  /** The word of a tick of the sheet («tipoPorte», «MANUALI» → «Manuali») — from the messages. */
  etichetta: (campo: string, valore: string) => string;
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
    case 'tipoImpianto':
    case 'tipoPorte':
    case 'ubicazioneMacchina': {
      const list = ctx.values[token];
      return Array.isArray(list) ? list.map((v) => ctx.etichetta(token, v)).join(', ') : '';
    }
  }
}

function checked(token: string, values: FormValues, active: Set<string>): boolean {
  const [name = '', option = ''] = token.split('=');
  if (!active.has(name)) return false;
  const value = values[name];
  return Array.isArray(value) ? value.includes(option) : value === option;
}

/** The blank module's values (`predefinito`) — the radio groups, the ticks and the lines with something in them. */
export function predefiniti(modulo: Modulo): Valori {
  const valori: Valori = {};
  for (const field of fieldsOf(modulo)) {
    if ('predefinito' in field && field.predefinito !== undefined) valori[field.key] = field.predefinito;
  }
  return valori;
}

/**
 * The values from the survey (`prefill` in the module's map) — only where there is something to take. These fields
 * follow the sheet in the browser too, until the person types in them (`auto`, form.ts).
 */
export function prefillToken(modulo: Modulo, ctx: PrefillContext): Valori {
  const valori: Valori = {};
  // the sheet's hidden field (the retiring cam with automatic doors) says nothing
  const active = activeFields((key) => ctx.values[key]);
  for (const field of fieldsOf(modulo)) {
    if (!('prefill' in field) || !field.prefill) continue;
    if (field.kind === 'check') {
      if (checked(field.prefill, ctx.values, active)) valori[field.key] = true;
      continue;
    }
    const hidden = fieldByKey(field.prefill) !== undefined && !active.has(field.prefill);
    const value = hidden ? '' : textToken(field.prefill, ctx);
    if (field.kind === 'select') {
      const opzione = opzioneDi(field.opzioni, value);
      if (opzione) valori[field.key] = opzione;
      continue;
    }
    if ((field.kind === 'text' || field.kind === 'textarea') && value) valori[field.key] = value.slice(0, field.maxLength);
  }
  return valori;
}

/** The module's own: the blank module (`predefinito`), over it — the survey (`prefill`). */
export function prefillPropri(modulo: Modulo, ctx: PrefillContext): Valori {
  return { ...predefiniti(modulo), ...prefillToken(modulo, ctx) };
}

/** Everything a module opens with the first time: its own + the linked (the sheet, the other module). */
export function prefillValori(modulo: Modulo, ctx: PrefillContext): Valori {
  const slot = SLOTS.find((s) => s.modulo === modulo);
  return { ...prefillPropri(modulo, ctx), ...(slot ? prefillCollegati(slot.prefix, ctx.values) : {}) };
}
