"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  imageUrl: z.string().url("Посочете валиден линк към снимка."),
  title: z.string().optional().default(""),
  author: z.string().optional().default(""),
  submitterContact: z.string().optional().default(""),
});

export async function submitPhoto(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, message: "Благодарим за снимката!" };

  const parsed = schema.safeParse({
    imageUrl: field(formData, "imageUrl", 500),
    title: field(formData, "title", 200),
    author: field(formData, "author", 120),
    submitterContact: field(formData, "submitterContact", 160),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }

  try {
    const existing = await prisma.galleryPhoto.findMany({ select: { slug: true } });
    const base = parsed.data.title || parsed.data.author || "snimka";
    const slug = uniqueSlug(slugify(base), new Set(existing.map((x) => x.slug)));
    await prisma.galleryPhoto.create({
      data: {
        slug,
        imageUrl: parsed.data.imageUrl,
        title: parsed.data.title,
        author: parsed.data.author,
        submitterContact: parsed.data.submitterContact,
        published: false,
      },
    });
  } catch {
    return { ok: false, message: "В момента не можем да запишем. Опитайте по-късно." };
  }
  return { ok: true, message: "Благодарим! Снимката ще се появи след преглед." };
}
