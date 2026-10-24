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
  kind: z.enum(["NEED", "OFFER"], {
    errorMap: () => ({ message: "Изберете вид на зова." }),
  }),
  location: z.string().trim().max(120).optional().default(""),
  title: z
    .string()
    .trim()
    .min(4, "Заглавието е твърде кратко — поне 4 знака.")
    .max(140, "Заглавието е твърде дълго — до 140 знака."),
  beneficiary: z.string().trim().max(120).optional().default(""),
  description: z
    .string()
    .trim()
    .min(15, "Опишете по-подробно — поне 15 знака.")
    .max(4000, "Описанието е твърде дълго — до 4000 знака."),
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
  "location",
  "title",
  "beneficiary",
  "description",
  "contactName",
  "contactPhone",
  "contactEmail",
] as const;

export type HelpState = FormState;

export async function submitHelpCause(prev: HelpState, formData: FormData): Promise<HelpState> {
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
  if (!rateLimit(await clientKey("help"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }

  try {
    const existing = await prisma.helpCause.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(d.title), new Set(existing.map((e) => e.slug)));

    const created = await prisma.helpCause.create({
      data: {
        slug,
        title: d.title,
        kind: d.kind,
        beneficiary: d.beneficiary,
        location: d.location,
        description: d.description,
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        contactEmail: d.contactEmail,
        published: false,
      },
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "HelpCause",
      entityId: created.id,
      summary: `Нов зов за помощ: „${d.title}“ (чака одобрение)`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error(
      "Грешка при запис на зов за помощ:",
      err instanceof Error ? err.message : "неизвестна",
    );
    return failState(values, attempt, MSG.saveFailed);
  }
}
