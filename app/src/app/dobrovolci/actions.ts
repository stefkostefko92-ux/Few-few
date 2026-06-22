"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  name: z.string().min(2, "Посочете име."),
  area: z.string().optional().default(""),
  skills: z.string().optional().default(""),
  about: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().email("Невалиден имейл.").optional().or(z.literal("")),
});

export async function submitVolunteer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, message: "Благодарим, че искате да помогнете!" };

  const parsed = schema.safeParse({
    name: field(formData, "name", 120),
    area: field(formData, "area", 120),
    skills: field(formData, "skills", 300),
    about: field(formData, "about", 2000),
    phone: field(formData, "phone", 60),
    email: field(formData, "email", 160),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }

  try {
    const existing = await prisma.volunteer.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(parsed.data.name), new Set(existing.map((x) => x.slug)));
    await prisma.volunteer.create({
      data: {
        slug,
        name: parsed.data.name,
        area: parsed.data.area,
        skills: parsed.data.skills,
        about: parsed.data.about,
        phone: parsed.data.phone,
        email: parsed.data.email ?? "",
        published: false,
      },
    });
  } catch {
    return { ok: false, message: "В момента не можем да запишем. Опитайте по-късно." };
  }
  return { ok: true, message: "Благодарим! Ще се свържем и ще публикуваме след преглед." };
}
