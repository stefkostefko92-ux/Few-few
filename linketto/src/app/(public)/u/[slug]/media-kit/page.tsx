import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { localeFromGeo, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { parseStyle } from '@/lib/style';
import { languageDemand } from '@/lib/language-gap';
import { ctr } from '@/lib/analytics';
import { mediaKitStrings } from '@/lib/mediakit';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

// Медиа китът е частен документ за брандове — не се индексира.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const WINDOW_DAYS = 30;

export default async function MediaKitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hl?: string }>;
}) {
  const { slug } = await params;
  const { hl } = await searchParams;

  const profile = await prisma.profile.findFirst({
    where: { slug, published: true, bannedAt: null },
    include: { translations: true },
  });
  if (!profile || profile.translations.length === 0) notFound();
  const style = parseStyle(profile.style);
  if (!style.mediaKit) notFound(); // включва се от създателя

  const available = profile.translations.map((t) => t.locale);
  const requestHeaders = await headers();
  const viewLocale =
    hl && available.includes(hl)
      ? hl
      : localeFromGeo({
          country: requestHeaders.get('cf-ipcountry'),
          acceptLanguage: requestHeaders.get('accept-language'),
          available,
          fallback: available.includes(profile.defaultLocale)
            ? profile.defaultLocale
            : available[0],
        });
  const s = mediaKitStrings(viewLocale);
  const tr =
    profile.translations.find((t) => t.locale === viewLocale) ??
    profile.translations.find((t) => t.locale === profile.defaultLocale) ??
    profile.translations[0];

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const where = { profileId: profile.id, createdAt: { gte: since } };
  const [views, clicks, byCountry] = await Promise.all([
    prisma.clickEvent.count({ where: { ...where, linkId: null } }),
    prisma.clickEvent.count({ where: { ...where, linkId: { not: null } } }),
    prisma.clickEvent.groupBy({
      by: ['country'],
      where: { ...where, linkId: null, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
      take: 40,
    }),
  ]);
  const gap = languageDemand(
    byCountry.map((row) => ({ country: row.country, count: row._count._all })),
    available,
  );

  const avatarUrl = style.avatarUrl;
  const Bar = ({ label, value, max }: { label: string; value: number; max: number }) => (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 truncate">{label}</span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-linketto-500"
          style={{ width: `${Math.round((value / (max || 1)) * 100)}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right font-semibold text-slate-600">
        {value}
      </span>
    </li>
  );
  const langMax = gap.demand.reduce((m, d) => Math.max(m, d.visitors), 0);
  const countryMax = byCountry.reduce((m, c) => Math.max(m, c._count._all), 0);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 print:py-0">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="flex items-center gap-4">
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- аватар URL/media, вън от next/image
            <img
              src={avatarUrl}
              alt=""
              width={72}
              height={72}
              className="h-18 w-18 rounded-full object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-slate-400">
              {s.title}
            </p>
            <h1 className="truncate text-2xl font-bold text-slate-900">
              {tr.displayName}
            </h1>
            <p className="text-sm text-slate-500">
              @{slug} · {s.subtitle}
            </p>
          </div>
        </header>
        {tr.bio && (
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
            {tr.bio}
          </p>
        )}

        {/* Езици, на които създателят говори с аудиторията (наше предимство) */}
        <p className="mt-4 text-sm text-slate-500">
          <span className="font-semibold text-slate-700">
            {s.languagesSpoken}:
          </span>{' '}
          {available
            .map((loc) => LOCALE_NAMES[loc as Locale] ?? loc)
            .join(' · ')}
        </p>

        {/* Ключови числа */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { v: String(views), l: s.views30 },
            { v: String(clicks), l: s.clicks30 },
            { v: `${ctr(views, clicks)}%`, l: s.ctr },
          ].map((tile) => (
            <div key={tile.l} className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-linketto-700">{tile.v}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{tile.l}</p>
            </div>
          ))}
        </div>

        {views === 0 ? (
          <p className="mt-6 text-sm text-slate-400">{s.noData}</p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {/* Аудитория по език — водещото предимство */}
            <div>
              <h2 className="text-sm font-semibold text-slate-600">
                {s.audienceLangs}
              </h2>
              <ul className="mt-2 space-y-2">
                {gap.demand.slice(0, 6).map((d) => (
                  <Bar
                    key={d.locale}
                    label={d.name}
                    value={d.visitors}
                    max={langMax}
                  />
                ))}
                {gap.demand.length === 0 && (
                  <li className="text-sm text-slate-400">—</li>
                )}
              </ul>
            </div>
            {/* Топ държави */}
            <div>
              <h2 className="text-sm font-semibold text-slate-600">
                {s.topCountries}
              </h2>
              <ul className="mt-2 space-y-2">
                {byCountry.slice(0, 6).map((c) => (
                  <Bar
                    key={c.country ?? '-'}
                    label={c.country ?? '—'}
                    value={c._count._all}
                    max={countryMax}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] text-slate-400">{s.window}</p>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 print:hidden">
          <span className="text-xs text-slate-400">{s.poweredBy}</span>
          <PrintButton label={s.print} />
        </div>
      </div>
    </main>
  );
}
