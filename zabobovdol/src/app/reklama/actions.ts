"use server";

import { z } from "zod";
import { isPhoneInput, normalizePhoneInput } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import {
  EMAIL_RE,
  MSG,
  failState,
  fieldErrorsOf,
  honeypotFilled,
  nextAttempt,
  readValues,
  type FormState,
} from "@/lib/form-state";

const FULL_NAME = "Напишете трите си имена (поне име и фамилия).";

const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, FULL_NAME)
    .max(120, "Името е твърде дълго — до 120 знака.")
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, FULL_NAME),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
  // Непълен номер не стига до публикуване — иначе на мястото му стои
  // „Телефонът се проверява“. „359…“ и мобилен без 0 се допълват.
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .default("")
    .transform(normalizePhoneInput)
    .refine((v) => v === "" || isPhoneInput(v), MSG.phone),
  message: z.string().trim().max(2000, "Съобщението е твърде дълго — до 2000 знака.").optional().default(""),
});

const FIELDS = ["fullName", "email", "phone", "message"] as const;

export type AdRequestState = FormState;

export async function submitAdRequest(
  prev: AdRequestState,
  formData: FormData,
): Promise<AdRequestState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  const d = parsed.data;
  if (!d.email && !d.phone) {
    return failState(values, attempt, undefined, { phone: MSG.contactNeeded });
  }
  if (!rateLimit(await clientKey("adreq"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }

  try {
    const created = await prisma.adRequest.create({
      data: {
        fullName: d.fullName,
        email: d.email,
        phone: d.phone,
        message: d.message,
        status: "NEW",
      },
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "AdRequest",
      entityId: created.id,
      summary: `Нова заявка за реклама от ${d.fullName}`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error(
      "Грешка при запис на заявка за реклама:",
      err instanceof Error ? err.message : "неизвестна",
    );
    return failState(values, attempt, MSG.saveFailed);
  }
}
