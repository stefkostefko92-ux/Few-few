import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashShell } from '@/components/DashShell';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { planFor } from '@/lib/plans';
import {
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { locale } = await params;
  const { p } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const t = await getTranslations('dashboard');

  // Активният профил следва ?p (както дашбордът) — за акаунти с няколко профила.
  const profile = await prisma.profile.findFirst({
    where: { userId: user.id, ...(p ? { id: p } : {}) },
    orderBy: { createdAt: 'asc' },
    include: { translations: { select: { locale: true } }, links: true },
  });
  if (!profile) redirect(`/${locale}/dashboard`);

  const plan = planFor(user.plan);
  const profileList = await prisma.profile.findMany({
    where: { userId: user.id },
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
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
    byProduct,
  ] = await Promise.all([
    prisma.clickEvent.count({ where: { ...where, linkId: null, productId: null } }),
    prisma.clickEvent.count({ where: { ...where, OR: [{ linkId: { not: null } }, { productId: { not: null } }] } }),
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
      where: { ...where, linkId: null, productId: null, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
      take: 40,
    }),
    prisma.clickEvent.groupBy({
      by: ['referrerHost'],
      where: { ...where, linkId: null, productId: null },
      _count: { _all: true },
      orderBy: { _count: { referrerHost: 'desc' } },
      take: 12,
    }),
    prisma.$queryRaw<{ day: Date; views: bigint; clicks: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
        count(*) FILTER (WHERE "linkId" IS NULL AND "productId" IS NULL) AS views,
        count(*) FILTER (WHERE "linkId" IS NOT NULL OR "productId" IS NOT NULL) AS clicks
      FROM "ClickEvent"
      WHERE "profileId" = ${profile.id} AND "createdAt" >= ${chartSince}
      GROUP BY 1 ORDER BY 1
    `,
    // Продуктите водят към линка за плащане на създателя (решение О-1) —
    // продажбите не минават през нас, затова мерим интереса: кликове по продукт.
    prisma.clickEvent.groupBy({
      by: ['productId'],
      where: { ...where, productId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 15,
    }),
  ]);
  const productTitles = await prisma.productTranslation.findMany({
    where: { product: { profileId: profile.id } },
    select: { productId: true, locale: true, title: true },
  });

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
  const hasTraffic = series.some((point) => point.views > 0 || point.clicks > 0);
  // Датите по езика на таблото (не ISO) — визуалният обход.
  const dayLabel = (iso: string | undefined) =>
    iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '';
  const gap = languageDemand(
    byCountry.map((row) => ({ country: row.country, count: row._count._all })),
    profile.translations.map((tr) => tr.locale),
  );
  const productClicks = byProduct.reduce((sum, row) => sum + row._count._all, 0);
  const productTitle = (productId: string | null) => {
    const titles = productTitles.filter((tr) => tr.productId === productId);
    return (
      titles.find((tr) => tr.locale === locale)?.title ??
      titles[0]?.title ??
      '—'
    );
  };

  const linkTitle = (linkId: string | null) => {
    const link = profile.links.find((item) => item.id === linkId);
    return link?.url ? link.url.replace(/^https?:\/\/(www\.)?/, '') : '—';
  };

  const StatTile = ({ value, label }: { value: string; label: string }) => (
    <Card padding="sm" className="text-center">
      <p className="text-heading tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-small text-fg-muted">{label}</p>
    </Card>
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
        <h3 className="text-small font-semibold text-fg-2">{title}</h3>
        <ul className="mt-2 space-y-1.5 text-small">
          {rows.length === 0 && <li className="text-fg-muted">—</li>}
          {rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-fg-2 sm:w-32" title={row.label}>
                {row.label}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span
                  className="absolute inset-y-0 start-0 rounded-full bg-accent"
                  style={{ width: `${Math.round((row.value / listMax) * 100)}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-end font-semibold tabular-nums text-fg">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const sectionClass = 'dash-card';

  return (
    <DashShell
      locale={locale as Locale}
      page="analytics"
      profiles={profileList}
      activeId={profile.id}
      planId={plan.id}
    >
      <PageHeader
        title={t('analyticsTitle')}
        description={
          <>
            {t('analyticsIntro')}{' '}
            {plan.analyticsDays
              ? t('statsWindow', { days: plan.analyticsDays })
              : t('statsWindowAll')}
          </>
        }
        actions={
          <ButtonLink
            href={`/${locale}/dashboard${profileList[0]?.id === profile.id ? '' : `?p=${profile.id}`}#stats`}
            variant="secondary"
            size="sm"
            className="gap-1.5"
          >
            <ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" />
            {t('analyticsBack')}
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        {/* Ключови числа */}
        <section aria-label={t('statsSection')} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile value={String(views)} label={t('statsViews')} />
          <StatTile value={String(clicks)} label={t('statsClicks')} />
          <StatTile value={`${ctr(views, clicks)}%`} label={t('analyticsCtr')} />
          <StatTile value={String(productClicks)} label={t('analyticsProductClicks')} />
        </section>

        {/* Тренд по дни */}
        <Card as="section" className={sectionClass}>
          <CardHeader title={t('analyticsTrend')} description={t('analyticsLast30')} />
          {!hasTraffic && (
            <p className="mt-4 rounded-control border border-dashed border-line p-3 text-small text-fg-muted">
              {t('analyticsNoTraffic')}
            </p>
          )}
          <div className="mt-5 flex gap-3">
            <div
              aria-hidden
              className="flex h-44 flex-col justify-between text-end text-micro tabular-nums text-fg-muted"
            >
              <span>{max}</span>
              <span>0</span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="flex h-44 items-end gap-[3px] border-b border-line-input"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to top, transparent 0, transparent calc(25% - 1px), rgb(var(--c-line)) calc(25% - 1px), rgb(var(--c-line)) 25%)',
                }}
              >
                {series.map((point) => (
                  <div
                    key={point.date}
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-t transition-colors hover:bg-fg/[0.06]"
                    title={`${point.date} · ${point.views} / ${point.clicks}`}
                  >
                    <span
                      className="w-1/2 rounded-t-[3px] bg-accent"
                      style={{
                        height: `${point.views > 0 ? Math.max(2, (point.views / max) * 100) : 0}%`,
                      }}
                    />
                    <span
                      className="w-1/2 rounded-t-[3px] bg-chart2"
                      style={{
                        height: `${point.clicks > 0 ? Math.max(2, (point.clicks / max) * 100) : 0}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div
                aria-hidden
                className="mt-1.5 flex justify-between text-micro tabular-nums text-fg-muted"
              >
                <span>{dayLabel(series[0]?.date)}</span>
                <span>{dayLabel(series[series.length - 1]?.date)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-4 text-small text-fg-2">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent" />
              {t('statsViews')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-chart2" />
              {t('statsClicks')}
            </span>
          </div>
        </Card>

        {/* Разбивки */}
        <Card as="section" className={`${sectionClass} grid gap-8 sm:grid-cols-2`}>
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
        </Card>

        {/* Езикова дупка */}
        <Card as="section" className={sectionClass}>
          <CardHeader title={t('gapSection')} />
          {gap.mappedVisitors === 0 ? (
            <p className="mt-2 text-small text-fg-muted">{t('gapNoData')}</p>
          ) : (
            <div className="mt-4">
              <BarList
                title={t('analyticsByAudienceLang')}
                rows={gap.demand.map((row) => ({
                  label: `${row.name}${row.hasTranslation ? '' : ' •'}`,
                  value: row.visitors,
                }))}
              />
            </div>
          )}
        </Card>

        {/* Интерес към продуктите (кликове към линка за плащане) */}
        <Card as="section" className={sectionClass}>
          <CardHeader title={t('analyticsProducts')} />
          {byProduct.length === 0 ? (
            <p className="mt-2 text-small text-fg-muted">{t('analyticsNoProductClicks')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-small">
              {byProduct.map((row) => (
                <li key={row.productId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-fg-2">{productTitle(row.productId)}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-fg">
                    {row._count._all} · {ctr(views, row._count._all)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashShell>
  );
}
