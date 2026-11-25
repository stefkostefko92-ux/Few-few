import { z } from 'zod';
import {
  choiceParser,
  dateParser,
  decimalParser,
  ERROR_CODES,
  textParser,
  type FieldErrorCode,
  type FieldErrors,
  type FormValues,
} from '../schede/field-parsers.js';
import { dayFromDate } from '../time.js';
import { codiceVoce, valoriVoci, VOCI, vociDalForm, type ValoriVoci } from './voci.js';

/**
 * Формата на черновата на листа за интервенция: главата („Effettuato il“, Matt./Pom., адрес, град,
 * техници, матрикула), отметките 01–97 (voci.ts), „Altro“, пробите и часовете. Подписите и имената не са
 * тук — слагат се само с потвърждението, върху окончателния лист (conferma.ts). Всичко от външния свят
 * минава оттук (zod); грешките са кодовете на картата (`scheda.error.<код>`).
 */
export const TURNI = ['MATTINA', 'POMERIGGIO'] as const;
export type Turno = (typeof TURNI)[number];

const ORE = { min: 0, max: 9999 };

const headSchema = z.object({
  data: dateParser(),
  turno: choiceParser<Turno>(TURNI),
  indirizzo: textParser({ kind: 'text', maxLength: 200 }),
  citta: textParser({ kind: 'text', maxLength: 120 }),
  tecnici: textParser({ kind: 'textarea', maxLength: 300 }),
  matricola: textParser({ kind: 'text', maxLength: 40 }),
  altro: textParser({ kind: 'textarea', maxLength: 1000 }),
  oreTecnico: decimalParser(ORE),
  oreTotali: decimalParser(ORE),
});

export interface InterventoData extends z.infer<typeof headSchema> {
  prove: boolean;
  voci: ValoriVoci;
}

const HEAD_KEYS = Object.keys(headSchema.shape) as Array<keyof typeof headSchema.shape>;

export function parseIntervento(
  body: unknown,
): { ok: true; data: InterventoData } | { ok: false; errors: FieldErrors } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: FieldErrors = {};
  const head = headSchema.safeParse(Object.fromEntries(HEAD_KEYS.map((key) => [key, raw[key]])));
  if (!head.success) {
    for (const issue of head.error.issues) {
      const key = String(issue.path[0] ?? 'data');
      if (!errors[key])
        errors[key] = (
          ERROR_CODES.has(issue.message) ? issue.message : 'invalid'
        ) as FieldErrorCode;
    }
  }
  const prove = raw.prove;
  if (prove !== undefined && prove !== 'si') errors.prove = 'invalid';
  const voci = vociDalForm(raw);
  if (!voci.ok) Object.assign(errors, voci.errors);
  if (!head.success || !voci.ok || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { ...head.data, prove: prove === 'si', voci: voci.voci } };
}

/** Записаната чернова във вида на формата (за „Modifica“). */
export function formValuesFromIntervento(row: {
  data: Date;
  turno: Turno | null;
  indirizzo: string | null;
  citta: string | null;
  tecnici: string | null;
  matricola: string | null;
  voci: unknown;
  altro: string | null;
  prove: boolean;
  oreTecnico: { toString(): string } | null;
  oreTotali: { toString(): string } | null;
}): FormValues {
  const out: FormValues = {
    data: dayFromDate(row.data),
    turno: row.turno ?? '',
    indirizzo: row.indirizzo ?? '',
    citta: row.citta ?? '',
    tecnici: row.tecnici ?? '',
    matricola: row.matricola ?? '',
    altro: row.altro ?? '',
    prove: row.prove ? 'si' : '',
    oreTecnico: ore(row.oreTecnico),
    oreTotali: ore(row.oreTotali),
  };
  const voci = valoriVoci(row.voci);
  for (const voce of VOCI) {
    const key = codiceVoce(voce.n);
    const value = voci[key];
    out[`v-${key}`] = value?.x ? 'si' : '';
    if (voce.campo) out[`q-${key}`] = value?.q ?? '';
    if (voce.scelte) out[`c-${key}`] = value?.c ?? [];
  }
  return out;
}

/** „1.50“ → „1,5“; цели часове — без дробна част. */
function ore(value: { toString(): string } | null): string {
  if (!value) return '';
  const n = Number(value.toString());
  return Number.isFinite(n) ? String(n).replace('.', ',') : '';
}

/**
 * Пратеното от формата за повторно показване при грешка: само низове и списъци с низове, само имената
 * на формата.
 */
export function formValuesDalBody(body: unknown): FormValues {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 2000) : '');
  const out: FormValues = {};
  for (const key of [...HEAD_KEYS, 'prove', 'azienda']) out[key] = text(raw[key]);
  for (const voce of VOCI) {
    const key = codiceVoce(voce.n);
    out[`v-${key}`] = text(raw[`v-${key}`]);
    out[`q-${key}`] = text(raw[`q-${key}`]);
    const c = raw[`c-${key}`];
    out[`c-${key}`] = (Array.isArray(c) ? c : [c]).filter(
      (s): s is string => typeof s === 'string',
    );
  }
  return out;
}
