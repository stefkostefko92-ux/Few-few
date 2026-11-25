import { z } from 'zod';
import { BG_VAT, EU_VAT, isValidBgVat, isValidEik, normalizeVat } from '../einvoice/bg-ids.js';
import { COMMON_UNITS, VAT_CATEGORIES } from '../einvoice/codes.js';

/**
 * Каталогът на фирмата (SPEC 42–44): контрагенти, артикули, серии. Формите минават оттук — празно поле
 * е „няма“, текстът се подрязва; парите остават десетичен текст (никога float).
 */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value));

export const PartyForm = z
  .object({
    kind: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
    name: z.string().trim().min(2, 'tooShort').max(200),
    eik: optional(13).refine((value) => value === null || isValidEik(value), 'invalidEik'),
    vatNumber: optional(20)
      .transform((value) => (value === null ? null : normalizeVat(value)))
      .refine(
        (value) =>
          value === null || (value.startsWith('BG') ? isValidBgVat(value) : EU_VAT.test(value)),
        'invalidVat',
      ),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'invalidCountry')
      .default('BG'),
    addressStreet: z.string().trim().min(2, 'tooShort').max(200),
    addressCity: z.string().trim().min(2, 'tooShort').max(100),
    postalCode: optional(16),
    email: optional(254).refine(
      (value) => value === null || z.email().safeParse(value).success,
      'invalidEmail',
    ),
  })
  // Български ДДС номер с 9 цифри е „BG“ + ЕИК-а на същия контрагент.
  .refine(
    (data) =>
      !data.vatNumber ||
      !data.eik ||
      !BG_VAT.test(data.vatNumber) ||
      data.vatNumber.length !== 11 ||
      data.vatNumber === `BG${data.eik.slice(0, 9)}`,
    { message: 'vatMismatch', path: ['vatNumber'] },
  );
export type PartyInput = z.infer<typeof PartyForm>;

/** Цена без ДДС: до 12 цифри и до 6 знака след запетаята; „12,50“ се приема като „12.50“. */
const price = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
  .refine((value) => /^\d{1,12}(\.\d{1,6})?$/.test(value), 'invalidPrice');

export const ItemForm = z
  .object({
    name: z.string().trim().min(1, 'tooShort').max(200),
    unitCode: z.enum(COMMON_UNITS).default('C62'),
    netPrice: price,
    vatCategory: z.enum(VAT_CATEGORIES).default('S'),
    vatRate: z
      .string()
      .trim()
      .transform((value) => value.replace(',', '.'))
      .refine((value) => /^\d{1,2}(\.\d{1,2})?$/.test(value), 'invalidRate')
      .default('20'),
    sellerItemId: optional(60),
  })
  // Категория S е облагаема със ставка > 0; освободените и нулевите категории — със ставка 0.
  .refine(
    (data) => (data.vatCategory === 'S' ? Number(data.vatRate) > 0 : Number(data.vatRate) === 0),
    { message: 'rateCategory', path: ['vatRate'] },
  );
export type ItemInput = z.infer<typeof ItemForm>;

/** Номерът на документ по ЗДДС е 10 цифри — диапазонът на серия е в [1, 9 999 999 999]. */
export const MAX_DOCUMENT_NUMBER = 9_999_999_999n;

const number10 = z
  .string()
  .trim()
  .regex(/^\d{1,10}$/, 'invalidNumber')
  .transform((value) => BigInt(value))
  .refine((value) => value >= 1n && value <= MAX_DOCUMENT_NUMBER, 'invalidNumber');

export const SeriesForm = z
  .object({
    name: z.string().trim().min(1, 'tooShort').max(40),
    rangeStart: number10,
    rangeEnd: number10,
  })
  .refine((data) => data.rangeStart <= data.rangeEnd, {
    message: 'invalidRange',
    path: ['rangeEnd'],
  });
export type SeriesInput = z.infer<typeof SeriesForm>;

/** Грешките на zod като `{поле: ключ}` — първата за всяко поле; непознатото съобщение става `invalid`. */
export function formErrors(issues: ReadonlyArray<z.core.$ZodIssue>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= /^[a-zA-Z]{3,30}$/.test(issue.message) ? issue.message : 'invalid';
  }
  return errors;
}
