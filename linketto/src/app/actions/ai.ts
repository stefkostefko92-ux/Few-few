'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale, LOCALES } from '@/i18n/locales';
import { planFor } from '@/lib/plans';
import { aiConfigured, translateProfileContent } from '@/lib/ai';

// „Преведи профила с един клик“ — флагманът на Linketto. Превежда името,
// описанието и заглавията на блоковете на всички езици, които планът
// позволява, без да пипа вече попълнените ръчно версии.
export async function aiTranslateAction(formData: FormData): Promise<void> {
  const raw = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(raw) ? raw : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  if (!aiConfigured()) redirect(`/${uiLocale}/dashboard?error=aikey`);

  const profileId = String(formData.get('profileId') ?? '');
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: {
      translations: true,
      links: { include: { translations: true } },
    },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);

  const source =
    profile.translations.find((t) => t.locale === profile.defaultLocale) ??
    profile.translations[0];
  if (!source) redirect(`/${uiLocale}/dashboard?error=generic`);

  const existing = new Set(profile.translations.map((t) => t.locale));
  const plan = planFor(user.plan);
  const capacity =
    plan.maxLocales === null
      ? Infinity
      : Math.max(0, plan.maxLocales - existing.size);
  const targets = LOCALES.filter((locale) => !existing.has(locale)).slice(
    0,
    capacity === Infinity ? undefined : capacity,
  );
  if (targets.length === 0) redirect(`/${uiLocale}/dashboard?error=limit`);

  const sourceLinks = profile.links
    .map((link) => ({
      id: link.id,
      title:
        link.translations.find((t) => t.locale === profile.defaultLocale)
          ?.title ??
        link.translations[0]?.title ??
        '',
    }))
    .filter((link) => link.title);

  const translated = await translateProfileContent(
    { displayName: source.displayName, bio: source.bio, links: sourceLinks },
    profile.defaultLocale,
    targets,
  );
  if (!translated) redirect(`/${uiLocale}/dashboard?error=ai`);

  for (const [locale, entry] of Object.entries(translated)) {
    await prisma.profileTranslation.upsert({
      where: { profileId_locale: { profileId: profile.id, locale } },
      create: {
        profileId: profile.id,
        locale,
        displayName: entry.displayName,
        bio: entry.bio ?? null,
      },
      update: {},
    });
    for (const [linkId, title] of Object.entries(entry.links)) {
      if (!title || !profile.links.some((link) => link.id === linkId)) {
        continue;
      }
      await prisma.linkTranslation.upsert({
        where: { linkId_locale: { linkId, locale } },
        create: { linkId, locale, title: title.slice(0, 100) },
        update: {},
      });
    }
  }
  redirect(`/${uiLocale}/dashboard?translated=1`);
}
