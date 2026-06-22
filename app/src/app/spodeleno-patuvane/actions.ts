"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  kind: z.enum(["OFFER", "NEED"]),
  routeFrom: z.string().min(2, "Откъде тръгвате?"),
  routeTo: z.string().min(2, "Докъде пътувате?"),
  schedule: z.string().optional().default(""),
  seats: z.string().optional().default(""),
  costNote: z.string().optional().default(""),
  description: z.string().optional().default(""),
  contactName: z.string().optional().default(""),
  contactPhone: z.string().optional().default(""),
  contactEmail: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
});

export async function submitRideshare(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, message: "Благодарим! Получено за преглед." };

  const parsed = schema.safeParse({
    kind: field(formData, "kind", 10) || "OFFER",
    routeFrom: field(formData, "routeFrom", 120),
    routeTo: field(formData, "routeTo", 120),
    schedule: field(formData, "schedule", 200),
    seats: field(formData, "seats", 40),
    costNote: field(formData, "costNote", 120),
    description: field(formData, "description", 2000),
    contactName: field(formData, "contactName", 120),
    contactPhone: field(formData, "contactPhone", 60),
    contactEmail: field(formData, "contactEmail", 160),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }

  try {
    const existing = await prisma.rideshare.findMany({ select: { slug: true } });
    const base = `${parsed.data.routeFrom}-${parsed.data.routeTo}`;
    const slug = uniqueSlug(slugify(base), new Set(existing.map((x) => x.slug)));
    await prisma.rideshare.create({
      data: {
        slug,
        kind: parsed.data.kind,
        routeFrom: parsed.data.routeFrom,
        routeTo: parsed.data.routeTo,
        schedule: parsed.data.schedule,
        seats: parsed.data.seats,
        costNote: parsed.data.costNote,
        description: parsed.data.description,
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        contactEmail: parsed.data.contactEmail ?? "",
        published: false,
      },
    });
  } catch {
    return { ok: false, message: "В момента не можем да запишем. Опитайте по-късно." };
  }
  return { ok: true, message: "Благодарим! Обявата ще се появи след кратък преглед." };
}
