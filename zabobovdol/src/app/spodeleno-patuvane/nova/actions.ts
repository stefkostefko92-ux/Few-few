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
  kind: z.enum(["OFFER", "NEED"], {
    errorMap: () => ({ message: "Изберете вид на обявата." }),
  }),
  routeFrom: z
    .string()
    .trim()
    .min(2, "Напишете откъде тръгвате — поне 2 знака.")
    .max(80, "Твърде дълго — до 80 знака."),
  routeTo: z
    .string()
    .trim()
    .min(2, "Напишете докъде пътувате — поне 2 знака.")
    .max(80, "Твърде дълго — до 80 знака."),
  schedule: z.string().trim().max(120).optional().default(""),
  seats: z.string().trim().max(40).optional().default(""),
  costNote: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(2000, "Текстът е твърде дълъг — до 2000 знака.").optional().default(""),
  contactName: z.string().trim().max(80).optional().default(""),
  contactPhone: z.string().trim().max(40).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
});

const FIELDS = [
  "kind",
  "routeFrom",
  "routeTo",
  "schedule",
  "seats",
  "costNote",
  "description",
  "contactName",
  "contactPhone",
  "contactEmail",
] as const;

export type RideState = FormState;

export async function submitRideshare(prev: RideState, formData: FormData): Promise<RideState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  const d = parsed.data;
  if (!d.contactPhone && !d.contactEmail) {
    return failState(values, attempt, undefined, { contactPhone: MSG.contactNeeded });
  }
  if (!rateLimit(await clientKey("ride"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }

  try {
    const existing = await prisma.rideshare.findMany({ select: { slug: true } });
    const base = `${d.routeFrom}-${d.routeTo}`;
    const slug = uniqueSlug(slugify(base), new Set(existing.map((e) => e.slug)));

    const created = await prisma.rideshare.create({
      data: {
        slug,
        kind: d.kind,
        routeFrom: d.routeFrom,
        routeTo: d.routeTo,
        schedule: d.schedule,
        seats: d.seats,
        costNote: d.costNote,
        description: d.description,
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        contactEmail: d.contactEmail,
        published: false,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
      },
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "Rideshare",
      entityId: created.id,
      summary: `Нова обява за споделено пътуване: ${d.routeFrom} – ${d.routeTo}`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error(
      "Грешка при запис на споделено пътуване:",
      err instanceof Error ? err.message : "неизвестна",
    );
    return failState(values, attempt, MSG.saveFailed);
  }
}
