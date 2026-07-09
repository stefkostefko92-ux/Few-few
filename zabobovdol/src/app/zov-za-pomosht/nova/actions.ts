"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const schema = z.object({
  title: z.string().trim().min(4, "Въведете кратко заглавие.").max(140),
  kind: z.enum(["NEED", "OFFER"]),
  beneficiary: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().min(15, "Опишете по-подробно.").max(4000),
  contactName: z.string().trim().max(80).optional().default(""),
  contactPhone: z.string().trim().max(40).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Невалиден имейл."),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type HelpState = { ok: boolean; error?: string };

export async function submitHelpCause(
  _prev: HelpState,
  formData: FormData,
): Promise<HelpState> {
  if (!rateLimit(await clientKey("help"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    title: formData.get("title"),
    kind: formData.get("kind"),
    beneficiary: formData.get("beneficiary") ?? "",
    location: formData.get("location") ?? "",
    description: formData.get("description"),
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;
  if (!d.contactPhone && !d.contactEmail) {
    return { ok: false, error: "Посочете телефон или имейл за контакт." };
  }

  const existing = await prisma.helpCause.findMany({ select: { slug: true } });
  const slug = uniqueSlug(slugify(d.title), new Set(existing.map((e) => e.slug)));

  const created = await prisma.helpCause.create({
    data: {
      slug,
      title: d.title,
      kind: d.kind,
      beneficiary: d.beneficiary,
      location: d.location,
      description: d.description,
      contactName: d.contactName,
      contactPhone: d.contactPhone,
      contactEmail: d.contactEmail,
      published: false,
    },
  });

  await logAudit(null, {
    action: "CREATE",
    entity: "HelpCause",
    entityId: created.id,
    summary: `Нов зов за помощ: „${d.title}“ (чака одобрение)`,
  });

  return { ok: true };
}
