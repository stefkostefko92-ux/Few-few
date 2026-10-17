import { z } from 'zod';
import { dateFromDay } from '../time.js';
import {
  fieldByKey,
  isNumberField,
  isOptionsField,
  isTextField,
  type FieldDef,
  type FieldKind,
  type SchedaFieldKey,
} from './fields.js';

/**
 * Проверката на едно поле по вида му — с zod, от определенията в fields.ts (границите са там, не тук).
 * Входът е urlencoded: всичко е низ; повтарящ се ключ (отметките) идва като масив. Всичко друго е
 * подправено и пада с `invalid`. Грешката е код (`FieldErrorCode`), текстът е в речника.
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
  /** Mastech: „Sì“ на поръчката за таблото без модела (NG120 или QI Touch). */
  | 'modelloNeeded'
  /** Само MASTER: не е избрана (активна) фирма за новата карта. */
  | 'azienda';

export type FieldErrors = Partial<Record<string, FieldErrorCode>>;

/** Стойностите на формата, както ги е пратил човекът — за повторно показване при грешка. */
export type FormValues = Record<string, string | string[]>;

export const ERROR_CODES: ReadonlySet<string> = new Set<FieldErrorCode>([
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
  'modelloNeeded',
]);

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

export function textParser(field: { kind: 'text' | 'textarea'; maxLength: number }) {
  return z.preprocess(
    asText,
    str
      .transform((value) => cleanText(value, field.kind === 'textarea'))
      .pipe(z.string().max(field.maxLength, 'tooLong'))
      .transform((value) => (value === '' ? null : value)),
  );
}

function digitsParser(field: { maxLength: number }) {
  return z.preprocess(
    asText,
    str
      .transform((value) => value.replace(/\s+/g, ''))
      .pipe(z.string().regex(/^\d*$/, 'digitsOnly').max(field.maxLength, 'tooLong'))
      .transform((value) => (value === '' ? null : value)),
  );
}

export function intParser(field: { min: number; max: number }) {
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
export function decimalParser(field: { min: number; max: number }) {
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

function checksParser<T extends string>(options: readonly string[], single: boolean) {
  return z.preprocess(
    (value) => (value === undefined ? [] : typeof value === 'string' ? [value] : value),
    z
      .array(str, { invalid_type_error: 'invalid' })
      .max(options.length * 2, 'invalid')
      .refine((values) => values.every((v) => options.includes(v)), 'option')
      // Един избор (`single`): два избора праща само подправена или стара страница — грешка, не тих избор.
      .refine((values) => !single || new Set(values).size <= 1, 'option')
      // Без повторения и в реда от заданието, каквото и да е подредил браузърът.
      .transform((values) => options.filter((option) => values.includes(option)) as T[]),
  );
}

function choiceParser<T extends string>(options: readonly string[]) {
  return z.preprocess(
    asText,
    str
      .refine((value) => value === '' || options.includes(value), 'option')
      .transform((value) => (value === '' ? null : (value as T))),
  );
}

export function yesNoParser() {
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

function dateParser() {
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

export function textOf(key: SchedaFieldKey) {
  const field = defOf(key, ['text', 'textarea'], isTextField);
  return textParser({
    kind: field.kind === 'textarea' ? 'textarea' : 'text',
    maxLength: field.maxLength,
  });
}

export const digitsOf = (key: SchedaFieldKey) => digitsParser(defOf(key, ['digits'], isTextField));
export const intOf = (key: SchedaFieldKey) => intParser(defOf(key, ['int'], isNumberField));
export const decimalOf = (key: SchedaFieldKey) =>
  decimalParser(defOf(key, ['decimal'], isNumberField));
export function checksOf<T extends string>(key: SchedaFieldKey) {
  const field = defOf(key, ['checks'], isOptionsField);
  return checksParser<T>(field.options, field.single === true);
}
export const choiceOf = <T extends string>(key: SchedaFieldKey) =>
  choiceParser<T>(defOf(key, ['choice'], isOptionsField).options);

export function yesNoOf(key: SchedaFieldKey) {
  defOf(key, ['yesno']);
  return yesNoParser();
}

export function dateOf(key: SchedaFieldKey) {
  defOf(key, ['date']);
  return dateParser();
}
