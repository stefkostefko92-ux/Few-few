// The measurements of the old push-button panels: with "Sì" on `bottoniereMisure` — a row for each stop (1 = the
// lowest), as many rows as "Fermate". In the form the fields are named `mb-<stop>-<column>`. An empty row is not stored;
// the floor's name defaults to the stop's number (stored only when different — "T", "S1"). Ported 1:1 from rilievi
// (src/schede/misure.ts).
import { z } from 'zod';
import { fieldByKey, isNumberField } from './fields';
import { decimalParser, ERROR_CODES, textParser, yesNoParser, type FieldErrorCode, type FieldErrors, type FormValues } from './field-parsers';
import { fmt, type NumberLike } from './fmt';
import type { RilieviT } from './t';

export const MISURA_COLUMNS = [
  { key: 'piano', kind: 'text', maxLength: 20 },
  { key: 'lunghezzaMm', kind: 'decimal', min: 0, max: 5_000, unit: 'mm' },
  { key: 'larghezzaMm', kind: 'decimal', min: 0, max: 5_000, unit: 'mm' },
  { key: 'interasseSuperiore', kind: 'text', maxLength: 60 },
  { key: 'interasseInferiore', kind: 'text', maxLength: 60 },
  { key: 'display', kind: 'yesno' },
] as const;

export type MisuraColumn = (typeof MISURA_COLUMNS)[number];
export type MisuraKey = MisuraColumn['key'];

const fermateField = fieldByKey('fermate');
/** The most rows — the upper bound of "Fermate" (fields.ts). */
export const MAX_MISURE = fermateField && isNumberField(fermateField) ? fermateField.max : 0;

export interface MisuraData {
  fermata: number;
  piano: string | null;
  lunghezzaMm: string | null;
  larghezzaMm: string | null;
  interasseSuperiore: string | null;
  interasseInferiore: string | null;
  display: boolean | null;
}

/** A stored row (MisuraBottoniera): the decimals come back as Prisma.Decimal. */
export interface MisuraRow {
  fermata: number;
  piano: string | null;
  lunghezzaMm: NumberLike;
  larghezzaMm: NumberLike;
  interasseSuperiore: string | null;
  interasseInferiore: string | null;
  display: boolean | null;
}

export const misuraName = (fermata: number | string, key: MisuraKey): string => `mb-${fermata}-${key}`;

function column<K extends MisuraKey>(key: K): Extract<MisuraColumn, { key: K }> {
  const found = MISURA_COLUMNS.find((c): c is Extract<MisuraColumn, { key: K }> => c.key === key);
  if (!found) throw new Error(`No column ${key} in misure.ts`);
  return found;
}

const rowSchema = z.object({
  piano: textParser(column('piano')),
  lunghezzaMm: decimalParser(column('lunghezzaMm')),
  larghezzaMm: decimalParser(column('larghezzaMm')),
  interasseSuperiore: textParser(column('interasseSuperiore')),
  interasseInferiore: textParser(column('interasseInferiore')),
  display: yesNoParser(),
});

/** The number of stops as the number of rows: a whole number 1..MAX_MISURE, otherwise 0 (no rows). */
export function misureCount(fermate: unknown): number {
  const raw = typeof fermate === 'number' ? String(fermate) : typeof fermate === 'string' ? fermate : '';
  if (!/^\d{1,3}$/.test(raw.trim())) return 0;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_MISURE ? n : 0;
}

/** The rows 1..fermate of the form; the further ones (left from a larger number) are not read. */
export function parseMisure(body: Record<string, unknown>, fermate: number): { rows: MisuraData[]; errors: FieldErrors } {
  const rows: MisuraData[] = [];
  const errors: FieldErrors = {};
  for (let fermata = 1; fermata <= Math.min(fermate, MAX_MISURE); fermata += 1) {
    const input = Object.fromEntries(MISURA_COLUMNS.map((c) => [c.key, body[misuraName(fermata, c.key)]]));
    const parsed = rowSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = misuraName(fermata, column(String(issue.path[0]) as MisuraKey).key);
        errors[key] ??= (ERROR_CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode;
      }
      continue;
    }
    const row: MisuraData = { fermata, ...parsed.data, piano: parsed.data.piano === String(fermata) ? null : parsed.data.piano };
    if (MISURA_COLUMNS.some((c) => row[c.key] !== null)) rows.push(row);
  }
  return { rows, errors };
}

const MISURA_NAME = /^mb-(\d{1,3})-([A-Za-z]+)$/;

/** The name of a field of the rows (`mb-3-lunghezzaMm`) → the stop and the column; otherwise null. */
export function misuraOf(name: string): { n: string; column: MisuraColumn } | null {
  const match = MISURA_NAME.exec(name);
  const found = match ? MISURA_COLUMNS.find((c) => c.key === match[2]) : undefined;
  return match && found ? { n: match[1] ?? '', column: found } : null;
}

/** What was typed in the rows, as sent — to show it again after an error. */
export function misureFromBody(source: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    const match = MISURA_NAME.exec(name);
    if (!match || typeof value !== 'string') continue;
    const fermata = Number(match[1]);
    if (fermata < 1 || fermata > MAX_MISURE || !MISURA_COLUMNS.some((c) => c.key === match[2])) continue;
    out[name] = value.slice(0, 200);
  }
  return out;
}

/** The stored rows in the shape of the form (for "Modifica"). */
export function misureFromRows(rows: readonly MisuraRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const name = (key: MisuraKey) => misuraName(row.fermata, key);
    out[name('piano')] = row.piano ?? String(row.fermata);
    out[name('lunghezzaMm')] = fmt.inputNum(row.lunghezzaMm);
    out[name('larghezzaMm')] = fmt.inputNum(row.larghezzaMm);
    out[name('interasseSuperiore')] = row.interasseSuperiore ?? '';
    out[name('interasseInferiore')] = row.interasseInferiore ?? '';
    out[name('display')] = row.display === true ? 'si' : row.display === false ? 'no' : '';
  }
  return out;
}

export interface MisuraCell {
  column: MisuraColumn;
  name: string;
  value: string;
  error: FieldErrorCode | null;
}

/** A row in the form; `n` is the stop's number, or `__N__` in the template the browser adds rows from. */
export interface MisuraFormRow {
  n: string;
  cells: MisuraCell[];
}

function formRow(n: string, values: FormValues, errors: FieldErrors): MisuraFormRow {
  return {
    n,
    cells: MISURA_COLUMNS.map((c) => {
      const name = misuraName(n, c.key);
      const raw = values[name];
      const value = typeof raw === 'string' ? raw : c.key === 'piano' ? n : '';
      return { column: c, name, value, error: errors[name] ?? null };
    }),
  };
}

/** The rows of the form: as many as "Fermate" in it (without JavaScript, the number at the opening). */
export function misureFormRows(values: FormValues, errors: FieldErrors): MisuraFormRow[] {
  const count = misureCount(values.fermate);
  return Array.from({ length: count }, (_, i) => formRow(String(i + 1), values, errors));
}

export const misuraTemplateRow = (): MisuraFormRow => formRow('__N__', {}, {});

/** A table for the page, the print and the PDF: the first cell of a row is the stop's number. */
export interface TableView {
  head: string[];
  rows: string[][];
}

export function misureTable(fermate: number | null, rows: readonly MisuraRow[], t: RilieviT): TableView | null {
  const count = misureCount(fermate);
  if (count === 0) return null;
  const mm = t('scheda.unit.mm', { n: 2 });
  const head = [
    t('scheda.misure.fermata'),
    ...MISURA_COLUMNS.map((c) => {
      const label = t(`scheda.misure.col.${c.key}`);
      return 'unit' in c ? `${label} (${mm})` : label;
    }),
  ];
  const byFermata = new Map(rows.map((row) => [row.fermata, row]));
  const yesNo = (value: boolean | null | undefined) => (value === true ? t('common.yes') : value === false ? t('common.no') : '');
  const body = Array.from({ length: count }, (_, i) => {
    const fermata = i + 1;
    const row = byFermata.get(fermata);
    return [
      String(fermata),
      row?.piano ?? String(fermata),
      fmt.num(row?.lunghezzaMm),
      fmt.num(row?.larghezzaMm),
      row?.interasseSuperiore ?? '',
      row?.interasseInferiore ?? '',
      yesNo(row?.display),
    ];
  });
  return { head, rows: body };
}
