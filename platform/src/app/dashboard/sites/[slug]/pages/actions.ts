"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { parseBlocks, type Block } from "@/lib/blocks";
import { z } from "zod";

export type PageActionResult = { ok?: string; error?: string };

const slugField = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-z0-9-]*$/, "Само малки латински букви, цифри и тире.");

// Транслитерация БГ→лат + slugify (кирилско заглавие да не дава празен slug).
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht",
  ъ: "a", ь: "y", ю: "yu", я: "ya",
};
function slugify(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((c) => CYR[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// Взима страница само ако е на сайт, до който потребителят има нужния достъп.
async function pageForUser(slug: string, pageId: string, need: "read" | "manage") {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, need);
  if (!found) return null;
  const page = await prisma.page.findFirst({
    where: { id: pageId, siteId: found.site.id },
  });
  if (!page) return null;
  return { user, site: found.site, page };
}

export async function createPageAction(
  slug: string,
  _prev: PageActionResult,
  formData: FormData,
): Promise<PageActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const title = String(formData.get("title") ?? "").trim();
  const pageSlug = slugField.safeParse(formData.get("slug") ?? "");
  if (title.length < 2) return { error: "Въведете заглавие." };
  if (!pageSlug.success) return { error: pageSlug.error.issues[0]?.message ?? "Невалиден адрес." };

  const count = await prisma.page.count({ where: { siteId: found.site.id } });
  const isHome = count === 0;
  // Не-начална страница: явен slug → транслитериран от заглавието → резервен,
  // за да не се получи празен slug (който би се сблъскал с началната).
  const finalSlug = isHome
    ? ""
    : pageSlug.data || slugify(title) || `stranica-${count + 1}`;

  const clash = await prisma.page.findFirst({
    where: { siteId: found.site.id, slug: finalSlug },
  });
  if (clash) return { error: "Вече има страница с този адрес." };

  const page = await prisma.page.create({
    data: { siteId: found.site.id, title, slug: finalSlug, isHome },
  });
  await logAudit(user, {
    action: "CREATE",
    entity: "Page",
    entityId: page.id,
    summary: `Нова страница „${title}" за ${found.site.name}`,
  });
  redirect(`/dashboard/sites/${slug}/pages/${page.id}`);
}

export async function saveDraftAction(
  slug: string,
  pageId: string,
  blocks: Block[],
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };
  const clean = parseBlocks(blocks); // валидира и изчиства чрез Zod
  await prisma.page.update({
    where: { id: pageId },
    data: { draftBlocks: clean },
  });
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}`);
  return { ok: "Черновата е запазена." };
}

export async function publishPageAction(
  slug: string,
  pageId: string,
  blocks: Block[],
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };
  const clean = parseBlocks(blocks);
  await prisma.page.update({
    where: { id: pageId },
    data: {
      draftBlocks: clean,
      blocks: clean,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await logAudit(ctx.user, {
    action: "UPDATE",
    entity: "Page",
    entityId: pageId,
    summary: `Публикувана страница „${ctx.page.title}"`,
  });
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}`);
  revalidatePath(`/site/${ctx.site.slug}`);
  return { ok: "Страницата е публикувана." };
}

export async function deletePageAction(slug: string, pageId: string): Promise<void> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return;
  await prisma.page.delete({ where: { id: pageId } });
  await logAudit(ctx.user, {
    action: "DELETE",
    entity: "Page",
    entityId: pageId,
    summary: `Изтрита страница „${ctx.page.title}"`,
  });
  redirect(`/dashboard/sites/${slug}/pages`);
}
