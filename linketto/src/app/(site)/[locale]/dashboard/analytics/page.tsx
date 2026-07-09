import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { planFor } from '@/lib/plans';
import {
  conversionRate,
  ctr,
  fillDailySeries,
  seriesMax,
  type DayRow,
} from '@/lib/analytics';
import { languageDemand } from '@/lib/language-gap';
import { ChevronLeftIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';

// Дневната поредица за графиката покрива последните 30 дни (четимо),
// а агрегатите — целия прозорец на плана.
const CHART_DAYS = 30;

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const t = await getTranslations('dashboard');

  const profile = await prisma.profile.findFirst({
    where: { userId: user.id },
    include: { translations: { select: { locale: true } }, links: true },
  });
  if (!profile) redirect(`/${locale}/dashboard`);

  const plan = planFor(user.plan);
  const now = new Date();
  const windowSince = plan.analyticsDays
    ? new Date(now.getTime() - plan.analyticsDays * 86_400_000)
    : undefined;
  const chartSince = new Date(now.getTime() - CHART_DAYS * 86_400_000);
  const where = {
    profileId: profile.id,
    ...(windowSince ? { createdAt: { gte: windowSince } } : {}),
  };

  const [
    views,
    clicks,
    byLink,
    byLocale,
    byCountry,
    byReferrer,
    dailyRaw,
    sales,
  ] = await Promise.all([
    prisma.clickEvent.count({ where: { ...where, linkId: null } }),
    prisma.clickEvent.count({ where: { ...where, linkId: { not: null } } }),
    prisma.clickEvent.groupBy({
      by: ['linkId'],
      where: { ...where, linkId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { linkId: 'desc' } },
      take: 15,
    }),
    prisma.clickEvent.groupBy({
      by: ['locale'],
      where: { ...where, locale: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { locale: 'desc' } },
      take: 15,
    }),
    prisma.clickEvent.groupBy({
      by: ['country'],
      where: { ...where, linkId: null, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
      take: 40,
    }),
    prisma.clickEvent.groupBy({
      by: ['referrerHost'],
      where: { ...where, linkId: null },
      _count: { _all: true },
      orderBy: { _count: { referrerHost: 'desc' } },
      take: 12,
    }),
    prisma.$queryRaw<{ day: Date; views: bigint; clicks: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
        count(*) FILTER (WHERE "linkId" IS NULL) AS views,
        count(*) FILTER (WHERE "linkId" IS NOT NULL) AS clicks
      FROM "ClickEvent"
      WHERE "profileId" = ${profile.id} AND "createdAt" >= ${chartSince}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.purchase.aggregate({
      where: { profileId: profile.id },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
  ]);

  const series = fillDailySeries(
    dailyRaw.map(
      (row): DayRow => ({
        day: row.day,
        views: Number(row.views),
        clicks: Number(row.clicks),
      }),
    ),
    CHART_DAYS,
    now,
  );
  const max = seriesMax(series) || 1;
  const gap = languageDemand(
    byCountry.map((row) => ({ country: row.country, count: row._count._all })),
    profile.translations.map((tr) => tr.locale),
  );
  const salesCount = sales._count._all;
  const revenueCents = sales._sum.amountCents ?? 0;

  const linkTitle = (linkId: string | null) => {
    const link = profile.links.find((item) => item.id === linkId);
    return link?.url ?? '—';
  };

  const StatTile = ({ value, label }: { value: string; label: string }) => (
    <div className="rounded-xl bg-slate-50 p-4 text-center">
      <p className="text-2xl font-extrabold text-linketto-700">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );

  const BarList = ({
    title,
    rows,
  }: {
    title: string;
    rows: { label: string; value: number }[];
  }) => {
    const listMax = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.length === 0 && <li className="text-slate-400">—</li>}
          {rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate" title={row.label}>
                {row.label}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-linketto-500"
                  style={{ width: `${Math.round((row.value / listMax) * 100)}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right font-semibold text-slate-600">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t('analyticsTitle')}</h1>
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-1 text-sm font-medium text-linketto-700 hover:underline"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {t('analyticsBack')}
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          {plan.analyticsDays
            ? t('statsWindow', { days: plan.analyticsDays })
            : t('statsWindowAll')}
        </p>

        {/* Ключови числа */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile value={String(views)} label={t('statsViews')} />
          <StatTile value={String(clicks)} label={t('statsClicks')} />
          <StatTile value={`${ctr(views, clicks)}%`} label={t('analyticsCtr')} />
          <StatTile
            value={`${conversionRate(views, salesCount)}%`}
            label={t('analyticsConversion')}
          />
        </section>

        {/* Тренд по дни */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">{t('analyticsTrend')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('analyticsLast30')}</p>
          <div className="mt-4 flex h-40 items-end gap-[3px]">
            {series.map((point) => (
              <div
                key={point.date}
                className="group relative flex flex-1 flex-col items-center justify-end gap-[2px]"
                title={`${point.date} · ${point.views} / ${point.clicks}`}
              >
                <span
                  className="w-full rounded-t bg-linketto-500"
                  style={{ height: `${(point.views / max) * 100}%` }}
                />
                <span
                  className="w-full rounded-t bg-linketto-200"
                  style={{ height: `${(point.clicks / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-linketto-500" />
              {t('statsViews')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-linketto-200" />
              {t('statsClicks')}
            </span>
          </div>
        </section>

        {/* Разбивки */}
        <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <BarList
            title={t('statsByLink')}
            rows={byLink.map((row) => ({
              label: linkTitle(row.linkId),
              value: row._count._all,
            }))}
          />
          <BarList
            title={t('analyticsByReferrer')}
            rows={byReferrer.map((row) => ({
              label: row.referrerHost ?? t('analyticsDirect'),
              value: row._count._all,
            }))}
          />
          <BarList
            title={t('statsByLocale')}
            rows={byLocale.map((row) => ({
              label: (row.locale ?? '—').toUpperCase(),
              value: row._count._all,
            }))}
          />
          <BarList
            title={t('statsByCountry')}
            rows={byCountry.slice(0, 15).map((row) => ({
              label: row.country ?? '—',
              value: row._count._all,
            }))}
          />
        </section>

        {/* Езикова дупка */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">{t('gapSection')}</h2>
          {gap.mappedVisitors === 0 ? (
            <p className="mt-2 text-sm text-slate-400">{t('gapNoData')}</p>
          ) : (
            <BarList
              title={t('analyticsByAudienceLang')}
              rows={gap.demand.map((row) => ({
                label: `${row.name}${row.hasTranslation ? '' : ' •'}`,
                value: row.visitors,
              }))}
            />
          )}
        </section>

        {/* Продажби */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">{t('analyticsSales')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile value={String(salesCount)} label={t('analyticsSales')} />
            <StatTile
              value={`€${(revenueCents / 100).toFixed(2)}`}
              label={t('analyticsRevenue')}
            />
            <StatTile
              value={`${conversionRate(views, salesCount)}%`}
              label={t('analyticsConversion')}
            />
          </div>
        </section>
      </main>
    </>
  );
}
