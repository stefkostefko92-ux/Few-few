"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  title: z.string().min(3, "Заглавието е твърде кратко."),
  description: z.string().min(5, "Опишете обявата с няколко думи."),
  type: z.enum(["OFFER", "WANTED", "JOB", "REALESTATE", "FREE", "OTHER"]),
  price: z.string().optional().default(""),
  contactName: z.string().optional().default(""),
  contactPhone: z.string().optional().default(""),
  contactEmail: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
});

export async function submitListing(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) {
    return { ok: true, message: "Благодарим! Обявата е получена за преглед." };
  }

  const typeRaw = field(formData, "type", 20) || "OFFER";
  const parsed = schema.safeParse({
    title: field(formData, "title", 200),
    description: field(formData, "description", 3000),
    type: typeRaw,
    price: field(formData, "price", 60),
    contactName: field(formData, "contactName", 120),
    contactPhone: field(formData, "contactPhone", 60),
    contactEmail: field(formData, "contactEmail", 160),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Моля, проверете полетата.",
    };
  }

  try {
    const existing = await prisma.listing.findMany({ select: { slug: true } });
    const taken = new Set(existing.map((x) => x.slug));
    const slug = uniqueSlug(slugify(parsed.data.title), taken);
    await prisma.listing.create({
      data: {
        slug,
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        price: parsed.data.price,
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        contactEmail: parsed.data.contactEmail ?? "",
        published: false,
      },
    });
  } catch {
    return {
      ok: false,
      message: "В момента не можем да запишем обявата. Опитайте по-късно.",
    };
  }

  return {
    ok: true,
    message:
      "Благодарим! Обявата е получена и ще се появи след кратък преглед.",
  };
}
