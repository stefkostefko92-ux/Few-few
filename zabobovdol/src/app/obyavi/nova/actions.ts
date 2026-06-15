"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(3, "Заглавието е твърде кратко.").max(120),
  type: z.enum([
    "OFFER",
    "WANTED",
    "JOB",
    "REALESTATE",
    "FREE",
    "EVENT",
    "OTHER",
  ]),
  category: z.string().trim().max(60).optional().default(""),
  price: z.string().trim().max(60).optional().default(""),
  description: z
    .string()
    .trim()
    .min(10, "Описанието е твърде кратко.")
    .max(4000),
  contactName: z.string().trim().max(80).optional().default(""),
  contactPhone: z.string().trim().max(40).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default("")
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Невалиден имейл."),
  // Скрито поле против ботове (honeypot).
  website: z.string().max(0).optional().default(""),
});

export type SubmitState = {
  ok: boolean;
  error?: string;
};

export async function submitListing(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const parsed = schema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    category: formData.get("category") ?? "",
    price: formData.get("price") ?? "",
    description: formData.get("description"),
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Невалидни данни.";
    return { ok: false, error: first };
  }
  const data = parsed.data;

  // Изисква поне един начин за контакт.
  if (!data.contactPhone && !data.contactEmail) {
    return { ok: false, error: "Посочете телефон или имейл за контакт." };
  }

  const existing = await prisma.listing.findMany({ select: { slug: true } });
  const slug = uniqueSlug(
    slugify(data.title),
    new Set(existing.map((e) => e.slug)),
  );

  const created = await prisma.listing.create({
    data: {
      slug,
      title: data.title,
      type: data.type,
      category: data.category || "Общи",
      price: data.price,
      description: data.description,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail,
      published: false, // изчаква одобрение
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60), // 60 дни
    },
  });

  await logAudit(null, {
    action: "CREATE",
    entity: "Listing",
    entityId: created.id,
    summary: `Нова обява от посетител: „${data.title}" (чака одобрение)`,
  });

  return { ok: true };
}
