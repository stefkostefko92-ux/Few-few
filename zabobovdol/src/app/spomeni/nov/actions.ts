"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
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
    .min(4, "Заглавието е твърде кратко — поне 4 знака.")
    .max(140, "Заглавието е твърде дълго — до 140 знака."),
  author: z.string().trim().max(80).optional().default(""),
  period: z.string().trim().max(60).optional().default(""),
  content: z
    .string()
    .trim()
    .min(20, "Разкажете малко повече — поне 20 знака.")
    .max(6000, "Текстът е твърде дълъг — до 6000 знака."),
});

const FIELDS = ["title", "author", "period", "content"] as const;

export type MemoryState = FormState;

export async function submitMemory(prev: MemoryState, formData: FormData): Promise<MemoryState> {
  const values = readValues(formData, FIELDS);
  const attempt = nextAttempt(prev);

  // Ред (като BusinessForm): honeypot → проверка → лимит.
  if (honeypotFilled(formData)) return failState(values, attempt, MSG.invalid);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return failState(values, attempt, undefined, fieldErrorsOf(parsed.error.issues));
  }
  if (!rateLimit(await clientKey("memory"))) {
    return failState(values, attempt, RATE_LIMIT_MESSAGE);
  }
  const d = parsed.data;

  try {
    const existing = await prisma.memory.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(d.title), new Set(existing.map((e) => e.slug)));

    const created = await prisma.memory.create({
      data: {
        slug,
        title: d.title,
        author: d.author,
        period: d.period,
        content: d.content,
        published: false,
      },
    });

    await logAudit(null, {
      action: "CREATE",
      entity: "Memory",
      entityId: created.id,
      summary: `Нов спомен: „${d.title}“ (чака одобрение)`,
    });

    return { ok: true, attempt };
  } catch (err) {
    console.error("Грешка при запис на спомен:", err instanceof Error ? err.message : "неизвестна");
    return failState(values, attempt, MSG.saveFailed);
  }
}
