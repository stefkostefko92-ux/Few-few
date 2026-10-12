import { z } from 'zod';

/** Имейлът е ключ за вход и покана: винаги без интервали и с малки букви. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Валиден адрес до 254 знака (RFC 5321), нормализиран. Нов ред в адреса не стига до SMTP. */
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .refine((value) => !/[\r\n]/.test(value))
  .transform(normalizeEmail);
