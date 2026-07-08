import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { bestLocale, dirFor, LOCALE_NAMES } from '@/i18n/locales';

export const dynamic = 'force-dynamic';

const THEME_CLASSES: Record<string, string> = {
  aurora:
    'bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white',
  mono: 'bg-white text-slate-900',
  dusk: 'bg-gradient-to-b from-rose-950 via-slate-900 to-slate-950 text-white',
};

async function loadProfile(slug: string) {
  return prisma.profile.findUnique({
    where: { slug },
    include: {
      translations: true,
      links: {
        where: { active: true },
        orderBy: { position: 'asc' },
        include: { translations: true },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile || !profile.published) return { title: 'Millelink' };
  const fallback = profile.translations[0];
  const main =
    profile.translations.find((t) => t.locale === profile.defaultLocale) ??
    fallback;
  const languages: Record<string, string> = {};
  for (const translation of profile.translations) {
    languages[translation.locale] = `/u/${slug}?hl=${translation.locale}`;
  }
  return {
    title: main?.displayName ?? slug,
    description: main?.bio ?? undefined,
    alternates: { languages },
  };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hl?: string }>;
}) {
  const { slug } = await params;
  const { hl } = await searchParams;
  const profile = await loadProfile(slug);
  if (!profile || !profile.published || profile.translations.length === 0) {
    notFound();
  }

  const available = profile.translations.map((t) => t.locale);
  const requestHeaders = await headers();
  let viewLocale: string;
  if (hl && available.includes(hl)) {
    viewLocale = hl;
  } else {
    viewLocale = bestLocale(
      requestHeaders.get('accept-language'),
      available,
      available.includes(profile.defaultLocale)
        ? profile.defaultLocale
        : available[0],
    );
  }

  const translation =
    profile.translations.find((t) => t.locale === viewLocale) ??
    profile.translations[0];

  // Преглед на страницата — без бисквитки, без лични данни.
  await prisma.clickEvent
    .create({
      data: {
        profileId: profile.id,
        locale: viewLocale,
        referrerHost: hostOf(requestHeaders.get('referer')),
        country: requestHeaders.get('cf-ipcountry') ?? undefined,
      },
    })
    .catch(() => undefined);

  const themeClass = THEME_CLASSES[profile.theme] ?? THEME_CLASSES.aurora;
  const accent = profile.accent ?? '#3b82c4';

  return (
    <main
      lang={viewLocale}
      dir={dirFor(viewLocale)}
      className={`flex min-h-screen flex-col items-center px-6 py-16 ${themeClass}`}
    >
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">{translation.displayName}</h1>
        {translation.bio && (
          <p className="mt-2 opacity-80">{translation.bio}</p>
        )}

        {available.length > 1 && (
          <nav aria-label="Language" className="mt-4 flex justify-center gap-2">
            {available.map((loc) => (
              <a
                key={loc}
                href={`/u/${slug}?hl=${loc}`}
                className={`rounded-full px-3 py-1 text-xs ${
                  loc === viewLocale
                    ? 'bg-white/20 font-semibold'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                {LOCALE_NAMES[loc as keyof typeof LOCALE_NAMES] ?? loc}
              </a>
            ))}
          </nav>
        )}

        <ul className="mt-8 space-y-3">
          {profile.links.map((link) => {
            const linkTitle =
              link.translations.find((t) => t.locale === viewLocale) ??
              link.translations.find(
                (t) => t.locale === profile.defaultLocale,
              ) ??
              link.translations[0];
            if (!linkTitle) return null;
            return (
              <li key={link.id}>
                <a
                  href={`/u/${slug}/l/${link.id}?hl=${viewLocale}`}
                  className="block rounded-full border px-6 py-3 font-medium transition hover:scale-[1.02]"
                  style={{ borderColor: accent, backgroundColor: `${accent}22` }}
                >
                  {linkTitle.title}
                </a>
              </li>
            );
          })}
        </ul>

        <p className="mt-12 text-xs opacity-50">
          <Link href="/" className="hover:underline">
            Millelink
          </Link>
        </p>
      </div>
    </main>
  );
}

function hostOf(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).host;
  } catch {
    return undefined;
  }
}
