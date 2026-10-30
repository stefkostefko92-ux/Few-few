// The values of a supplier's module: the ticked boxes (true), the filled lines (text), the chosen option of a radio group
// (its `valore`) and of a drop-down list (the option itself). Nothing empty is stored. In the form the fields are named
// `<prefix>-<key>`; the hidden `<prefix>-_` says the module has been on the screen (then it is not prefilled again from the
// survey). Ported 1:1 from rilievi (src/ordini/valori.ts, commit 988f3cf37).
import { z } from 'zod';
import { ERROR_CODES, textParser, type FieldErrorCode, type FieldErrors, type FormValues } from '../field-parsers';
import { fieldsOf, type Modulo, type ModuloField } from './moduli';

export type Valori = Record<string, string | true>;

/** What the database keeps (JSON): the module's version and its values. */
export type ModuloDati = { modulo: string; valori: Valori };

export const nameOf = (prefix: string, key: string): string => `${prefix}-${key}`;
export const shownName = (prefix: string): string => `${prefix}-_`;

/** The allowed values of a radio group and of a drop-down list — anything else is forged. */
function opzioniOf(field: ModuloField): readonly string[] | null {
  if (field.kind === 'radio') return field.opzioni.map((o) => o.valore);
  if (field.kind === 'select') return field.opzioni;
  return null;
}

/** The module from the form: a tick is only "si"; an option only one of its own; text — cleaned and within the line of
 *  the PDF. */
export function parseModulo(modulo: Modulo, prefix: string, body: Record<string, unknown>): { dati: ModuloDati; errors: FieldErrors } {
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
    const parsed = textParser({ kind: field.kind, maxLength: field.maxLength }).safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid';
      errors[name] = (ERROR_CODES.has(message) ? message : 'invalid') as FieldErrorCode;
      continue;
    }
    if (parsed.data) valori[field.key] = parsed.data;
  }
  return { dati: { modulo: modulo.id, valori }, errors };
}

const storedSchema = z.object({ modulo: z.string(), valori: z.record(z.union([z.string(), z.literal(true)])) });

/** The stored values — only the module's keys and of the right kind (the JSON is checked). One column may keep the module
 *  of one of several makes (the panel: Pelazza or MoviLift): another module's JSON is nothing here. */
export function storedValori(modulo: Modulo, json: unknown): Valori | null {
  const parsed = storedSchema.safeParse(json);
  if (!parsed.success || parsed.data.modulo !== modulo.id) return null;
  const valori: Valori = {};
  for (const field of fieldsOf(modulo)) {
    const value = parsed.data.valori[field.key];
    const opzioni = opzioniOf(field);
    if (field.kind === 'check') {
      if (value === true) valori[field.key] = true;
    } else if (typeof value === 'string' && value !== '' && (!opzioni || opzioni.includes(value))) {
      valori[field.key] = value;
    }
  }
  return valori;
}

/** The values in the shape of the form (with the mark that the module has been filled in already). */
export function moduloFormValues(modulo: Modulo, prefix: string, valori: Valori): FormValues {
  const out: FormValues = { [shownName(prefix)]: '1' };
  for (const field of fieldsOf(modulo)) {
    const value = valori[field.key];
    out[nameOf(prefix, field.key)] = field.kind === 'check' ? (value === true ? 'si' : '') : typeof value === 'string' ? value : '';
  }
  return out;
}

/** What was typed in the module, as sent — to show it again after an error. */
export function moduloFromBody(modulo: Modulo, prefix: string, source: Record<string, unknown>): FormValues {
  const out: FormValues = {};
  const shown = source[shownName(prefix)];
  if (shown === '1') out[shownName(prefix)] = '1';
  for (const field of fieldsOf(modulo)) {
    const raw = source[nameOf(prefix, field.key)];
    out[nameOf(prefix, field.key)] = typeof raw === 'string' ? raw.slice(0, 5000) : '';
  }
  return out;
}
