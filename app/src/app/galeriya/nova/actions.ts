"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { saveUploadedImage } from "@/lib/uploads";

const schema = z.object({
  title: z.string().trim().min(3, "Опишете накратко какво е на снимката.").max(140),
  author: z.string().trim().min(2, "Въведете кой е направил снимката (за кредит).").max(80),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Линкът трябва да започва с http(s)://"),
  contact: z.string().trim().max(120).optional().default(""),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type PhotoState = { ok: boolean; error?: string };

export async function submitPhoto(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  if (!rateLimit(await clientKey("photo"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    title: formData.get("title"),
    author: formData.get("author"),
    imageUrl: formData.get("imageUrl") ?? "",
    contact: formData.get("contact") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

  // Качен файл (директно от телефона/компютъра) има предимство пред линка.
  let imageUrl = d.imageUrl;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    const saved = await saveUploadedImage(file);
    if (!saved.ok) return { ok: false, error: saved.error };
    imageUrl = saved.url;
  }

  if (!imageUrl) {
    return { ok: false, error: "Качете снимка или поставете линк към нея." };
  }

  const existing = await prisma.galleryPhoto.findMany({ select: { slug: true } });
  const slug = uniqueSlug(slugify(d.title), new Set(existing.map((e) => e.slug)));

  const created = await prisma.galleryPhoto.create({
    data: {
      slug,
      title: d.title,
      author: d.author,
      imageUrl,
      submitterContact: d.contact,
      published: false,
    },
  });

  await logAudit(null, {
    action: "CREATE",
    entity: "GalleryPhoto",
    entityId: created.id,
    summary: `Нова снимка за галерията: „${d.title}" (от ${d.author}) — чака одобрение`,
  });

  return { ok: true };
}
