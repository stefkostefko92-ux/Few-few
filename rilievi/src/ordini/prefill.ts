import type { FormValues } from '../schede/field-parsers.js';
import { fieldsOf, type Modulo, type PrefillToken } from './moduli.js';
import type { Valori } from './valori.js';

/**
 * Предварителните стойности на модул от огледа: дата, № на асансьора, спирки, врати, товароносимост,
 * въжета, място на машината — и фирмата и човекът, които пишат. Само при първото отваряне на модула;
 * после всичко се редактира. Същите правила има и public/js/app.js (докато се пише в огледа).
 */

export interface PrefillContext {
  /** Стойностите на огледа във вида на формата. */
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

/** „N° 104552 — Matr. 0033871 — Via Verdi 14“: каквото има от трите. */
export function rifImpianto(values: FormValues): string {
  const numero = text(values, 'numeroImpianto');
  const matricola = text(values, 'matricola');
  const indirizzo = text(values, 'indirizzo');
  return [numero && `N° ${numero}`, matricola && `Matr. ${matricola}`, indirizzo]
    .filter(Boolean)
    .join(' — ');
}

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

/** Стойностите на модула от огледа — само там, където има какво да се вземе. */
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
