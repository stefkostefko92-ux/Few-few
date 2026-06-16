"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const schema = z.object({
  location: z.string().trim().min(3, "Опишете къде се намира (улица, квартал, ориентир).").max(160),
  description: z.string().trim().min(10, "Опишете сметището по-подробно.").max(3000),
  photoUrl: z
    .string()
    .trim()
    .max(400)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Линкът към снимка трябва да започва с http(s)://"),
  name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Невалиден имейл."),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type DumpState = { ok: boolean; error?: string };

export async function submitDumpReport(
  _prev: DumpState,
  formData: FormData,
): Promise<DumpState> {
  if (!rateLimit(await clientKey("dump"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    location: formData.get("location"),
    description: formData.get("description"),
    photoUrl: formData.get("photoUrl") ?? "",
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

  const existing = await prisma.dumpReport.findMany({ select: { slug: true } });
  const slug = uniqueSlug(slugify(d.location), new Set(existing.map((e) => e.slug)));

  const created = await prisma.dumpReport.create({
    data: {
      slug,
      location: d.location,
      description: d.description,
      photoUrl: d.photoUrl,
      reporterName: d.name,
      reporterPhone: d.phone,
      reporterEmail: d.email,
      status: "NEW",
      published: false,
    },
  });

  await logAudit(null, {
    action: "CREATE",
    entity: "DumpReport",
    entityId: created.id,
    summary: `Нов сигнал за сметище: „${d.location}" (чака одобрение)`,
  });

  return { ok: true };
}
