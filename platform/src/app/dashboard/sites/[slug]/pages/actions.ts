"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { parseBlocks, parseBlocksStrict, type Block } from "@/lib/blocks";
import { generatePageBlocks } from "@/lib/ai/generate";
import { assistText } from "@/lib/ai/assist";
import { resolveProvider } from "@/lib/ai/generate";
import { ASSIST_ACTIONS, type AssistAction } from "@/lib/ai/assist-core";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

export type PageActionResult = { ok?: string; error?: string };

export type AssistActionResult = { text?: string; error?: string; ai?: boolean };

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

// Създава страница от текстово описание чрез AI (или rules fallback без ключ).
export async function createAiPageAction(
  slug: string,
  _prev: PageActionResult,
  formData: FormData,
): Promise<PageActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const prompt = String(formData.get("prompt") ?? "").trim();
  if (prompt.length < 4) return { error: "Опишете какво да съдържа страницата." };

  // Лимит на скъпите AI извиквания: 10 на минута на потребител (пази от
  // харчене на токени в цикъл). In-memory — при няколко инстанции ползвайте Redis.
  if (!rateLimit(`ai-page:${user.id}`, 10, 60_000)) {
    return { error: "Твърде много опити. Опитайте отново след минута." };
  }

  const { blocks, provider } = await generatePageBlocks(prompt);

  // Уникален slug с кратък суфикс, за да няма сблъсък при паралелни/повторни заявки.
  const count = await prisma.page.count({ where: { siteId: found.site.id } });
  const isHome = count === 0;
  const title = prompt.slice(0, 60);
  const finalSlug = isHome
    ? ""
    : `stranica-${count + 1}-${Math.abs(prompt.length * 2654435761 % 46656).toString(36)}`;

  let page;
  try {
    page = await prisma.page.create({
      data: {
        siteId: found.site.id,
        title,
        slug: finalSlug,
        isHome,
        draftBlocks: blocks,
      },
    });
  } catch (err) {
    // Уникалният ключ (siteId, slug) или начална страница вече съществува.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Вече има страница с този адрес — опитайте отново." };
    }
    throw err;
  }
  await logAudit(user, {
    action: "CREATE",
    entity: "Page",
    entityId: page.id,
    summary: `AI страница (${provider}) за ${found.site.name}`,
  });
  redirect(`/dashboard/sites/${slug}/pages/${page.id}`);
}

// AI асистент за текст на блок (подобри/скъси/официално/превод…). Скоуп по сайт
// (manage), лимитиран, никога не хвърля към UI.
const VALID_ASSIST = new Set<string>(
  [...ASSIST_ACTIONS.map((a) => a.action), "alt"],
);

export async function assistTextAction(
  slug: string,
  action: string,
  text: string,
): Promise<AssistActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  if (!VALID_ASSIST.has(action)) return { error: "Непознато действие." };
  const input = String(text ?? "").slice(0, 8000);
  if (!input.trim()) return { error: "Няма текст за обработка." };

  // Лимит на AI извикванията: 30 на минута на потребител.
  if (!rateLimit(`ai-assist:${user.id}`, 30, 60_000)) {
    return { error: "Твърде много опити. Опитайте отново след минута." };
  }

  const { text: out, provider } = await assistText(action as AssistAction, input);
  if (provider === "rules" && out.trim() === input.trim()) {
    return { error: "AI не е свързан. Задайте AI ключ, за да ползвате асистента." };
  }
  return { text: out, ai: provider !== "rules" };
}

type Loc = "bg" | "en" | "it";
function asLoc(locale: string): Loc {
  return locale === "en" ? "en" : locale === "it" ? "it" : "bg";
}

function draftData(loc: Loc, clean: Block[]): Prisma.PageUpdateInput {
  if (loc === "en") return { draftBlocksEn: clean };
  if (loc === "it") return { draftBlocksIt: clean };
  return { draftBlocks: clean };
}

function publishData(loc: Loc, clean: Block[], prev: Date | null): Prisma.PageUpdateInput {
  const status = "PUBLISHED" as const;
  // status/publishedAt са на ниво страница; вторичен език също прави видима.
  if (loc === "en") return { draftBlocksEn: clean, blocksEn: clean, status, publishedAt: prev ?? new Date() };
  if (loc === "it") return { draftBlocksIt: clean, blocksIt: clean, status, publishedAt: prev ?? new Date() };
  return { draftBlocks: clean, blocks: clean, status, publishedAt: new Date() };
}

export async function saveDraftAction(
  slug: string,
  pageId: string,
  locale: string,
  blocks: Block[],
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };
  const parsed = parseBlocksStrict(blocks); // валидира чрез Zod, без тихо изтриване
  if (!parsed.ok) {
    return { error: "Има невалиден блок — проверете адресите на връзките." };
  }
  await prisma.page.update({ where: { id: pageId }, data: draftData(asLoc(locale), parsed.data) });
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}`);
  return { ok: "Черновата е запазена." };
}

export async function publishPageAction(
  slug: string,
  pageId: string,
  locale: string,
  blocks: Block[],
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };
  const loc = asLoc(locale);
  const parsed = parseBlocksStrict(blocks);
  if (!parsed.ok) {
    return { error: "Има невалиден блок — проверете адресите на връзките." };
  }
  const clean = parsed.data;
  await prisma.page.update({
    where: { id: pageId },
    data: publishData(loc, clean, ctx.page.publishedAt),
  });
  await logAudit(ctx.user, {
    action: "UPDATE",
    entity: "Page",
    entityId: pageId,
    summary: `Публикувана страница „${ctx.page.title}" (${loc.toUpperCase()})`,
  });

  // Снимка в историята (за възстановяване); пазим последните 20.
  const fresh = await prisma.page.findUnique({
    where: { id: pageId },
    select: { blocks: true, blocksEn: true, blocksIt: true },
  });
  if (fresh) {
    await prisma.pageVersion.create({
      data: { pageId, blocks: fresh.blocks as object, blocksEn: fresh.blocksEn as object, blocksIt: fresh.blocksIt as object },
    });
    const stale = await prisma.pageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
      skip: 20,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.pageVersion.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  }

  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}`);
  revalidatePath(`/site/${ctx.site.slug}`);
  return { ok: `Страницата е публикувана (${loc.toUpperCase()}).` };
}

// Възстановява съдържание от версия в черновите (после потребителят публикува).
export async function restoreVersionAction(
  slug: string,
  pageId: string,
  versionId: string,
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };
  const v = await prisma.pageVersion.findFirst({ where: { id: versionId, pageId } });
  if (!v) return { error: "Версията не е намерена." };
  await prisma.page.update({
    where: { id: pageId },
    data: {
      draftBlocks: v.blocks as object,
      draftBlocksEn: v.blocksEn as object,
      draftBlocksIt: v.blocksIt as object,
    },
  });
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}`);
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}/settings`);
  return { ok: "Възстановено в черновата. Прегледайте и публикувайте." };
}

// Включва/изключва вторичен език на сайта (en/it) — site-scope, MANAGER.
export async function toggleLocaleAction(
  slug: string,
  locale: string,
  enabled: boolean,
): Promise<PageActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  const loc = asLoc(locale);
  if (loc === "bg") return { error: "Българският е основен." };
  await prisma.site.update({
    where: { id: found.site.id },
    data: loc === "en" ? { localeEn: enabled } : { localeIt: enabled },
  });
  revalidatePath(`/dashboard/sites/${slug}`, "layout");
  const name = loc === "en" ? "Английската" : "Италианската";
  return { ok: enabled ? `${name} версия е включена.` : `${name} версия е изключена.` };
}

// Превежда черновата (BG → целевия език) с AI и я записва в неговата чернова.
export async function translatePageAction(
  slug: string,
  pageId: string,
  target: string,
  blocks: Block[],
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };
  const loc = asLoc(target);
  if (loc === "bg") return { error: "Изберете вторичен език." };
  // Без AI ключ преводът е безсмислен цикъл (връща оригинала) — спираме рано.
  if (resolveProvider().provider === "rules") {
    return { error: "AI не е свързан. Задайте AI ключ, за да превеждате." };
  }
  if (!rateLimit(`ai-translate:${ctx.user.id}`, 6, 60_000)) {
    return { error: "Твърде много опити. Опитайте отново след минута." };
  }
  const src = parseBlocks(blocks);
  const translated = await translateBlocks(src, loc === "it" ? "translate-it" : "translate-en");
  await prisma.page.update({ where: { id: pageId }, data: draftData(loc, translated) });
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}`);
  return { ok: `Преводът е готов в ${loc === "it" ? "италианската" : "английската"} чернова.` };
}

// Превежда текстовите полета на всеки блок (BG→target), пази структурата и id-тата.
async function translateBlocks(blocks: Block[], action: "translate-en" | "translate-it"): Promise<Block[]> {
  const tr = async (t: string) => {
    const s = t.trim();
    if (!s) return t;
    const { text } = await assistText(action, s);
    return text || t;
  };
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === "heading") out.push({ ...b, text: await tr(b.text) });
    else if (b.type === "text") out.push({ ...b, text: await tr(b.text) });
    else if (b.type === "columns") out.push({ ...b, left: await tr(b.left), right: await tr(b.right) });
    else if (b.type === "hero") out.push({ ...b, title: await tr(b.title), subtitle: await tr(b.subtitle), buttonLabel: await tr(b.buttonLabel) });
    else if (b.type === "button") out.push({ ...b, label: await tr(b.label) });
    else if (b.type === "faq") out.push({ ...b, items: await Promise.all(b.items.map(async (i) => ({ q: await tr(i.q), a: await tr(i.a) }))) });
    else if (b.type === "testimonials") out.push({ ...b, items: await Promise.all(b.items.map(async (i) => ({ quote: await tr(i.quote), author: i.author, role: await tr(i.role) }))) });
    else if (b.type === "pricing") out.push({ ...b, plans: await Promise.all(b.plans.map(async (p) => ({ ...p, name: await tr(p.name), period: await tr(p.period), features: await Promise.all(p.features.map(tr)) }))) });
    else if (b.type === "form") out.push({ ...b, title: await tr(b.title), buttonLabel: await tr(b.buttonLabel), successMessage: await tr(b.successMessage) });
    else out.push(b);
  }
  return out;
}

// Настройки на страница: видимост/ред в менюто + ръчно SEO. Server-action форма.
export async function updatePageSettingsAction(
  slug: string,
  pageId: string,
  _prev: PageActionResult,
  formData: FormData,
): Promise<PageActionResult> {
  const ctx = await pageForUser(slug, pageId, "manage");
  if (!ctx) return { error: "Нямате достъп." };

  const rawPublishAt = String(formData.get("publishAt") ?? "").trim();
  let publishAt: Date | null = null;
  if (rawPublishAt) {
    const d = new Date(rawPublishAt);
    if (isNaN(d.getTime())) return { error: "Невалидна дата за публикуване." };
    publishAt = d;
  }

  const parsed = z
    .object({
      showInNav: z.boolean(),
      navOrder: z.number().int().min(-999).max(999),
      seoTitle: z.string().trim().max(70).transform((s) => s || null),
      seoDescription: z.string().trim().max(160).transform((s) => s || null),
    })
    .safeParse({
      showInNav: formData.get("showInNav") === "on",
      navOrder: Number(formData.get("navOrder") ?? 0),
      seoTitle: String(formData.get("seoTitle") ?? ""),
      seoDescription: String(formData.get("seoDescription") ?? ""),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };
  }

  await prisma.page.update({ where: { id: pageId }, data: { ...parsed.data, publishAt } });
  revalidatePath(`/dashboard/sites/${slug}/pages/${pageId}/settings`);
  revalidatePath(`/site/${ctx.site.slug}`);
  return { ok: "Настройките на страницата са запазени." };
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
