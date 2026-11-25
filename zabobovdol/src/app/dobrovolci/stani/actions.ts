"use server";

import { z } from "zod";
import { isPhoneInput, normalizePhoneInput } from "@/lib/phone";
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
  name: z
    .string()
    .trim()
    .min(2, "Напишете името си — поне 2 знака.")
    .max(80, "Името е твърде дълго — до 80 знака."),
  area: z.string().trim().max(80).optional().default(""),
  skills: z
    .string()
    .trim()
    .min(3, "Напишете с какво можете да помогнете — поне 3 знака.")
    .max(300, "Текстът е твърде дълъг — до 300 знака."),
  about: z.string().trim().max(1500, "Текстът е твърде дълъг — до 1500 знака.").optional().default(""),
  // Непълен номер не стига до публикуване — иначе на мястото му стои
  // „Телефонът се проверява“. „359…“ и мобилен без 0 се допълват.
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .default("")
    .transform(normalizePhoneInput)
    .refine((v) => v === "" || isPhoneInput(v), MSG.phone),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
});

const FIELDS = ["name", "area", "skills", "about", "phone", "email"] as const;

export type VolunteerState = FormState;

export async function submitVolunteer(
  prev: VolunteerState,
  formData: FormData,
): Promise<VolunteerState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  const d = parsed.data;
  if (!d.phone && !d.email) {
    return failState(values, attempt, undefined, { phone: MSG.contactNeeded });
  }
  if (!rateLimit(await clientKey("volunteer"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }

  try {
    const existing = await prisma.volunteer.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(d.name), new Set(existing.map((e) => e.slug)));

    const created = await prisma.volunteer.create({
      data: {
        slug,
        name: d.name,
        area: d.area,
        skills: d.skills,
        about: d.about,
        phone: d.phone,
        email: d.email,
        published: false,
      },
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "Volunteer",
      entityId: created.id,
      summary: `Нов доброволец: ${d.name} (чака одобрение)`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error(
      "Грешка при запис на доброволец:",
      err instanceof Error ? err.message : "неизвестна",
    );
    return failState(values, attempt, MSG.saveFailed);
  }
}
