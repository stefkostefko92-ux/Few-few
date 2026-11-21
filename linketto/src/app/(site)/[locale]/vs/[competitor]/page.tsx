import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ToolPage } from '@/components/ToolPage';
import { CheckIcon } from '@/components/icons';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
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
      case 'days':
        return t('cellDays', { value: value.value, plan: value.plan });
      case 'yesFrom':
        return t('cellYesFrom', { amount: value.amount, plan: value.plan });
      case 'no':
        return t('cellNo');
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
        <Table className="min-w-[34rem]">
          <caption className="sr-only">{t('title', { name })}</caption>
          <THead>
            <tr>
              <TH className="w-2/5">{t('colFeature')}</TH>
              <TH className="bg-accent-soft text-accent-soft-fg">Linketto</TH>
              <TH>{name}</TH>
            </tr>
          </THead>
          <TBody>
            {data.rows.map((row) => (
              <TR key={row.id}>
                <TH scope="row" className="font-medium text-fg">
                  {t(`row_${row.id}`)}
                  <sup className="ms-0.5 text-micro font-normal">
                    <a
                      href={`#src-${row.source + 1}`}
                      className="focus-ring rounded-sm text-accent-text hover:underline"
                    >
                      [{row.source + 1}]
                    </a>
                  </sup>
                </TH>
                <TD className="bg-accent-soft/50 font-semibold text-fg">
                  {cell(row.us)}
                </TD>
                <TD>{cell(row.them)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <h2 className="mt-12 text-heading text-fg">
          {t('highlightsTitle')}
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {highlights.map((key) => (
            <li key={key} className="flex gap-3 rounded-card border border-line bg-surface p-4 text-body text-fg-2">
              <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-accent-text" />
              {t(key)}
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-card border border-line bg-surface-2 p-5 text-small text-fg-muted">
          <p>{t('disclaimer', { name, date: checked })}</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5">
            {data.sources.map((source, index) => (
              <li key={source.url} id={`src-${index + 1}`}>
                <a
                  href={source.url}
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                  className="focus-ring rounded-sm underline underline-offset-2 hover:text-fg"
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
          <p className="mt-6 text-body text-fg-muted">
            {t('alsoCompare')}{' '}
            {others.map((other, index) => (
              <span key={other.id}>
                {index > 0 && ', '}
                <a
                  href={`/${locale}/vs/${other.id}`}
                  className="focus-ring rounded-sm font-semibold text-accent-text hover:underline"
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
