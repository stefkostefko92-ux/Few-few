"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const schema = z.object({
  title: z.string().trim().min(4, "Въведете кратко заглавие.").max(140),
  author: z.string().trim().max(80).optional().default(""),
  period: z.string().trim().max(60).optional().default(""),
  content: z.string().trim().min(20, "Разкажете малко повече.").max(6000),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type MemoryState = { ok: boolean; error?: string };

export async function submitMemory(
  _prev: MemoryState,
  formData: FormData,
): Promise<MemoryState> {
  if (!rateLimit(await clientKey("memory"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    title: formData.get("title"),
    author: formData.get("author") ?? "",
    period: formData.get("period") ?? "",
    content: formData.get("content"),
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

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

  return { ok: true };
}
