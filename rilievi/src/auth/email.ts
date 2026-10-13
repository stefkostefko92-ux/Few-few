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

/** Име и фамилия на човек: управляващите знаци стават интервали; 2–120 знака. */
export const personNameSchema = z
  .string()
  .transform((value) =>
    value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(2).max(120));
