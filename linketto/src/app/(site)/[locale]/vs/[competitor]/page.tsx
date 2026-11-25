import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { ToolPage } from '@/components/ToolPage';
import { CheckIcon } from '@/components/icons';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { Locale } from '@/i18n/locales';
import { safeJsonLd } from '@/lib/jsonld';
import { ORG, pageMetadata, SITE_URL } from '@/lib/seo';
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

  // „Отговор отпред“ (AI/търсачки цитират първите изречения): фактите идват от същите
  // редове като таблицата — нищо не се пише отделно.
  const summary = data.rows
    .map((row) =>
      t('summaryRow', { feature: t(`row_${row.id}`), us: cell(row.us), name, them: cell(row.them) }),
    )
    .join(' ');

  const pageUrl = `${SITE_URL}/${locale}/vs/${competitor}`;
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      name: t('title', { name }),
      description: `${t('summaryLead', { date: checked })} ${summary}`,
      url: pageUrl,
      inLanguage: locale,
      dateModified: COMPARISONS_CHECKED_AT,
      isPartOf: { '@id': `${SITE_URL}#website` },
      publisher: { '@id': `${ORG.url}#org` },
      about: [
        { '@type': 'SoftwareApplication', name: 'Linketto', url: SITE_URL },
        { '@type': 'SoftwareApplication', name, url: data.sources[0]?.url },
      ],
      citation: data.sources.map((source) => source.url),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Linketto', item: `${SITE_URL}/${locale}` },
        { '@type': 'ListItem', position: 2, name: t('title', { name }), item: pageUrl },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <LxPage locale={locale as Locale} currentPath={`/vs/${competitor}`}>
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
        <p className="mb-5 text-body text-fg-2">
          <strong className="font-semibold text-fg">{t('summaryLead', { date: checked })}</strong> {summary}
        </p>
        {/* Телефон: карти ред по ред (таблицата не се събира в 390 px — визуалният обход). */}
        <ul className="space-y-3 sm:hidden">
          {data.rows.map((row) => (
            <li key={row.id} className="rounded-card border border-line bg-surface p-4">
              <p className="font-medium text-fg">
                {t(`row_${row.id}`)}
                <sup className="ms-0.5 text-micro font-normal">
                  <a href={`#src-${row.source + 1}`} className="focus-ring rounded-sm text-accent-text hover:underline">
                    [{row.source + 1}]
                  </a>
                </sup>
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-small">
                <div className="rounded-control bg-accent-soft p-3">
                  <dt className="text-micro font-semibold text-accent-soft-fg">Linketto</dt>
                  <dd className="mt-1 font-semibold text-fg">{cell(row.us)}</dd>
                </div>
                <div className="rounded-control bg-surface-2 p-3">
                  <dt className="text-micro font-semibold text-fg-muted">{name}</dt>
                  <dd className="mt-1 text-fg-2">{cell(row.them)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <Table className="min-w-[34rem]" wrapperClassName="hidden sm:block">
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

        <div className="mt-10 rounded-card border border-line bg-surface-2 p-5 text-body leading-relaxed text-fg-2">
          <p>{t('disclaimer', { name, date: checked })}</p>
          <ol className="mt-3 list-decimal space-y-1 ps-6 text-small">
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
      </LxPage>
    </>
  );
}
