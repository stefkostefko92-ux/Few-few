"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBot, field, type FormState } from "@/lib/forms";

const schema = z.object({
  location: z.string().min(3, "Опишете къде е сметището."),
  description: z.string().optional().default(""),
  reporterName: z.string().optional().default(""),
  reporterPhone: z.string().optional().default(""),
});

export async function submitDump(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) {
    return { ok: true, message: "Благодарим! Сигналът е приет." };
  }

  const parsed = schema.safeParse({
    location: field(formData, "location", 200),
    description: field(formData, "description", 3000),
    reporterName: field(formData, "reporterName", 120),
    reporterPhone: field(formData, "reporterPhone", 60),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Моля, проверете полетата.",
    };
  }

  try {
    const existing = await prisma.dumpReport.findMany({ select: { slug: true } });
    const taken = new Set(existing.map((x) => x.slug));
    const slug = uniqueSlug(slugify(parsed.data.location), taken);
    await prisma.dumpReport.create({
      data: {
        slug,
        location: parsed.data.location,
        description: parsed.data.description,
        reporterName: parsed.data.reporterName,
        reporterPhone: parsed.data.reporterPhone,
        published: false,
      },
    });
  } catch {
    return {
      ok: false,
      message: "В момента не можем да запишем сигнала. Опитайте по-късно.",
    };
  }

  return {
    ok: true,
    message: "Благодарим! Сигналът е приет и ще бъде прегледан.",
  };
}
