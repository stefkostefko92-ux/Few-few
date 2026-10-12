import { z } from 'zod';
import type { TipoImpianto, TipoPorte, UbicazioneMacchina } from '@prisma/client';
import { dateFromDay } from '../time.js';
import {
  FIELDS,
  fieldByKey,
  IDENTIFIERS,
  isChecksField,
  isNumberField,
  isTextField,
  type FieldDef,
  type FieldKind,
  type SchedaFieldKey,
} from './fields.js';

/**
 * Проверката на формата на схемата — с zod, от определенията в fields.ts (границите са там, не тук).
 * Входът е urlencoded: всичко е низ; повтарящ се ключ (отметките) идва като масив. Всичко друго е
 * подправено и пада с `invalid`.
 */

export type FieldErrorCode =
  | 'invalid'
  | 'required'
  | 'invalidDate'
  | 'tooLong'
  | 'digitsOnly'
  | 'integer'
  | 'decimal'
  | 'decimalPlaces'
  | 'range'
  | 'option'
  | 'identifierNeeded'
  /** Само MASTER: не е избрана (активна) фирма за новата карта. */
  | 'azienda';

/** Ключът на формата за грешката „поне едно от адрес / матрикула / номер“. */
export const IDENTIFIERS_ERROR_KEY = 'identifiers';

/** Определението на полето от fields.ts; несъответствие на вида е грешка в кода — хвърля при зареждане. */
function defOf<T extends FieldDef>(
  key: SchedaFieldKey,
  kinds: readonly FieldKind[],
  guard: (field: FieldDef) => field is T = (field): field is T => true,
): T {
  const field = fieldByKey(key);
  if (!field || !kinds.includes(field.kind) || !guard(field)) {
    throw new Error(`Полето ${key} не е от вид ${kinds.join('|')} в fields.ts`);
  }
  return field;
}

/** Липсващото поле е празен низ; масив или обект на мястото на низ е подправен вход. */
const asText = (value: unknown): unknown => (value === undefined ? '' : value);
const str = z.string({ invalid_type_error: 'invalid' });

/** Без управляващи знаци; бележките пазят новите редове, едноредовото — събира интервалите. */
function cleanText(value: string, multiline: boolean): string {
  const unified = value.replace(/\r\n?/g, '\n');
  if (multiline) {
    return unified
      .replace(/[^\P{Cc}\n\t]/gu, '')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }
  return unified
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textOf(key: SchedaFieldKey) {
  const field = defOf(key, ['text', 'textarea'], isTextField);
  return z.preprocess(
    asText,
    str
      .transform((value) => cleanText(value, field.kind === 'textarea'))
      .pipe(z.string().max(field.maxLength, 'tooLong'))
      .transform((value) => (value === '' ? null : value)),
  );
}

function digitsOf(key: SchedaFieldKey) {
  const field = defOf(key, ['digits'], isTextField);
  return z.preprocess(
    asText,
    str
      .transform((value) => value.replace(/\s+/g, ''))
      .pipe(z.string().regex(/^\d*$/, 'digitsOnly').max(field.maxLength, 'tooLong'))
      .transform((value) => (value === '' ? null : value)),
  );
}

function intOf(key: SchedaFieldKey) {
  const field = defOf(key, ['int'], isNumberField);
  const pattern = field.min < 0 ? /^-?\d{1,9}$/ : /^\d{1,9}$/;
  return z.preprocess(
    asText,
    str
      .transform((value) => value.trim().replace(/^[−–]/, '-'))
      .superRefine((value, ctx) => {
        if (value === '') return;
        if (!pattern.test(value)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'integer' });
          return;
        }
        const n = Number(value);
        if (n < field.min || n > field.max) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
        }
      })
      .transform((value) => (value === '' ? null : Number(value))),
  );
}

/** „6,5“ и „6.5“ са едно и също; разделител на хилядите не се приема (двусмислен е в IT/EN). */
function decimalOf(key: SchedaFieldKey) {
  const field = defOf(key, ['decimal'], isNumberField);
  return z.preprocess(
    asText,
    str
      .transform((value) => value.trim().replace(',', '.'))
      .superRefine((value, ctx) => {
        if (value === '') return;
        if (!/^\d{1,6}(\.\d+)?$/.test(value)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'decimal' });
          return;
        }
        if ((value.split('.')[1] ?? '').length > 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'decimalPlaces' });
          return;
        }
        const n = Number(value);
        if (n < field.min || n > field.max) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
        }
      })
      // Prisma.Decimal приема низ — без загуба през float.
      .transform((value) => (value === '' ? null : Number(value).toFixed(2))),
  );
}

function checksOf<T extends string>(key: SchedaFieldKey) {
  const field = defOf(key, ['checks'], isChecksField);
  return z.preprocess(
    (value) => (value === undefined ? [] : typeof value === 'string' ? [value] : value),
    z
      .array(str, { invalid_type_error: 'invalid' })
      .max(field.options.length * 2, 'invalid')
      .refine((values) => values.every((v) => field.options.includes(v)), 'option')
      // Без повторения и в реда от заданието, каквото и да е подредил браузърът.
      .transform((values) => field.options.filter((option) => values.includes(option)) as T[]),
  );
}

function yesNoOf(key: SchedaFieldKey) {
  defOf(key, ['yesno']);
  return z.preprocess(
    asText,
    str
      .refine((value) => ['', 'si', 'no'].includes(value), 'option')
      .transform((value) => {
        if (value === 'si') return true;
        if (value === 'no') return false;
        return null;
      }),
  );
}

function dateOf(key: SchedaFieldKey) {
  defOf(key, ['date']);
  return z.preprocess(
    asText,
    str
      .transform((value) => value.trim())
      .superRefine((value, ctx) => {
        if (value === '') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'required' });
          return;
        }
        const valid =
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(dateFromDay(value).getTime()) &&
          dateFromDay(value).toISOString().startsWith(value) &&
          value >= '1950-01-01' &&
          value <= '2099-12-31';
        if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalidDate' });
      })
      .transform((value) => dateFromDay(value)),
  );
}

export const schedaSchema = z
  .object({
    data: dateOf('data'),
    indirizzo: textOf('indirizzo'),
    marca: textOf('marca'),
    matricola: digitsOf('matricola'),
    numeroImpianto: digitsOf('numeroImpianto'),
    portataKg: intOf('portataKg'),
    capienzaPersone: intOf('capienzaPersone'),
    fermate: intOf('fermate'),
    ubicazioneMacchina: checksOf<UbicazioneMacchina>('ubicazioneMacchina'),
    ubicazioneCassettina: intOf('ubicazioneCassettina'),
    parcheggio: textOf('parcheggio'),
    tipoImpianto: checksOf<TipoImpianto>('tipoImpianto'),
    tipoPorte: checksOf<TipoPorte>('tipoPorte'),
    serrature: yesNoOf('serrature'),
    serratureNumero: intOf('serratureNumero'),
    serratureTipo: textOf('serratureTipo'),
    funiDiametroMm: decimalOf('funiDiametroMm'),
    funiTrefoli: intOf('funiTrefoli'),
    funiNumero: intOf('funiNumero'),
    funiLunghezzaM: decimalOf('funiLunghezzaM'),
    limitatoreTipo: textOf('limitatoreTipo'),
    funicellaDiametroMm: decimalOf('funicellaDiametroMm'),
    funicellaLunghezzaM: decimalOf('funicellaLunghezzaM'),
    tenditore: textOf('tenditore'),
    caviNumero: intOf('caviNumero'),
    caviConduttori: intOf('caviConduttori'),
    caviLunghezzaM: decimalOf('caviLunghezzaM'),
    noteQuadretto: textOf('noteQuadretto'),
    noteImpianto: textOf('noteImpianto'),
    noteBottoniere: textOf('noteBottoniere'),
    lavoriExtra: textOf('lavoriExtra'),
  })
  .superRefine((value, ctx) => {
    if (IDENTIFIERS.every((key) => value[key] === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [IDENTIFIERS_ERROR_KEY],
        message: 'identifierNeeded',
      });
    }
  })
  // Броят и видът на ключалките имат смисъл само при „Sì“ — иначе не се пазят.
  .transform((value) =>
    value.serrature === true ? value : { ...value, serratureNumero: null, serratureTipo: null },
  );

export type SchedaData = z.output<typeof schedaSchema>;
export type FieldErrors = Partial<Record<string, FieldErrorCode>>;

const CODES: ReadonlySet<string> = new Set<FieldErrorCode>([
  'invalid',
  'required',
  'invalidDate',
  'tooLong',
  'digitsOnly',
  'integer',
  'decimal',
  'decimalPlaces',
  'range',
  'option',
  'identifierNeeded',
]);

export function parseScheda(
  body: unknown,
): { ok: true; data: SchedaData } | { ok: false; errors: FieldErrors } {
  const parsed = schedaSchema.safeParse(body ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? IDENTIFIERS_ERROR_KEY);
    if (errors[key]) continue;
    errors[key] = (CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode;
  }
  // zod не стига до проверката на целия обект, докато някое поле е грешно — без това човекът би
  // поправил числата и чак тогава би научил, че липсва адрес. Всички грешки идват наведнъж.
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const hasIdentifier = IDENTIFIERS.some((key) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() !== '';
  });
  if (!hasIdentifier) errors[IDENTIFIERS_ERROR_KEY] ??= 'identifierNeeded';
  return { ok: false, errors };
}

/** Стойностите на формата, както ги е пратил човекът — за повторно показване при грешка. */
export type FormValues = Record<string, string | string[]>;

export function formValuesFromBody(body: unknown): FormValues {
  const source = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const values: FormValues = {};
  for (const field of FIELDS) {
    const raw = source[field.key];
    if (field.kind === 'checks') {
      const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
      values[field.key] = list.filter((v): v is string => typeof v === 'string').slice(0, 10);
    } else {
      values[field.key] = typeof raw === 'string' ? raw.slice(0, 5000) : '';
    }
  }
  return values;
}
