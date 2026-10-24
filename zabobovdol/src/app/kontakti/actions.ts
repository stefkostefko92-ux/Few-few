"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
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

const schema = z.object({
  // Редът е като във формата (тема → съобщение → данни за отговор), за да е
  // същият и в обобщението на грешките.
  subject: z
    .string()
    .trim()
    .max(160, "Темата е твърде дълга — до 160 знака.")
    .optional()
    .default(""),
  message: z
    .string()
    .trim()
    .min(10, "Съобщението е твърде кратко — поне 10 знака.")
    .max(5000, "Съобщението е твърде дълго — до 5000 знака."),
  name: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
});

const FIELDS = ["subject", "message", "name", "phone", "email"] as const;

export type ContactState = FormState;

export async function submitContact(prev: ContactState, formData: FormData): Promise<ContactState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  if (!rateLimit(await clientKey("contact"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }
  const d = parsed.data;

  try {
    const created = await prisma.contactMessage.create({
      data: {
        name: d.name,
        email: d.email,
        phone: d.phone,
        subject: d.subject,
        message: d.message,
      },
    });

    // Известие по имейл към екипа (ако SMTP е настроен). Без SMTP съобщението
    // просто се пази в админ панела (Контактни съобщения).
    await sendMail({
      to: SITE.contact.email,
      subject: `Ново съобщение от сайта${d.subject ? `: ${d.subject}` : ""}`,
      text: [
        "Ново съобщение през формата за контакт.",
        "",
        `Име: ${d.name || "—"}`,
        `Имейл: ${d.email || "—"}`,
        `Телефон: ${d.phone || "—"}`,
        d.subject ? `Тема: ${d.subject}` : "",
        "",
        "Съобщение:",
        d.message,
      ]
        .filter(Boolean)
        .join("\n"),
      replyTo: d.email || undefined,
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "ContactMessage",
      entityId: created.id,
      summary: `Ново контактно съобщение${d.subject ? ` — ${d.subject}` : ""}`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error(
      "Грешка при запис на съобщение:",
      err instanceof Error ? err.message : "неизвестна",
    );
    return failState(values, attempt, MSG.saveFailed);
  }
}
