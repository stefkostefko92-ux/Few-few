"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const schema = z.object({
  name: z.string().trim().min(2, "Въведете името си.").max(80),
  area: z.string().trim().max(80).optional().default(""),
  skills: z.string().trim().min(3, "Какво можете да помогнете?").max(300),
  about: z.string().trim().max(1500).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default("")
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "Невалиден имейл."),
  website: z.string().max(0).optional().default(""), // honeypot
});

export type VolunteerState = { ok: boolean; error?: string };

export async function submitVolunteer(
  _prev: VolunteerState,
  formData: FormData,
): Promise<VolunteerState> {
  if (!rateLimit(await clientKey("volunteer"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const parsed = schema.safeParse({
    name: formData.get("name"),
    area: formData.get("area") ?? "",
    skills: formData.get("skills"),
    about: formData.get("about") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;
  if (!d.phone && !d.email) {
    return { ok: false, error: "Посочете телефон или имейл, за да се свържем с вас." };
  }

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

  return { ok: true };
}
