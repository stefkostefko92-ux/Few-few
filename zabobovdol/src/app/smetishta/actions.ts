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
  location: z
    .string()
    .trim()
    .min(3, "Напишете къде е сметището — улица, квартал или ориентир (поне 3 знака).")
    .max(160, "Мястото е описано твърде дълго — до 160 знака."),
  description: z
    .string()
    .trim()
    .min(10, "Опишете сметището по-подробно — поне 10 знака.")
    .max(3000, "Описанието е твърде дълго — до 3000 знака."),
  photoUrl: z
    .string()
    .trim()
    .max(400)
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v),
      "Връзката към снимката трябва да започва с http:// или https://.",
    ),
  name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || EMAIL_RE.test(v), MSG.email),
});

const FIELDS = ["location", "description", "photoUrl", "name", "phone", "email"] as const;

export type DumpState = FormState;

export async function submitDumpReport(prev: DumpState, formData: FormData): Promise<DumpState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  if (!rateLimit(await clientKey("dump"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }
  const d = parsed.data;

  try {
    const existing = await prisma.dumpReport.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(d.location), new Set(existing.map((e) => e.slug)));

    const created = await prisma.dumpReport.create({
      data: {
        slug,
        location: d.location,
        description: d.description,
        photoUrl: d.photoUrl,
        reporterName: d.name,
        reporterPhone: d.phone,
        reporterEmail: d.email,
        status: "NEW",
        published: false,
      },
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "DumpReport",
      entityId: created.id,
      summary: `Нов сигнал за сметище: „${d.location}“ (чака одобрение)`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error(
      "Грешка при запис на сигнал за сметище:",
      err instanceof Error ? err.message : "неизвестна",
    );
    return failState(values, attempt, MSG.saveFailed);
  }
}
