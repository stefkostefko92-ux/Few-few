"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const schema = z.object({
  name: z.string().trim().max(120).optional().default(""),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Невалиден имейл."),
  phone: z.string().trim().max(40).optional().default(""),
  subject: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().min(10, "Напишете малко повече за вашия въпрос.").max(5000),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type ContactState = { ok: boolean; error?: string };

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  if (!rateLimit(await clientKey("contact"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    subject: formData.get("subject") ?? "",
    message: formData.get("message") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

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

  return { ok: true };
}
