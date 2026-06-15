"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, "Въведете трите си имена.")
    .max(120)
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "Въведете трите си имена."),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Невалиден имейл."),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type AdRequestState = { ok: boolean; error?: string };

export async function submitAdRequest(
  _prev: AdRequestState,
  formData: FormData,
): Promise<AdRequestState> {
  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    message: formData.get("message") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;
  if (!d.email && !d.phone) {
    return { ok: false, error: "Посочете имейл или телефон за връзка." };
  }

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

  return { ok: true };
}
