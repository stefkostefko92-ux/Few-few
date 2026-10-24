"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import {
  EMAIL_RE,
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
    .min(3, "Заглавието е твърде кратко — поне 3 знака.")
    .max(120, "Заглавието е твърде дълго — до 120 знака."),
  type: z.enum(["OFFER", "WANTED", "JOB", "REALESTATE", "FREE", "EVENT", "OTHER"], {
    errorMap: () => ({ message: "Изберете вид на обявата." }),
  }),
  category: z.string().trim().max(60).optional().default(""),
  price: z.string().trim().max(60, "Цената е твърде дълга — до 60 знака.").optional().default(""),
  description: z
    .string()
    .trim()
    .min(10, "Описанието е твърде кратко — поне 10 знака.")
    .max(4000, "Описанието е твърде дълго — до 4000 знака."),
  contactName: z.string().trim().max(80).optional().default(""),
  contactPhone: z.string().trim().max(40).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default("")
    .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
});

const FIELDS = [
  "title",
  "type",
  "category",
  "price",
  "description",
  "contactName",
  "contactPhone",
  "contactEmail",
] as const;

export type SubmitState = FormState;

export async function submitListing(prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  const data = parsed.data;
  // Изисква поне един начин за контакт.
  if (!data.contactPhone && !data.contactEmail) {
    return failState(values, attempt, undefined, { contactPhone: MSG.contactNeeded });
  }
  if (!rateLimit(await clientKey("listing"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }

  try {
    const existing = await prisma.listing.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(data.title), new Set(existing.map((e) => e.slug)));

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
      summary: `Нова обява от посетител: „${data.title}“ (чака одобрение)`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error("Грешка при запис на обява:", err instanceof Error ? err.message : "неизвестна");
    return failState(values, attempt, MSG.saveFailed);
  }
}
