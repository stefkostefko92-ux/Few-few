import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { LOCALE_TAG, type Locale, type Translator } from '../i18n.js';
import type { PriceRow } from '../plans/pricing.js';

/**
 * JSON-LD за публичните страници. Текстовете идват от същите преводи, които страницата показва —
 * въпросите и отговорите в FAQPage са дума по дума тези от екрана, както изискват търсачките.
 */
export const FAQ_IDS = [
  'price',
  'afterTrial',
  'install',
  'machines',
  'hardware',
  'languages',
  'twofa',
  'data',
  'delete',
] as const;

/** Вграждане в <script type="application/ld+json">: `<` не може да затвори блока. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Сума в центове като десетичен низ за schema.org — без float. */
function decimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function organization(t: Translator) {
  return {
    '@type': 'Organization',
    '@id': `${COMPANY.url}/#org`,
    name: COMPANY.name,
    url: COMPANY.url,
    email: config().CONTACT_EMAIL,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: config().CONTACT_EMAIL,
      availableLanguage: ['bg', 'en', 'it'],
    },
    taxID: COMPANY.eik,
    vatID: COMPANY.vat,
    address: {
      '@type': 'PostalAddress',
      streetAddress: t('company.street'),
      addressLocality: t('company.city'),
      addressRegion: t('company.region'),
      postalCode: COMPANY.postalCode,
      addressCountry: COMPANY.country,
    },
  };
}

function website(base: string) {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: `${base}/`,
    name: 'Rendetto',
    inLanguage: ['bg', 'en', 'it'],
    publisher: { '@id': `${COMPANY.url}/#org` },
  };
}

function offers(t: Translator, prices: PriceRow[], url: string) {
  return prices.map((row) => ({
    '@type': 'Offer',
    url,
    name:
      row.id === 'lifetime'
        ? t('landing.price.lifetime')
        : t('landing.price.months', { n: row.months ?? 0 }),
    price: decimal(row.totalCents),
    priceCurrency: 'EUR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: decimal(row.totalCents),
      priceCurrency: 'EUR',
      valueAddedTaxIncluded: false,
      ...(row.months
        ? {
            referenceQuantity: { '@type': 'QuantitativeValue', value: row.months, unitCode: 'MON' },
          }
        : {}),
    },
    availability: 'https://schema.org/InStock',
  }));
}

export function landingStructuredData(
  locale: Locale,
  t: Translator,
  canonical: string,
  prices: PriceRow[],
): string {
  const base = config().PUBLIC_BASE_URL;
  const graph = [
    organization(t),
    website(base),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#page`,
      url: canonical,
      name: t('landing.meta.title'),
      description: t('landing.meta.description'),
      inLanguage: LOCALE_TAG[locale],
      isPartOf: { '@id': `${base}/#website` },
      about: { '@id': `${base}/#app` },
      dateModified: CONTENT_UPDATED,
      breadcrumb: { '@id': `${canonical}#breadcrumb` },
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.lead', '.trial-statement'] },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Rendetto', item: canonical }],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${base}/#app`,
      name: 'Rendetto',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web',
      browserRequirements: t('landing.meta.browser'),
      url: canonical,
      description: t('landing.meta.description'),
      inLanguage: ['bg', 'en', 'it'],
      publisher: { '@id': `${COMPANY.url}/#org` },
      featureList: [1, 2, 3, 4].map((n) => t(`landing.how.s${n}.title`)),
      offers: offers(t, prices, `${canonical}#prices`),
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: FAQ_IDS.map((id) => ({
        '@type': 'Question',
        name: t(`landing.faq.${id}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`landing.faq.${id}.a`) },
      })),
    },
  ];
  return jsonLdScript({ '@context': 'https://schema.org', '@graph': graph });
}

export function legalStructuredData(
  locale: Locale,
  t: Translator,
  canonical: string,
  title: string,
  updated: string,
): string {
  const base = config().PUBLIC_BASE_URL;
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: title,
        inLanguage: LOCALE_TAG[locale],
        isPartOf: { '@id': `${base}/#website` },
        dateModified: updated,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Rendetto',
            item: `${base}${locale === 'bg' ? '/' : `/${locale}/`}`,
          },
          { '@type': 'ListItem', position: 2, name: title, item: canonical },
        ],
      },
    ],
  });
}
