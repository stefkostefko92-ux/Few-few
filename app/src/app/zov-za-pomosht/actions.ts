"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  title: z.string().min(3, "Заглавието е твърде кратко."),
  description: z.string().min(10, "Опишете нуждата с няколко изречения."),
  kind: z.enum(["NEED", "OFFER"]),
  location: z.string().optional().default(""),
  contactName: z.string().optional().default(""),
  contactPhone: z.string().optional().default(""),
  contactEmail: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
});

export async function submitHelpCause(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, message: "Благодарим! Получено за преглед." };

  const parsed = schema.safeParse({
    title: field(formData, "title", 200),
    description: field(formData, "description", 3000),
    kind: field(formData, "kind", 10) || "NEED",
    location: field(formData, "location", 200),
    contactName: field(formData, "contactName", 120),
    contactPhone: field(formData, "contactPhone", 60),
    contactEmail: field(formData, "contactEmail", 160),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }

  try {
    const existing = await prisma.helpCause.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(parsed.data.title), new Set(existing.map((x) => x.slug)));
    await prisma.helpCause.create({
      data: {
        slug,
        title: parsed.data.title,
        description: parsed.data.description,
        kind: parsed.data.kind,
        location: parsed.data.location,
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        contactEmail: parsed.data.contactEmail ?? "",
        published: false,
      },
    });
  } catch {
    return { ok: false, message: "В момента не можем да запишем. Опитайте по-късно." };
  }
  return { ok: true, message: "Благодарим! Ще се появи след кратък преглед." };
}
