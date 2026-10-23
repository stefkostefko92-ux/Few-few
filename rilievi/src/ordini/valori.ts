import { z } from 'zod';
import {
  ERROR_CODES,
  textParser,
  type FieldErrorCode,
  type FieldErrors,
  type FormValues,
} from '../schede/field-parsers.js';
import { fieldsOf, type Modulo, type ModuloField } from './moduli.js';

/**
 * Стойностите на модул на доставчик: отметнатите кутийки (true), попълнените редове (текст), избраната
 * опция на радио група (нейното `valore`) и на падащ списък (самата опция). Празното не се пази. Във
 * формата полетата се казват `<префикс>-<ключ>`; скритото `<префикс>-_` казва, че модулът е бил на
 * екрана (тогава не се попълва наново от огледа).
 */

export type Valori = Record<string, string | true>;

/** Каквото се пази в базата (JSON): версията на модула и стойностите му. */
export type ModuloDati = { modulo: string; valori: Valori };

export const nameOf = (prefix: string, key: string): string => `${prefix}-${key}`;
export const shownName = (prefix: string): string => `${prefix}-_`;

function parserOf(kind: 'text' | 'textarea', maxLength: number) {
  return textParser({ kind, maxLength });
}

/** Позволените стойности на радио група и падащ списък — всичко друго е подправено. */
function opzioniOf(field: ModuloField): readonly string[] | null {
  if (field.kind === 'radio') return field.opzioni.map((o) => o.valore);
  if (field.kind === 'select') return field.opzioni;
  return null;
}

/** Модулът от формата: отметка е само „si“; текстът — почистен и в границите на реда в PDF-а. */
export function parseModulo(
  modulo: Modulo,
  prefix: string,
  body: Record<string, unknown>,
): { dati: ModuloDati; errors: FieldErrors } {
  const valori: Valori = {};
  const errors: FieldErrors = {};
  for (const field of fieldsOf(modulo)) {
    const name = nameOf(prefix, field.key);
    const raw = body[name];
    if (field.kind === 'check') {
      if (raw === undefined || raw === '') continue;
      if (raw === 'si') valori[field.key] = true;
      else errors[name] = 'invalid';
      continue;
    }
    const opzioni = opzioniOf(field);
    if (opzioni) {
      if (raw === undefined || raw === '') continue;
      if (typeof raw === 'string' && opzioni.includes(raw)) valori[field.key] = raw;
      else errors[name] = 'option';
      continue;
    }
    if (field.kind !== 'text' && field.kind !== 'textarea') continue;
    const parsed = parserOf(field.kind, field.maxLength).safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid';
      errors[name] = (ERROR_CODES.has(message) ? message : 'invalid') as FieldErrorCode;
      continue;
    }
    if (parsed.data) valori[field.key] = parsed.data;
  }
  return { dati: { modulo: modulo.id, valori }, errors };
}

const storedSchema = z.object({
  modulo: z.string(),
  valori: z.record(z.union([z.string(), z.literal(true)])),
});

/** Записаните стойности — само ключовете на модула и от правилния вид (JSON-ът се проверява). */
export function storedValori(modulo: Modulo, json: unknown): Valori | null {
  const parsed = storedSchema.safeParse(json);
  // Една колона може да пази модула на една от няколко марки (таблото: Pelazza или MoviLift).
  if (!parsed.success || parsed.data.modulo !== modulo.id) return null;
  const valori: Valori = {};
  for (const field of fieldsOf(modulo)) {
    const value = parsed.data.valori[field.key];
    const opzioni = opzioniOf(field);
    const ok =
      field.kind === 'check'
        ? value === true
        : typeof value === 'string' && value !== '' && (!opzioni || opzioni.includes(value));
    if (ok) valori[field.key] = value!;
  }
  return valori;
}

/** Стойностите във вида на формата (с отметката, че модулът вече е попълван). */
export function moduloFormValues(modulo: Modulo, prefix: string, valori: Valori): FormValues {
  const out: FormValues = { [shownName(prefix)]: '1' };
  for (const field of fieldsOf(modulo)) {
    const value = valori[field.key];
    out[nameOf(prefix, field.key)] =
      field.kind === 'check'
        ? value === true
          ? 'si'
          : ''
        : typeof value === 'string'
          ? value
          : '';
  }
  return out;
}

/** Въведеното в модула, както е пратено — за повторно показване при грешка. */
export function moduloFromBody(
  modulo: Modulo,
  prefix: string,
  source: Record<string, unknown>,
): FormValues {
  const out: FormValues = {};
  const shown = source[shownName(prefix)];
  if (shown === '1') out[shownName(prefix)] = '1';
  for (const field of fieldsOf(modulo)) {
    const raw = source[nameOf(prefix, field.key)];
    out[nameOf(prefix, field.key)] = typeof raw === 'string' ? raw.slice(0, 5000) : '';
  }
  return out;
}
