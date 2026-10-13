import type { FormValues } from '../schede/field-parsers.js';
import { activeFields, fieldByKey } from '../schede/fields.js';
import { prefillCollegati } from './collegati.js';
import { fieldsOf, type Modulo, type PrefillToken } from './moduli.js';
import { SLOTS } from './registry.js';
import type { Valori } from './valori.js';

/**
 * Предварителните стойности на модул: стойностите на празния модул (`predefinito`), датата, № на
 * асансьора, фирмата и човекът, които пишат (картата на модула, `prefill`), и данните на уредбата от
 * картата или от другия модул (collegati.ts) — в този ред, всяко следващо над предишното. Само при
 * първото отваряне на модула; после всичко се редактира. Същите правила има и public/js (докато се пише).
 */

export interface PrefillContext {
  /** Стойностите на огледа и на другия модул във вида на формата. */
  values: FormValues;
  azienda: string;
  utente: string;
  ruolo: string;
  email: string;
  /** Думата за отметка от картата („tipoPorte“, „MANUALI“ → „Manuali“) — от речника. */
  etichetta: (campo: string, valore: string) => string;
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
    case 'tipoImpianto':
    case 'tipoPorte': {
      const list = ctx.values[token];
      return Array.isArray(list) ? list.map((v) => ctx.etichetta(token, v)).join(', ') : '';
    }
    default:
      return text(ctx.values, token);
  }
}

const compatto = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
const numeri = (value: string): number[] =>
  (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));

/**
 * Опцията на падащ списък за текст от картата: същата дума („Selcom“ → „SELCOM“), иначе единствената
 * опция със същите числа („24 V DC“ → „24Vcc“; „220 V“ е и „220mono“, и „220tri“ — нищо). Същото е в
 * public/js/app.js.
 */
export function opzioneDi(opzioni: readonly string[], value: string): string | null {
  const wanted = compatto(value);
  if (!wanted) return null;
  const same = opzioni.find((o) => compatto(o) === wanted);
  if (same) return same;
  const target = numeri(value);
  if (target.length === 0) return null;
  const matching = opzioni.filter((o) => {
    const own = numeri(o);
    return own.length === target.length && own.every((n, i) => n === target[i]);
  });
  return matching.length === 1 ? matching[0]! : null;
}

function checked(token: string, values: FormValues, active: Set<string>): boolean {
  const [name = '', option = ''] = token.split('=');
  if (!active.has(name)) return false;
  const value = values[name];
  return Array.isArray(value) ? value.includes(option) : value === option;
}

/** Стойностите на празния модул (`predefinito`) — радио групите, отметките и редовете с нещо в тях. */
export function predefiniti(modulo: Modulo): Valori {
  const valori: Valori = {};
  for (const field of fieldsOf(modulo)) {
    if ('predefinito' in field && field.predefinito !== undefined) {
      valori[field.key] = field.predefinito;
    }
  }
  return valori;
}

/**
 * Стойностите от картата на модула: празният модул (`predefinito`), после огледът (`prefill`) — само
 * там, където има какво да се вземе.
 */
export function prefillPropri(modulo: Modulo, ctx: PrefillContext): Valori {
  const valori: Valori = predefiniti(modulo);
  // Скритото поле на картата („шейна“ при автоматични врати, операторът при ръчни) не казва нищо.
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
    if ((field.kind === 'text' || field.kind === 'textarea') && value) {
      valori[field.key] = value.slice(0, field.maxLength);
    }
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
