'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isValidSlug, normalizeSlug } from '@/lib/slug';
import { isLocale, LOCALES } from '@/i18n/locales';
import { planFor } from '@/lib/plans';
import { parseBlockInput } from '@/lib/blocks';
import { styleSchema } from '@/lib/style';
import type { Prisma } from '@prisma/client';

const THEMES = ['aurora', 'mono', 'dusk'] as const;

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
    redirect(`/${uiLocale}/dashboard?error=slug`);
  }
  const existing = await prisma.profile.findUnique({ where: { slug } });
  if (existing) {
    redirect(`/${uiLocale}/dashboard?error=slug`);
  }
  await prisma.profile.create({
    data: {
      userId: user.id,
      slug,
      defaultLocale: user.locale,
      translations: {
        create: { locale: user.locale, displayName },
      },
    },
  });
  redirect(`/${uiLocale}/dashboard`);
}

const settingsSchema = z.object({
  theme: z.enum(THEMES),
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
    redirect(`/${uiLocale}/dashboard?error=generic`);
  }

  // Собствен домейн — само за платени планове.
  const rawDomain = String(formData.get('customDomain') ?? '')
    .trim()
    .toLowerCase();
  const customDomain = rawDomain === '' ? null : rawDomain;
  if (customDomain) {
    if (planFor(user.plan).id === 'FREE') {
      redirect(`/${uiLocale}/dashboard?error=limit`);
    }
    if (!DOMAIN_RE.test(customDomain) || customDomain.length > 253) {
      redirect(`/${uiLocale}/dashboard?error=domain`);
    }
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
      },
    });
    if (count === 0) redirect(`/${uiLocale}/dashboard?error=generic`);
  } catch (error) {
    // P2002 = зает домейн (unique)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      redirect(`/${uiLocale}/dashboard?error=domain`);
    }
    throw error;
  }
  redirect(`/${uiLocale}/dashboard`);
}

// Стиловият енджин: всичко от секцията „Персонализация“ минава оттук.
export async function updateStyleAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');

  const field = (name: string) => {
    const value = String(formData.get(name) ?? '').trim();
    return value === '' ? undefined : value;
  };
  const parsed = styleSchema.safeParse({
    bgStyle: field('bgStyle'),
    bgColor1: field('bgColor1'),
    bgColor2: field('bgColor2'),
    bgImageUrl: field('bgImageUrl'),
    textColor: field('textColor'),
    font: field('font'),
    buttonShape: field('buttonShape'),
    buttonFill: field('buttonFill'),
    buttonShadow: field('buttonShadow'),
    layout: field('layout'),
    align: field('align'),
    avatarUrl: field('avatarUrl'),
    avatarShape: field('avatarShape'),
    hideBadge: formData.get('hideBadge') === 'on',
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/dashboard?error=style`);
  }
  // Скриването на Linketto баджа е привилегия на платените планове.
  if (parsed.data.hideBadge && planFor(user.plan).id === 'FREE') {
    redirect(`/${uiLocale}/dashboard?error=limit`);
  }
  const { count } = await prisma.profile.updateMany({
    where: { id: profileId, userId: user.id },
    data: { style: parsed.data },
  });
  if (count === 0) redirect(`/${uiLocale}/dashboard?error=generic`);
  redirect(`/${uiLocale}/dashboard`);
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
  if (!isLocale(locale)) redirect(`/${uiLocale}/dashboard?error=generic`);

  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { translations: true },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);

  const hasIt = profile.translations.some((t) => t.locale === locale);
  if (!displayName) {
    // Празно име = изтриване на езиковата версия (без основния език).
    if (hasIt && locale !== profile.defaultLocale) {
      await prisma.profileTranslation.delete({
        where: { profileId_locale: { profileId, locale } },
      });
    }
    redirect(`/${uiLocale}/dashboard`);
  }

  // Лимит на плана: Free = 2 езикови версии.
  const plan = planFor(user.plan);
  if (
    !hasIt &&
    plan.maxLocales !== null &&
    profile.translations.length >= plan.maxLocales
  ) {
    redirect(`/${uiLocale}/dashboard?error=limit`);
  }

  await prisma.profileTranslation.upsert({
    where: { profileId_locale: { profileId, locale } },
    create: { profileId, locale, displayName, bio },
    update: { displayName, bio },
  });
  redirect(`/${uiLocale}/dashboard`);
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
  });
  if (!input || !title) {
    redirect(`/${uiLocale}/dashboard?error=block`);
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { _count: { select: { links: true } } },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);
  await prisma.link.create({
    data: {
      profileId,
      kind: input.kind,
      url: input.url,
      meta: input.meta ? (input.meta as Prisma.InputJsonValue) : undefined,
      position: profile._count.links,
      showFrom: parseDateInput(formData.get('showFrom')),
      showUntil: parseDateInput(formData.get('showUntil')),
      translations: {
        create: { locale: profile.defaultLocale, title },
      },
    },
  });
  redirect(`/${uiLocale}/dashboard`);
}

// datetime-local → Date (или null при празно/невалидно)
function parseDateInput(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function deleteLinkAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await requireUser(uiLocale);
  const linkId = String(formData.get('linkId') ?? '');
  await prisma.link.deleteMany({
    where: { id: linkId, profile: { userId: user.id } },
  });
  redirect(`/${uiLocale}/dashboard`);
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
    redirect(`/${uiLocale}/dashboard?error=generic`);
  }
  const link = await prisma.link.findFirst({
    where: { id: linkId, profile: { userId: user.id } },
    include: { profile: true },
  });
  if (!link) redirect(`/${uiLocale}/dashboard?error=generic`);
  if (!title) {
    if (locale !== link.profile.defaultLocale) {
      await prisma.linkTranslation
        .delete({ where: { linkId_locale: { linkId, locale } } })
        .catch(() => undefined);
    }
    redirect(`/${uiLocale}/dashboard`);
  }
  await prisma.linkTranslation.upsert({
    where: { linkId_locale: { linkId, locale } },
    create: { linkId, locale, title },
    update: { title },
  });
  redirect(`/${uiLocale}/dashboard`);
}
