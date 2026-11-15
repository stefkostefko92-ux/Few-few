"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { saveUploadedImage } from "@/lib/uploads";
import {
  MSG,
  failState,
  fieldErrorsOf,
  honeypotFilled,
  nextAttempt,
  readValues,
  type FormState,
} from "@/lib/form-state";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Опишете накратко какво е на снимката — поне 3 знака.")
    .max(140, "Описанието е твърде дълго — до 140 знака."),
  author: z
    .string()
    .trim()
    .min(2, "Напишете кой е направил снимката (за кредит) — поне 2 знака.")
    .max(80, "Името е твърде дълго — до 80 знака."),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v),
      "Връзката трябва да започва с http:// или https://.",
    ),
  contact: z.string().trim().max(120).optional().default(""),
  // Декларация за изобразените лица (чл. 6/чл. 14 GDPR) — задължителна.
  peopleConsent: z.literal("on", {
    errorMap: () => ({
      message: "Потвърдете, че на снимката няма разпознаваеми хора или че те са съгласни.",
    }),
  }),
});

const FIELDS = ["title", "author", "imageUrl", "contact", "peopleConsent"] as const;

// Браузърът не позволява избраният файл да се върне във формата — казваме го.
const PICK_AGAIN = "Ако бяхте избрали снимка, изберете я отново.";

export type PhotoState = FormState;

export async function submitPhoto(prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);
  const file = formData.get("photo");
  const hasFile = file instanceof File && file.size > 0;
  const again = hasFile ? PICK_AGAIN : undefined;

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, again, fieldErrorsOf(parsed.error.issues));
  }
  if (!hasFile && !parsed.data.imageUrl) {
    return failState(values, attempt, undefined, {
      photo: "Качете снимка или поставете връзка към нея.",
    });
  }
  if (!rateLimit(await clientKey("photo"))) {
    return failState(values, attempt, [RATE_LIMIT_MESSAGE, again].filter(Boolean).join(" "));
  }
  const d = parsed.data;

  try {
    // Качен файл (директно от телефона/компютъра) има предимство пред линка.
    let imageUrl = d.imageUrl;
    if (hasFile) {
      const saved = await saveUploadedImage(file);
      if (!saved.ok) return failState(values, attempt, undefined, { photo: saved.error });
      imageUrl = saved.url;
    }

    // Четем само slug-овете със същия префикс (не цялата галерия).
    const base = slugify(d.title);
    const existing = await prisma.galleryPhoto.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const slug = uniqueSlug(base, new Set(existing.map((e) => e.slug)));

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
      summary: `Нова снимка за галерията: „${d.title}“ (от ${d.author}) — чака одобрение`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error("Грешка при запис на снимка:", err instanceof Error ? err.message : "неизвестна");
    return failState(values, attempt, [MSG.saveFailed, again].filter(Boolean).join(" "));
  }
}
