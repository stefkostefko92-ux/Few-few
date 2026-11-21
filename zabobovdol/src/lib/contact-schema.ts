import { z } from "zod";
import { EMAIL_RE, MSG } from "@/lib/form-state";
import { isPhoneInput, normalizePhoneInput } from "@/lib/phone";

/**
 * Полетата за контакт на публичните формуляри (обяви, споделено пътуване, зов за помощ) — едно място
 * вместо три копия (триаж на Качествения, 21.11.2026). `emailMax` е параметър: обявите пазят 120,
 * останалите 160 — изравняването би било смяна на поведението и се решава отделно.
 */
export function contactFields({ emailMax }: { emailMax: number }) {
  return {
    contactName: z.string().trim().max(80).optional().default(""),
    // Непълен номер не стига до публикуване — иначе на мястото му стои
    // „Телефонът се проверява“. „359…“ и мобилен без 0 се допълват.
    contactPhone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .default("")
      .transform(normalizePhoneInput)
      .refine((v) => v === "" || isPhoneInput(v), MSG.phone),
    contactEmail: z
      .string()
      .trim()
      .max(emailMax)
      .optional()
      .default("")
      .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
  };
}
