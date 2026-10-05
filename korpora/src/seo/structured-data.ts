import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { jsonForScript } from '../http/json-script.js';
import { LOCALE_TAG, type Locale, type Translator } from '../i18n.js';
import { TRIAL_DAYS } from '../plans/plan.js';
import { formatMoney, lifetimeRuleParams, priceTable, type PriceRow } from '../plans/pricing.js';
import { PATHS } from './paths.js';

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

export type FaqId = (typeof FAQ_IDS)[number];

/** Стъпките в „Как работи“ (`landing.how.s1…s4`) — витрината и HowTo ги вземат оттук. */
export const HOW_STEPS = [1, 2, 3, 4] as const;

/**
 * Числата в текстовете на витрината — от ценоразписа и срока на теста, не написани на ръка. Едни и
 * същи за страницата и за JSON-LD, затова отговорът в FAQPage е дума по дума този от екрана.
 */
export function landingTextParams(locale: Locale, prices: PriceRow[]) {
  const row = (id: string): PriceRow => {
    const found = prices.find((p) => p.id === id);
    if (!found) throw new Error(`няма ред ${id} в ценоразписа`);
    return found;
  };
  const money = (cents: number) => formatMoney(cents, locale);
  const or = new Intl.ListFormat(LOCALE_TAG[locale], { type: 'disjunction' });
  const terms = prices.filter((p) => p.discountPercent > 0);
  const percent = (n: number) => (locale === 'bg' ? `${n}\u00a0%` : `${n}%`);
  const faq: Partial<Record<FaqId, Record<string, string>>> = {
    price: {
      month: money(row('m1').totalWithVatCents),
      monthNet: money(row('m1').totalCents),
      terms: or.format(terms.map((p) => String(p.months))),
      discounts: or.format(terms.map((p) => percent(p.discountPercent))),
      life: money(row('lifetime').totalWithVatCents),
      lifeNet: money(row('lifetime').totalCents),
    },
  };
  return { description: { days: TRIAL_DAYS }, lifetime: lifetimeRuleParams(locale), faq };
}

/** Сума в центове като десетичен низ за schema.org — без float. */
function decimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Фирмата — един възел и за Organization, и за LocalBusiness (едно `@id`, без раздвояване на субекта).
 * Работно време няма, защото фирмата не е обявила такова; `geo` е същото като в geo мета таговете, а
 * ценовият диапазон идва от ценоразписа (от месечния план до Lifetime, с ДДС).
 */
function organization(t: Translator, locale: Locale) {
  const gross = priceTable().map((row) => row.totalWithVatCents);
  return {
    '@type': ['Organization', 'LocalBusiness'],
    '@id': `${COMPANY.url}/#org`,
    name: COMPANY.name,
    legalName: COMPANY.name,
    alternateName: COMPANY.nameBg,
    url: COMPANY.url,
    email: config().CONTACT_EMAIL,
    telephone: COMPANY.phone,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: config().CONTACT_EMAIL,
      telephone: COMPANY.phone,
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
    geo: {
      '@type': 'GeoCoordinates',
      latitude: COMPANY.geo.latitude,
      longitude: COMPANY.geo.longitude,
    },
    areaServed: { '@type': 'Place', name: t('company.areaServed') },
    priceRange: `${formatMoney(Math.min(...gross), locale)} – ${formatMoney(Math.max(...gross), locale)}`,
  };
}

function website(base: string) {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: `${base}/`,
    name: 'Korpora',
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
    price: decimal(row.totalWithVatCents),
    priceCurrency: 'EUR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: decimal(row.totalWithVatCents),
      priceCurrency: 'EUR',
      valueAddedTaxIncluded: true,
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
  const params = landingTextParams(locale, prices);
  const graph = [
    organization(t, locale),
    website(base),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#page`,
      url: canonical,
      name: t('landing.meta.title'),
      description: t('landing.meta.description', params.description),
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
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Korpora', item: canonical }],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${base}/#app`,
      name: 'Korpora',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web',
      browserRequirements: t('landing.meta.browser'),
      url: canonical,
      description: t('landing.meta.description', params.description),
      inLanguage: ['bg', 'en', 'it'],
      publisher: { '@id': `${COMPANY.url}/#org` },
      featureList: HOW_STEPS.map((n) => t(`landing.how.s${n}.title`)),
      offers: offers(t, prices, `${canonical}#prices`),
    },
    {
      // стъпките от „Как работи“ дума по дума, всяка със своята котва на страницата
      '@type': 'HowTo',
      '@id': `${canonical}#how`,
      name: t('landing.how.title'),
      description: t('landing.how.lead'),
      inLanguage: LOCALE_TAG[locale],
      step: HOW_STEPS.map((n) => ({
        '@type': 'HowToStep',
        position: n,
        name: t(`landing.how.s${n}.title`),
        text: t(`landing.how.s${n}.text`),
        url: `${canonical}#how-${n}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: FAQ_IDS.map((id) => ({
        '@type': 'Question',
        name: t(`landing.faq.${id}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`landing.faq.${id}.a`, params.faq[id]) },
      })),
    },
  ];
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
}

export function legalStructuredData(
  locale: Locale,
  t: Translator,
  canonical: string,
  title: string,
  updated: string,
): string {
  const base = config().PUBLIC_BASE_URL;
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t, locale),
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
            name: 'Korpora',
            item: `${base}${PATHS[locale]}`,
          },
          { '@type': 'ListItem', position: 2, name: title, item: canonical },
        ],
      },
    ],
  });
}
