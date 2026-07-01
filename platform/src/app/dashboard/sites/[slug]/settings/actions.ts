"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export type SettingsResult = { ok?: string; error?: string };

// Адрес: празен, качен файл (/uploads/…) или http(s).
const urlOrEmpty = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => {
    if (u === "") return true;
    if (/^\/uploads\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif)$/.test(u)) return true;
    try {
      return /^https?:$/.test(new URL(u).protocol);
    } catch {
      return false;
    }
  }, "Невалиден адрес.");

const schema = z.object({
  brandColor: z
    .string()
    .trim()
    .refine((c) => c === "" || /^#[0-9a-fA-F]{6}$/.test(c), "Цветът трябва да е #rrggbb.")
    .transform((c) => (c === "" ? null : c.toLowerCase())),
  fontFamily: z.enum(["sans", "serif", "rounded"]),
  logoUrl: urlOrEmpty.transform((u) => u || null),
  faviconUrl: urlOrEmpty.transform((u) => u || null),
  navEnabled: z.boolean(),
  footerText: z.string().trim().max(2000).transform((t) => t || null),
  privacyUrl: urlOrEmpty.transform((u) => u || null),
});

export type SettingsInput = z.input<typeof schema>;

export async function updateSiteSettingsAction(
  slug: string,
  input: SettingsInput,
): Promise<SettingsResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };
  }

  await prisma.site.update({ where: { id: found.site.id }, data: parsed.data });
  await logAudit(user, {
    action: "UPDATE",
    entity: "Site",
    entityId: found.site.id,
    summary: `Обновени настройки на сайта „${found.site.name}"`,
  });
  revalidatePath(`/dashboard/sites/${slug}/settings`);
  revalidatePath(`/site/${found.site.slug}`);
  return { ok: "Настройките са запазени." };
}
