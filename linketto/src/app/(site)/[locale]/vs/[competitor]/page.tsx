import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ToolPage } from '@/components/ToolPage';
import { CheckIcon } from '@/components/icons';
import type { Locale } from '@/i18n/locales';
import { safeJsonLd } from '@/lib/jsonld';
import { pageMetadata, SITE_URL } from '@/lib/seo';
import {
  COMPARISONS_CHECKED_AT,
  COMPETITORS,
  isCompetitorId,
  type Cell,
} from '@/lib/comparisons';

// „Linketto срещу <конкурент>“ — само проверени факти с източник и дата
// (виж lib/comparisons.ts). Тон: факти, не омаловажаване.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; competitor: string }>;
}): Promise<Metadata> {
  const { locale, competitor } = await params;
  if (!isCompetitorId(competitor)) return {};
  const t = await getTranslations({ locale, namespace: 'vs' });
  const name = COMPETITORS[competitor].name;
  return pageMetadata(locale as Locale, `/vs/${competitor}`, {
    title: t('metaTitle', { name }),
    description: t('metaDescription', { name }),
    keywords: t('keywords', { name }).split(', '),
  });
}

export default async function VersusPage({
  params,
}: {
  params: Promise<{ locale: string; competitor: string }>;
}) {
  const { locale, competitor } = await params;
  if (!isCompetitorId(competitor)) notFound();
  const t = await getTranslations('vs');
  const data = COMPETITORS[competitor];
  const name = data.name;
  const checked = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
  }).format(new Date(`${COMPARISONS_CHECKED_AT}T12:00:00Z`));

  const cell = (value: Cell) => {
    switch (value.t) {
      case 'price':
        return t('cellPrice', { amount: value.amount, plan: value.plan });
      case 'percent':
        return t('cellPercent', { value: value.value, plan: value.plan });
      case 'days':
        return t('cellDays', { value: value.value, plan: value.plan });
      case 'yesFrom':
        return t('cellYesFrom', { amount: value.amount, plan: value.plan });
      case 'no':
        return t('cellNo');
      case 'freeOnly':
        return t('cellFreeOnly');
    }
  };

  const highlights = ['hl1', 'hl2', 'hl3', 'hl4'] as const;
  const others = Object.values(COMPETITORS).filter((c) => c.id !== competitor);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('title', { name }),
    url: `${SITE_URL}/${locale}/vs/${competitor}`,
    inLanguage: locale,
    dateModified: COMPARISONS_CHECKED_AT,
    publisher: { '@type': 'Organization', name: 'Carbon Stealth VCC' },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <SiteHeader locale={locale as Locale} />
      <ToolPage
        eyebrow={t('eyebrow')}
        title={t('title', { name })}
        intro={t('intro', { name })}
        cta={{
          title: t('ctaTitle'),
          text: t('ctaText', { name }),
          href: `/${locale}/register`,
          label: t('ctaButton'),
        }}
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{t('title', { name })}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-2/5 pb-3 text-start font-semibold text-slate-500">
                  {t('colFeature')}
                </th>
                <th scope="col" className="rounded-t-xl bg-linketto-50 px-4 pb-3 pt-3 text-start font-bold text-linketto-800">
                  Linketto
                </th>
                <th scope="col" className="px-4 pb-3 pt-3 text-start font-bold text-slate-700">
                  {name}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="border-t border-slate-100 py-3.5 pe-4 text-start font-medium text-slate-800">
                    {t(`row_${row.id}`)}
                    <sup className="ms-0.5 text-[10px] font-normal text-slate-400">
                      <a href={`#src-${row.source + 1}`}>[{row.source + 1}]</a>
                    </sup>
                  </th>
                  <td className="border-t border-linketto-100 bg-linketto-50 px-4 py-3.5 font-semibold text-slate-900">
                    {cell(row.us)}
                  </td>
                  <td className="border-t border-slate-100 px-4 py-3.5 text-slate-700">
                    {cell(row.them)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-xl font-bold tracking-tight text-slate-900">
          {t('highlightsTitle')}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {highlights.map((key) => (
            <li key={key} className="flex gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-700">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-linketto-600" />
              {t(key)}
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
          <p>{t('disclaimer', { name, date: checked })}</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5">
            {data.sources.map((source, index) => (
              <li key={source.url} id={`src-${index + 1}`}>
                <a
                  href={source.url}
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                  className="underline underline-offset-2 hover:text-slate-700"
                >
                  {source.label}
                </a>{' '}
                · {t('checkedOn', { date: checked })}
              </li>
            ))}
          </ol>
          <p className="mt-2">{t('currencyNote', { name })}</p>
          <p className="mt-2">{t('plansNote')}</p>
        </div>

        {others.length > 0 && (
          <p className="mt-6 text-sm text-slate-600">
            {t('alsoCompare')}{' '}
            {others.map((other, index) => (
              <span key={other.id}>
                {index > 0 && ', '}
                <a
                  href={`/${locale}/vs/${other.id}`}
                  className="font-semibold text-linketto-700 hover:underline"
                >
                  Linketto vs {other.name}
                </a>
              </span>
            ))}
          </p>
        )}
      </ToolPage>
      <SiteFooter locale={locale as Locale} currentPath={`/vs/${competitor}`} />
    </>
  );
}
