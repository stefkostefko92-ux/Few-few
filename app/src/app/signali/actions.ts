"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  makeRefCode,
  isBot,
  field,
  type FormState,
} from "@/lib/forms";

const schema = z.object({
  subject: z.string().min(3, "Опишете накратко за какво е сигналът."),
  message: z.string().min(10, "Моля, опишете проблема с малко повече детайли."),
  category: z.string().default("Общи"),
  location: z.string().optional().default(""),
  name: z.string().optional().default(""),
  email: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
  phone: z.string().optional().default(""),
});

export async function submitComplaint(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) {
    return { ok: true, message: "Благодарим! Сигналът е приет." };
  }

  const parsed = schema.safeParse({
    subject: field(formData, "subject", 200),
    message: field(formData, "message", 4000),
    category: field(formData, "category", 60) || "Общи",
    location: field(formData, "location", 200),
    name: field(formData, "name", 120),
    email: field(formData, "email", 160),
    phone: field(formData, "phone", 60),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Моля, проверете полетата.",
    };
  }

  const refCode = makeRefCode();
  try {
    await prisma.complaint.create({
      data: {
        refCode,
        subject: parsed.data.subject,
        message: parsed.data.message,
        category: parsed.data.category,
        location: parsed.data.location,
        name: parsed.data.name,
        email: parsed.data.email ?? "",
        phone: parsed.data.phone,
      },
    });
  } catch {
    return {
      ok: false,
      message:
        "В момента не можем да запишем сигнала. Опитайте по-късно или се обадете на общината.",
    };
  }

  return {
    ok: true,
    message: "Благодарим! Сигналът е приет.",
    refCode,
  };
}
