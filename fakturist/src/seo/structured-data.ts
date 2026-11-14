import { BRAND } from '../brand.js';
import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { hasKey, type Locale, type Translate } from '../i18n.js';
import { pageUrl, type SitePageId } from './pages.js';
import type { PublicPlan } from '../billing/public-plans.js';
import { LAST_UPDATE } from '../news/entries.js';

type Json = Record<string, unknown>;

/** Въпросите на страницата: `site.<страница>.faq.<n>.q` / `.a`, поредни от 1 до първия липсващ. */
export function faqItems(
  locale: Locale,
  t: Translate,
  page: SitePageId,
): Array<{ q: string; a: string }> {
  const items: Array<{ q: string; a: string }> = [];
  for (let n = 1; n < 50; n += 1) {
    const key = `site.${page}.faq.${n}`;
    if (!hasKey(locale, `${key}.q`)) break;
    items.push({ q: t(`${key}.q`), a: t(`${key}.a`) });
  }
  return items;
}

export function organization(base: string): Json {
  return {
    '@type': 'Organization',
    '@id': `${COMPANY.url}/#organization`,
    name: COMPANY.name,
    alternateName: COMPANY.nameBg,
    url: COMPANY.url,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    vatID: COMPANY.vat,
    taxID: COMPANY.eik,
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.street.en,
      addressLocality: COMPANY.city.en,
      addressRegion: COMPANY.region.en,
      postalCode: COMPANY.postalCode,
      addressCountry: COMPANY.country,
    },
    sameAs: [...COMPANY.profiles],
    brand: { '@type': 'Brand', name: BRAND.name, url: base },
  };
}

export function website(base: string, locale: Locale): Json {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    name: locale === 'bg' ? BRAND.name : BRAND.nameLatin,
    url: base,
    inLanguage: ['bg', 'en'],
    publisher: { '@id': `${COMPANY.url}/#organization` },
  };
}

function breadcrumbs(base: string, locale: Locale, t: Translate, page: SitePageId): Json {
  const items = [{ name: t('site.nav.home'), url: pageUrl(base, 'home', locale) }];
  if (page !== 'home')
    items.push({ name: t(`site.nav.${page}`), url: pageUrl(base, page, locale) });
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function software(base: string, locale: Locale, t: Translate, plans: PublicPlan[]): Json {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${base}/#software`,
    name: locale === 'bg' ? BRAND.name : BRAND.nameLatin,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Invoicing',
    operatingSystem: 'Web',
    description: t('site.home.meta.description'),
    url: pageUrl(base, 'home', locale),
    publisher: { '@id': `${COMPANY.url}/#organization` },
    offers: plans
      .filter((plan) => plan.priceMonthlyCents !== null)
      .map((plan) => ({
        '@type': 'Offer',
        name: locale === 'bg' ? plan.nameBg : plan.nameEn,
        price: ((plan.priceMonthlyCents ?? 0) / 100).toFixed(2),
        priceCurrency: 'EUR',
        valueAddedTaxIncluded: false,
        url: pageUrl(base, 'pricing', locale),
      })),
  };
}

/** Целият граф за страницата — един `<script type="application/ld+json">`. */
export function structuredData(input: {
  base: string;
  locale: Locale;
  t: Translate;
  page: SitePageId;
  plans: PublicPlan[];
}): Json {
  const { base, locale, t, page, plans } = input;
  const graph: Json[] = [
    organization(base),
    website(base, locale),
    breadcrumbs(base, locale, t, page),
  ];
  if (page === 'home' || page === 'pricing' || page === 'accountants') {
    graph.push(software(base, locale, t, plans));
  }
  const faq = faqItems(locale, t, page);
  if (faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }
  graph.push({
    '@type': page === 'einvoicing2028' ? 'Article' : 'WebPage',
    '@id': `${pageUrl(base, page, locale)}#page`,
    url: pageUrl(base, page, locale),
    name: t(`site.${page}.meta.title`),
    description: t(`site.${page}.meta.description`),
    inLanguage: locale,
    dateModified: page === 'news' ? LAST_UPDATE : CONTENT_UPDATED,
    ...(page === 'einvoicing2028'
      ? {
          headline: t('site.einvoicing2028.meta.title'),
          datePublished: '2026-11-12',
          author: { '@id': `${COMPANY.url}/#organization` },
          publisher: { '@id': `${COMPANY.url}/#organization` },
        }
      : {}),
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '[data-speakable]'] },
    isPartOf: { '@id': `${base}/#website` },
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}
