"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const schema = z.object({
  kind: z.enum(["OFFER", "NEED"]),
  routeFrom: z.string().trim().min(2, "Въведете откъде.").max(80),
  routeTo: z.string().trim().min(2, "Въведете докъде.").max(80),
  schedule: z.string().trim().max(120).optional().default(""),
  seats: z.string().trim().max(40).optional().default(""),
  costNote: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
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

export type RideState = { ok: boolean; error?: string };

export async function submitRideshare(
  _prev: RideState,
  formData: FormData,
): Promise<RideState> {
  if (!rateLimit(await clientKey("ride"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    routeFrom: formData.get("routeFrom"),
    routeTo: formData.get("routeTo"),
    schedule: formData.get("schedule") ?? "",
    seats: formData.get("seats") ?? "",
    costNote: formData.get("costNote") ?? "",
    description: formData.get("description") ?? "",
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

  const existing = await prisma.rideshare.findMany({ select: { slug: true } });
  const base = `${d.routeFrom}-${d.routeTo}`;
  const slug = uniqueSlug(slugify(base), new Set(existing.map((e) => e.slug)));

  const created = await prisma.rideshare.create({
    data: {
      slug,
      kind: d.kind,
      routeFrom: d.routeFrom,
      routeTo: d.routeTo,
      schedule: d.schedule,
      seats: d.seats,
      costNote: d.costNote,
      description: d.description,
      contactName: d.contactName,
      contactPhone: d.contactPhone,
      contactEmail: d.contactEmail,
      published: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
    },
  });

  await logAudit(null, {
    action: "CREATE",
    entity: "Rideshare",
    entityId: created.id,
    summary: `Нова обява за споделено пътуване: ${d.routeFrom} – ${d.routeTo}`,
  });

  return { ok: true };
}
