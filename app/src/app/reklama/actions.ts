"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  fullName: z.string().min(2, "Посочете име."),
  message: z.string().optional().default(""),
  email: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
  phone: z.string().optional().default(""),
});

export async function submitAdRequest(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, message: "Благодарим! Ще се свържем с вас." };

  const parsed = schema.safeParse({
    fullName: field(formData, "fullName", 160),
    message: field(formData, "message", 3000),
    email: field(formData, "email", 160),
    phone: field(formData, "phone", 60),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }

  try {
    await prisma.adRequest.create({
      data: {
        fullName: parsed.data.fullName,
        message: parsed.data.message,
        email: parsed.data.email ?? "",
        phone: parsed.data.phone,
      },
    });
  } catch {
    return { ok: false, message: "В момента не можем да запишем заявката. Опитайте по-късно." };
  }
  return { ok: true, message: "Благодарим! Получихме заявката и ще се свържем с вас." };
}
