"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  title: z.string().min(3, "Заглавието е твърде кратко."),
  content: z.string().min(10, "Споделете малко повече."),
  author: z.string().optional().default(""),
  period: z.string().optional().default(""),
  imageUrl: z.string().url("Невалиден линк към снимка.").optional().or(z.literal("")),
});

export async function submitMemory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, message: "Благодарим за спомена!" };

  const parsed = schema.safeParse({
    title: field(formData, "title", 200),
    content: field(formData, "content", 6000),
    author: field(formData, "author", 120),
    period: field(formData, "period", 80),
    imageUrl: field(formData, "imageUrl", 500),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }

  try {
    const existing = await prisma.memory.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(parsed.data.title), new Set(existing.map((x) => x.slug)));
    await prisma.memory.create({
      data: {
        slug,
        title: parsed.data.title,
        content: parsed.data.content,
        author: parsed.data.author,
        period: parsed.data.period,
        imageUrl: parsed.data.imageUrl ?? "",
        published: false,
      },
    });
  } catch {
    return { ok: false, message: "В момента не можем да запишем. Опитайте по-късно." };
  }
  return { ok: true, message: "Благодарим! Споменът ще се появи след преглед." };
}
