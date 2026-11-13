import { z } from 'zod';
import { isFeatureCode } from '../features.js';

/** Цена от формата на панела: „9,00“ → 900 цента; празно → null („по договор“). */
const centsField = z
  .string()
  .trim()
  .transform((value) => value.replace(',', '.'))
  .refine((value) => value === '' || /^\d{1,7}(\.\d{1,2})?$/.test(value), 'invalidAmount')
  // Цели числа: „9.5“ → 9 · 100 + 50 — без float (правилото за парите в CLAUDE.md).
  .transform((value) => {
    if (value === '') return null;
    const [whole = '0', fraction = ''] = value.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  });
const intField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{1,7}$/.test(value), 'invalidNumber')
  .transform((value) => (value === '' ? null : Number(value)));
/**
 * Отметка от HTML форма: отметната идва като „on“, неотметната — изобщо не идва. В zod 4 ключ, който
 * може да липсва, трябва да е `.optional()` (обединение с `z.undefined()` не стига — „expected
 * nonoptional“, бъгът с „Открояван“ от 13.11.2026).
 */
export const checkbox = z
  .literal('on')
  .optional()
  .transform((value) => value === 'on');

/** Формата на плана в мастър панела (`/admin/planove/:code`). */
export const PlanForm = z.object({
  nameBg: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  priceMonthly: centsField,
  priceYearly: centsField,
  perClientCompany: centsField,
  includedClientCompanies: intField,
  maxUsers: intField,
  maxCompanies: intField,
  monthlyDocumentSoftLimit: intField,
  sortOrder: z.coerce.number().int().min(0).max(1000),
  highlighted: checkbox,
  isPublic: checkbox,
  isActive: checkbox,
  features: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
    .refine((codes) => codes.every(isFeatureCode), 'unknownFeature'),
});
