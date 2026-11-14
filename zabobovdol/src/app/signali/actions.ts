"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendMail, MUNICIPALITY_EMAIL } from "@/lib/mail";
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
import { COMPLAINT_CATEGORIES } from "./categories";

const schema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES, {
    errorMap: () => ({ message: "Изберете категория на сигнала." }),
  }),
  location: z.string().trim().max(200).optional().default(""),
  subject: z
    .string()
    .trim()
    .min(3, "Заглавието е твърде кратко — поне 3 знака.")
    .max(160, "Заглавието е твърде дълго — до 160 знака."),
  message: z
    .string()
    .trim()
    .min(15, "Опишете проблема по-подробно — поне 15 знака.")
    .max(5000, "Описанието е твърде дълго — до 5000 знака."),
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

const FIELDS = ["category", "location", "subject", "message", "name", "phone", "email"] as const;

export type ComplaintState = FormState & {
  refCode?: string;
  forwarded?: boolean;
};

function makeRefCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[bytes[i] % chars.length];
  return `BD-${s}`;
}

export async function submitComplaint(
  prev: ComplaintState,
  formData: FormData,
): Promise<ComplaintState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит. Броят се само
  // подаванията, които ще се запишат — който поправя грешка, не се блокира.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  if (!rateLimit(await clientKey("signal"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }
  const d = parsed.data;

  try {
    // Уникален код за проследяване.
    let refCode = makeRefCode();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.complaint.findUnique({ where: { refCode } });
      if (!exists) break;
      refCode = makeRefCode();
    }

    const created = await prisma.complaint.create({
      data: {
        refCode,
        name: d.name,
        email: d.email,
        phone: d.phone,
        category: d.category,
        subject: d.subject,
        message: d.message,
        location: d.location,
        status: "NEW",
      },
    });

    // Опит за препращане към институцията по имейл (ако е конфигуриран SMTP).
    const body = [
      `Сигнал от граждани, подаден чрез ${SITE.domain}`,
      `Код за проследяване: ${refCode}`,
      "",
      `Категория: ${d.category}`,
      `Заглавие: ${d.subject}`,
      d.location ? `Местоположение: ${d.location}` : "",
      "",
      "Описание:",
      d.message,
      "",
      "Подател:",
      `Име: ${d.name || "—"}`,
      `Имейл: ${d.email || "—"}`,
      `Телефон: ${d.phone || "—"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const mail = await sendMail({
      to: MUNICIPALITY_EMAIL,
      subject: `Сигнал ${refCode}: ${d.subject}`,
      text: body,
      replyTo: d.email || undefined,
    });

    if (mail.sent) {
      await prisma.complaint.update({
        where: { id: created.id },
        data: { status: "FORWARDED", forwardedTo: MUNICIPALITY_EMAIL },
      });
    }

    await logAudit(null, {
      action: "CREATE",
      entity: "Complaint",
      entityId: created.id,
      summary: `Нов сигнал ${refCode} (${d.category})${mail.sent ? " — препратен" : " — чака препращане"}`,
    });

    return { ok: true, refCode, forwarded: mail.sent, attempt };
  } catch (err) {
    console.error("Грешка при запис на сигнал:", err instanceof Error ? err.message : "неизвестна");
    return failState(values, attempt, MSG.saveFailed);
  }
}
