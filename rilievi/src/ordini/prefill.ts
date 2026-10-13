import type { FormValues } from '../schede/field-parsers.js';
import { prefillCollegati } from './collegati.js';
import { fieldsOf, type Modulo, type PrefillToken } from './moduli.js';
import { SLOTS } from './registry.js';
import type { Valori } from './valori.js';

/**
 * Предварителните стойности на модул: датата, № на асансьора, фирмата и човекът, които пишат (картата
 * на модула, `prefill`), и данните на уредбата от картата или от другия модул (collegati.ts). Само при
 * първото отваряне на модула; после всичко се редактира. Същите правила има и public/js (докато се пише).
 */

export interface PrefillContext {
  /** Стойностите на огледа и на другия модул във вида на формата. */
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
    default:
      return text(ctx.values, token);
  }
}

function checked(token: string, values: FormValues): boolean {
  const [name = '', option = ''] = token.split('=');
  const value = values[name];
  return Array.isArray(value) ? value.includes(option) : value === option;
}

/** Стойностите от картата на модула (`prefill`) — само там, където има какво да се вземе. */
export function prefillPropri(modulo: Modulo, ctx: PrefillContext): Valori {
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

/** Всичко, с което модулът се отваря за първи път: своето + свързаното (картата, другият модул). */
export function prefillValori(modulo: Modulo, ctx: PrefillContext): Valori {
  const slot = SLOTS.find((s) => s.modulo === modulo);
  return {
    ...prefillPropri(modulo, ctx),
    ...(slot ? prefillCollegati(slot.prefix, ctx.values) : {}),
  };
}
