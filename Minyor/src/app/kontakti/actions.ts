"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

export type ContactState = { ok?: boolean; error?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Въведете име.").max(120),
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  subject: z.string().trim().max(150).optional(),
  body: z.string().trim().min(5, "Съобщението е твърде кратко.").max(4000),
});

export async function sendContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Анти-спам: до 4 съобщения на 10 минути от един IP.
  if (!rateLimit(await clientKey("contact"), 4, 10 * 60 * 1000)) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  // Скрито „honeypot" поле — ботовете го попълват, хората — не.
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    await prisma.contactMessage.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject || null,
        body: parsed.data.body,
      },
    });
  } catch {
    return { error: "В момента съобщението не може да бъде изпратено. Опитайте по-късно." };
  }

  return { ok: true };
}
