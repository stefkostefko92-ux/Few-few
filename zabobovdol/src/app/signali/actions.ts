"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendMail, MUNICIPALITY_EMAIL } from "@/lib/mail";
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
  category: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(3, "Въведете кратко заглавие.").max(160),
  message: z.string().trim().min(15, "Опишете сигнала по-подробно.").max(5000),
  location: z.string().trim().max(200).optional().default(""),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type ComplaintState = {
  ok: boolean;
  error?: string;
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
  _prev: ComplaintState,
  formData: FormData,
): Promise<ComplaintState> {
  if (!rateLimit(await clientKey("signal"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    category: formData.get("category") ?? "",
    subject: formData.get("subject") ?? "",
    message: formData.get("message") ?? "",
    location: formData.get("location") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

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

  return { ok: true, refCode, forwarded: mail.sent };
}
