"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  message: z.string().min(10, "Моля, напишете малко повече."),
  name: z.string().optional().default(""),
  email: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
  phone: z.string().optional().default(""),
  subject: z.string().optional().default(""),
});

export async function submitContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) {
    return { ok: true, message: "Благодарим! Съобщението е получено." };
  }

  const parsed = schema.safeParse({
    message: field(formData, "message", 4000),
    name: field(formData, "name", 120),
    email: field(formData, "email", 160),
    phone: field(formData, "phone", 60),
    subject: field(formData, "subject", 200),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Моля, проверете полетата.",
    };
  }

  try {
    await prisma.contactMessage.create({
      data: {
        message: parsed.data.message,
        name: parsed.data.name,
        email: parsed.data.email ?? "",
        phone: parsed.data.phone,
        subject: parsed.data.subject,
      },
    });
  } catch {
    return {
      ok: false,
      message: "В момента не можем да запишем съобщението. Опитайте по-късно.",
    };
  }

  return { ok: true, message: "Благодарим! Съобщението е получено." };
}
