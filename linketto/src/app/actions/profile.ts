'use server';

import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { redirect } from 'next/navigation';
import { dash } from '@/lib/dashboard-url';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isValidSlug, normalizeSlug } from '@/lib/slug';
import { isLocale, LOCALES } from '@/i18n/locales';
import { planFor } from '@/lib/plans';
import { MAX_BLOCKS_PER_PROFILE, parseBlockInput, pollVotesStillValid, type BlockMeta } from '@/lib/blocks';
import { lockedCount } from '@/lib/profile-lock';
import { parseStyle, styleInput, styleSchema } from '@/lib/style';
import { removeUnusedMedia, saveUploadedImage } from '@/lib/media';
import { applyTemplate, isTemplateId, NICHE_TEMPLATES } from '@/lib/templates';
import { domainChange, domainTxtName, txtMatches } from '@/lib/domain-verify';
import { rateLimit } from '@/lib/rate-limit';
import { zonedLocalToUtc } from '@/lib/zoned-time';
import { PROFILE_THEMES } from '@/lib/profile-themes';
import { moveInOrder, validReorder } from '@/lib/link-order';
import { Prisma } from '@prisma/client';

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

async function requireUser(uiLocale: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  return user;
}

export async function createProfileAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const slug = normalizeSlug(String(formData.get('slug') ?? ''));
  const displayName =
    String(formData.get('displayName') ?? '').trim().slice(0, 100) ||
    user.name ||
    slug;
  if (!isValidSlug(slug)) {
    redirect(await dash(uiLocale, '?error=slug'));
  }
  // Лимит на профили по плана (няколко профила = Business).
  const owned = await prisma.profile.count({ where: { userId: user.id } });
  if (owned >= planFor(user.plan).maxProfiles) {
    redirect(await dash(uiLocale, '?error=profiles'));
  }
  const existing = await prisma.profile.findUnique({ where: { slug } });
  if (existing) {
    redirect(await dash(uiLocale, '?error=slug'));
  }
  // По избор: шаблон по ниша още при създаването.
  const template = String(formData.get('template') ?? '');
  const preset = isTemplateId(template)
    ? {
        accent: NICHE_TEMPLATES[template].accent,
        style: applyTemplate(parseStyle(null), template),
      }
    : {};
  await prisma.profile.create({
    data: {
      userId: user.id,
      slug,
      defaultLocale: user.locale,
      ...preset,
      translations: {
        create: { locale: user.locale, displayName },
      },
    },
  });
  redirect(await dash(uiLocale));
}

// Шаблон по ниша върху съществуващ профил — визуален пресет за 1 клик;
// аватарът, фоновата снимка и платените настройки се пазят.
export async function applyTemplateAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const template = String(formData.get('template') ?? '');
  if (!isTemplateId(template)) redirect(await dash(uiLocale, '?error=style'));
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { style: true },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));
  await prisma.profile.update({
    where: { id: profileId },
    data: {
      accent: NICHE_TEMPLATES[template].accent,
      style: applyTemplate(parseStyle(profile.style), template),
    },
  });
  redirect(await dash(uiLocale));
}

const settingsSchema = z.object({
  theme: z.enum(PROFILE_THEMES),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal('')),
  defaultLocale: z.string().refine(isLocale),
  published: z.coerce.boolean(),
});

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export async function updateProfileAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const parsed = settingsSchema.safeParse({
    theme: formData.get('theme'),
    accent: formData.get('accent') ?? '',
    defaultLocale: formData.get('defaultLocale'),
    published: formData.get('published') === 'on',
  });
  if (!parsed.success) {
    redirect(await dash(uiLocale, '?error=generic'));
  }

  // Собствен домейн — само за платени планове.
  const rawDomain = String(formData.get('customDomain') ?? '')
    .trim()
    .toLowerCase();
  const customDomain = rawDomain === '' ? null : rawDomain;
  if (customDomain) {
    if (!planFor(user.plan).customDomain) {
      redirect(await dash(uiLocale, '?error=limit'));
    }
    if (!DOMAIN_RE.test(customDomain) || customDomain.length > 253) {
      redirect(await dash(uiLocale, '?error=domain'));
    }
  }

  // Нов/сменен домейн → нов токен и непроверен (TXT проверка на собствеността).
  const current = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { customDomain: true, domainToken: true },
  });
  if (!current) redirect(await dash(uiLocale, '?error=generic'));
  const change = domainChange({ current: current.customDomain, next: customDomain });
  // Заварен домейн без токен (отпреди проверката) също получава токен.
  const needsToken = change.kind === 'keep' && customDomain !== null && !current.domainToken;
  const domainFields =
    change.kind === 'reset' || needsToken
      ? { domainToken: randomBytes(16).toString('hex'), domainVerifiedAt: null }
      : change.kind === 'clear'
        ? { domainToken: null, domainVerifiedAt: null }
        : {};

  // Уникалността пази само ПРОВЕРЕН домейн: чужди непроверени заявки за същия
  // домейн се освобождават (иначе всеки може да „заеме“ чужд домейн и истинският
  // собственик получава „зает“). Кой го държи решава TXT проверката.
  if (customDomain && change.kind === 'reset') {
    await prisma.profile.updateMany({
      where: { customDomain, domainVerifiedAt: null, id: { not: profileId } },
      data: { customDomain: null, domainToken: null },
    });
  }

  try {
    const { count } = await prisma.profile.updateMany({
      where: { id: profileId, userId: user.id },
      data: {
        theme: parsed.data.theme,
        accent: parsed.data.accent || null,
        defaultLocale: parsed.data.defaultLocale,
        published: parsed.data.published,
        customDomain,
        ...domainFields,
      },
    });
    if (count === 0) redirect(await dash(uiLocale, '?error=generic'));
  } catch (error) {
    // P2002 = зает домейн (unique)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      redirect(await dash(uiLocale, '?error=domain'));
    }
    throw error;
  }
  redirect(await dash(uiLocale));
}

// Стиловият енджин: всичко от секцията „Персонализация“ минава оттук.
export async function updateStyleAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');

  const parsed = styleSchema.safeParse(styleInput((name) => formData.get(name)));
  if (!parsed.success) {
    redirect(await dash(uiLocale, '?error=style'));
  }
  // Скриването на Linketto баджа е привилегия на платените планове.
  if (parsed.data.hideBadge && !planFor(user.plan).hideBadge) {
    redirect(await dash(uiLocale, '?error=limit'));
  }
  const before = await prisma.profile.findFirst({ where: { id: profileId, userId: user.id }, select: { style: true } });
  if (!before) redirect(await dash(uiLocale, '?error=generic'));
  const old = parseStyle(before.style);
  // Наш /media файл — само ако вече е в стила на ТОЗИ профил (качен е през uploadImageAction);
  // иначе чужд файл би останал публичен след като собственикът го махне (Разбивача Н4).
  for (const key of ['avatarUrl', 'bgImageUrl'] as const) {
    const next = parsed.data[key];
    if (next?.startsWith('/media/') && next !== old[key]) redirect(await dash(uiLocale, '?error=style'));
  }
  const { count } = await prisma.profile.updateMany({
    where: { id: profileId, userId: user.id },
    data: { style: parsed.data },
  });
  if (count === 0) redirect(await dash(uiLocale, '?error=generic'));
  // Махнат или сменен аватар/фон → старият наш файл се трие, ако никъде не се ползва.
  if (old.avatarUrl !== parsed.data.avatarUrl) await removeUnusedMedia(old.avatarUrl);
  if (old.bgImageUrl !== parsed.data.bgImageUrl) await removeUnusedMedia(old.bgImageUrl);
  redirect(await dash(uiLocale));
}

// Качване на снимка (фон на профила или аватар) — sharp я преоразмерява,
// маха EXIF и я записва като webp; пътят влиза в стила на профила.
export async function uploadImageAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const kind = String(formData.get('kind') ?? '') as 'bg' | 'avatar';
  const file = formData.get('file');
  // Качването е тежко (sharp) — 30 на час на потребител (червен екип).
  if (!rateLimit(`upload:${user.id}`, 30, 60 * 60_000)) redirect(await dash(uiLocale, '?error=upload'));
  if ((kind !== 'bg' && kind !== 'avatar') || !(file instanceof File)) {
    redirect(await dash(uiLocale, '?error=upload'));
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));

  const mediaPath = await saveUploadedImage(file, kind, user.id);
  if (!mediaPath) redirect(await dash(uiLocale, '?error=upload'));

  const style = parseStyle(profile.style);
  const nextStyle =
    kind === 'bg'
      ? { ...style, bgImageUrl: mediaPath, bgStyle: 'image' as const }
      : { ...style, avatarUrl: mediaPath };
  await prisma.profile.update({
    where: { id: profile.id },
    data: { style: nextStyle },
  });
  // Старият файл (ако е наш и вече никъде не се ползва) — изтрит.
  await removeUnusedMedia(kind === 'bg' ? style.bgImageUrl : style.avatarUrl);
  redirect(await dash(uiLocale));
}

export async function upsertProfileTranslationAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const locale = String(formData.get('locale') ?? '');
  const displayName = String(formData.get('displayName') ?? '')
    .trim()
    .slice(0, 100);
  const bio = String(formData.get('bio') ?? '').trim().slice(0, 500) || null;
  if (!isLocale(locale)) redirect(await dash(uiLocale, '?error=generic'));

  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { translations: true },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));

  const hasIt = profile.translations.some((t) => t.locale === locale);
  if (!displayName) {
    // Празно име = изтриване на езиковата версия (без основния език).
    if (hasIt && locale !== profile.defaultLocale) {
      await prisma.profileTranslation.delete({
        where: { profileId_locale: { profileId, locale } },
      });
    }
    redirect(await dash(uiLocale));
  }

  // Лимит на плана: Free = 2 езикови версии.
  const plan = planFor(user.plan);
  if (
    !hasIt &&
    plan.maxLocales !== null &&
    profile.translations.length >= plan.maxLocales
  ) {
    redirect(await dash(uiLocale, '?error=limit'));
  }

  await prisma.profileTranslation.upsert({
    where: { profileId_locale: { profileId, locale } },
    create: { profileId, locale, displayName, bio },
    update: { displayName, bio },
  });
  redirect(await dash(uiLocale));
}

export async function addLinkAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 100);
  const input = parseBlockInput({
    kind: String(formData.get('kind') ?? 'LINK'),
    url: String(formData.get('url') ?? ''),
    extra1: String(formData.get('extra1') ?? ''),
    extra2: String(formData.get('extra2') ?? ''),
    color: String(formData.get('color') ?? ''),
    featured: formData.get('featured') === 'on',
    options: String(formData.get('options') ?? ''),
  });
  if (!input || !title) {
    redirect(await dash(uiLocale, '?error=block'));
  }
  if (!rateLimit(`add-link:${user.id}`, 300, 60 * 60_000)) redirect(await dash(uiLocale, '?error=blocksLimit'));
  const profile = await prisma.profile.findFirst({ where: { id: profileId, userId: user.id } });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));
  // Таванът — броене и запис под заключения ред на профила (паралелни заявки не го прескачат).
  const added = await prisma.$transaction(async (tx) => {
    const links = await lockedCount(tx, profile.id, 'links');
    if (links >= MAX_BLOCKS_PER_PROFILE) return false;
    await tx.link.create({
      data: {
        profileId,
        kind: input.kind,
        url: input.url,
        meta: input.meta ? (input.meta as Prisma.InputJsonValue) : undefined,
        position: links,
        showFrom: parseDateInput(formData.get('showFrom'), formData.get('tz')),
        showUntil: parseDateInput(formData.get('showUntil'), formData.get('tz')),
        translations: {
          create: { locale: profile.defaultLocale, title },
        },
      },
    });
    return true;
  });
  if (!added) redirect(await dash(uiLocale, '?error=blocksLimit'));
  redirect(await dash(uiLocale));
}

// datetime-local („стенен“ час) в зоната на браузъра → Date (или null при
// празно/невалидно). Без зона (няма JS) → UTC, не зоната на сървъра.
function parseDateInput(value: FormDataEntryValue | null, tz: FormDataEntryValue | null): Date | null {
  return zonedLocalToUtc(String(value ?? ''), String(tz ?? ''));
}

export async function deleteLinkAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const linkId = String(formData.get('linkId') ?? '');
  await prisma.link.deleteMany({
    where: { id: linkId, profile: { userId: user.id } },
  });
  redirect(await dash(uiLocale));
}

// ── Управление на блоковете: подреждане, скриване, редакция (таблото) ───────────────────

/** Подредените id-та на блоковете на профил на потребителя (null = чужд/няма профил). */
async function ownedLinkOrder(userId: string, profileId: string): Promise<string[] | null> {
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId },
    select: { links: { select: { id: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
  });
  return profile ? profile.links.map((link) => link.id) : null;
}

/** Записва реда като позиции 0..n-1 в една транзакция. */
async function writeOrder(profileId: string, ids: readonly string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.link.updateMany({ where: { id, profileId }, data: { position } }),
    ),
  );
}

/** Drag & drop от таблото: целият нов ред; приема се само точното множество блокове на профила. */
export async function reorderLinksAction(
  profileId: unknown,
  orderedIds: unknown,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || typeof profileId !== 'string' || !Array.isArray(orderedIds)) return { ok: false };
  const current = await ownedLinkOrder(user.id, profileId);
  if (!current) return { ok: false };
  const next = validReorder(current, orderedIds);
  if (!next) return { ok: false };
  await writeOrder(profileId, next);
  return { ok: true };
}

/** ↑/↓ без JavaScript и от клавиатура: мести блока с една позиция. */
export async function moveLinkAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const linkId = String(formData.get('linkId') ?? '');
  const dir = formData.get('dir') === 'up' ? 'up' : 'down';
  const link = await prisma.link.findFirst({
    where: { id: linkId, profile: { userId: user.id } },
    select: { profileId: true },
  });
  if (!link) redirect(await dash(uiLocale, '?error=generic'));
  const current = await ownedLinkOrder(user.id, link.profileId);
  const next = current ? moveInOrder(current, linkId, dir) : null;
  if (next) await writeOrder(link.profileId, next);
  redirect(await dash(uiLocale));
}

/** Автоматичният превод за посетителите на други езици — вкл./изкл. (по подразбиране вкл.). */
export async function setAutoTranslateAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const on = formData.get('value') === 'on';
  // Изричен избор на създателя — важи и за профил в „pending“ (възражение по
  // чл. 21 преди датата или съгласие за по-ранно включване).
  const { count } = await prisma.profile.updateMany({
    where: { id: profileId, userId: user.id },
    data: { autoTranslateMode: on ? 'on' : 'off', autoTranslateStartsAt: null },
  });
  if (count === 0) redirect(await dash(uiLocale, '?error=generic'));
  // Изключено → махаме и кеша: преведеното вече не се показва и не се пази.
  if (!on) await prisma.autoTranslation.deleteMany({ where: { profileId } });
  redirect(await dash(uiLocale));
}

/** Скрива/показва блока на публичния профил (active) — без да го трие. */
export async function toggleLinkActiveAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const linkId = String(formData.get('linkId') ?? '');
  const link = await prisma.link.findFirst({
    where: { id: linkId, profile: { userId: user.id } },
    select: { active: true },
  });
  if (!link) redirect(await dash(uiLocale, '?error=generic'));
  await prisma.link.updateMany({
    where: { id: linkId, profile: { userId: user.id } },
    data: { active: !link.active },
  });
  redirect(await dash(uiLocale));
}

/**
 * Редакция на съществуващ блок: заглавие (основният език на профила), целта и kind-специфичните
 * полета (същата валидация като при добавяне — parseBlockInput), насрочване. Видът не се сменя.
 */
export async function updateLinkAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const linkId = String(formData.get('linkId') ?? '');
  const link = await prisma.link.findFirst({
    where: { id: linkId, profile: { userId: user.id } },
    select: { kind: true, meta: true, profile: { select: { defaultLocale: true } } },
  });
  if (!link) redirect(await dash(uiLocale, '?error=generic'));
  const title = String(formData.get('title') ?? '').trim().slice(0, 100);
  const input = parseBlockInput({
    kind: link.kind,
    url: String(formData.get('url') ?? ''),
    extra1: String(formData.get('extra1') ?? ''),
    extra2: String(formData.get('extra2') ?? ''),
    color: String(formData.get('color') ?? ''),
    featured: formData.get('featured') === 'on',
    options: String(formData.get('options') ?? ''),
  });
  if (!input || !title) redirect(await dash(uiLocale, '?error=block'));
  const locale = link.profile.defaultLocale;
  // Гласовете са по индекс на опцията: при махната/разменена/преименувана опция
  // старите гласове биха се показали на чужда опция → трием ги в същата транзакция.
  const previousOptions = (link.meta as BlockMeta | null)?.options;
  const resetVotes =
    link.kind === 'POLL' &&
    !pollVotesStillValid(Array.isArray(previousOptions) ? previousOptions : [], input.meta?.options ?? []);
  await prisma.$transaction([
    ...(resetVotes ? [prisma.pollVote.deleteMany({ where: { linkId } })] : []),
    prisma.link.updateMany({
      where: { id: linkId, profile: { userId: user.id } },
      data: {
        url: input.url,
        meta: input.meta ? (input.meta as Prisma.InputJsonValue) : Prisma.DbNull,
        showFrom: parseDateInput(formData.get('showFrom'), formData.get('tz')),
        showUntil: parseDateInput(formData.get('showUntil'), formData.get('tz')),
      },
    }),
    prisma.linkTranslation.upsert({
      where: { linkId_locale: { linkId, locale } },
      create: { linkId, locale, title },
      update: { title },
    }),
  ]);
  redirect(await dash(uiLocale));
}

export async function upsertLinkTranslationAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const linkId = String(formData.get('linkId') ?? '');
  const locale = String(formData.get('locale') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 100);
  if (!isLocale(locale) || !(LOCALES as readonly string[]).includes(locale)) {
    redirect(await dash(uiLocale, '?error=generic'));
  }
  const link = await prisma.link.findFirst({
    where: { id: linkId, profile: { userId: user.id } },
    include: { profile: true },
  });
  if (!link) redirect(await dash(uiLocale, '?error=generic'));
  if (!title) {
    if (locale !== link.profile.defaultLocale) {
      await prisma.linkTranslation
        .delete({ where: { linkId_locale: { linkId, locale } } })
        .catch(() => undefined);
    }
    redirect(await dash(uiLocale));
  }
  await prisma.linkTranslation.upsert({
    where: { linkId_locale: { linkId, locale } },
    create: { linkId, locale, title },
    update: { title },
  });
  redirect(await dash(uiLocale));
}

/**
 * Проверка на собствения домейн: TXT `_linketto.<домейн>` трябва да носи
 * `linketto-verify=<токен>`. Едва тогава /d/<домейн> показва профила.
 */
export async function verifyDomainAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { id: true, customDomain: true, domainToken: true },
  });
  if (!profile?.customDomain || !profile.domainToken || !planFor(user.plan).customDomain) {
    redirect(await dash(uiLocale, '?error=domainVerify'));
  }
  if (!rateLimit(`domain-verify:${user.id}`, 10, 10 * 60_000)) {
    redirect(await dash(uiLocale, '?error=domainVerify'));
  }
  let records: string[][] = [];
  try {
    const resolver = new Resolver({ timeout: 5000, tries: 2 });
    records = await resolver.resolveTxt(domainTxtName(profile.customDomain));
  } catch {
    records = [];
  }
  if (!txtMatches(records, profile.domainToken)) {
    redirect(await dash(uiLocale, '?error=domainVerify'));
  }
  await prisma.profile.updateMany({
    where: { id: profile.id, userId: user.id, customDomain: profile.customDomain, domainToken: profile.domainToken },
    data: { domainVerifiedAt: new Date() },
  });
  redirect(await dash(uiLocale, '?domainVerified=1'));
}
