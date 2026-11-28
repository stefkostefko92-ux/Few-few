import { BRAND } from '../brand.js';
import { ARTICLE_PUBLISHED, COMPANY, CONTENT_UPDATED } from '../company.js';
import { hasKey, type Locale, type Translate } from '../i18n.js';
import { isLanding, landingParams, landingSections } from './landing.js';
import { pageUrl, type SitePageId } from './pages.js';
import type { PublicPlan } from '../billing/public-plans.js';
import { LAST_UPDATE } from '../news/entries.js';
import { helpFaq, publicHelp } from '../help/content.js';
import { FEATURES } from '../features.js';
import { SOFTWARE_VERSION } from '../version.js';

type Json = Record<string, unknown>;

/** Въпросите на страницата: `site.<страница>.faq.<n>.q` / `.a`, поредни от 1 до първия липсващ. */
export function faqItems(
  locale: Locale,
  t: Translate,
  page: SitePageId,
  params: Record<string, string> = {},
): Array<{ q: string; a: string }> {
  const items: Array<{ q: string; a: string }> = [];
  for (let n = 1; n < 50; n += 1) {
    const key = `site.${page}.faq.${n}`;
    if (!hasKey(locale, `${key}.q`)) break;
    items.push({ q: t(`${key}.q`, params), a: t(`${key}.a`, params) });
  }
  return items;
}

/** Фирмата — адресът е на езика на страницата (същият като във футъра: NAP). */
export function organization(base: string, locale: Locale): Json {
  return {
    '@type': 'Organization',
    '@id': `${COMPANY.url}/#organization`,
    name: COMPANY.name,
    legalName: COMPANY.nameBg,
    alternateName: COMPANY.nameBg,
    url: COMPANY.url,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    vatID: COMPANY.vat,
    taxID: COMPANY.eik,
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.street[locale],
      addressLocality: COMPANY.city[locale],
      addressRegion: COMPANY.region[locale],
      postalCode: COMPANY.postalCode,
      addressCountry: COMPANY.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: COMPANY.email,
      telephone: COMPANY.phone,
      availableLanguage: ['bg', 'en'],
    },
    sameAs: [...COMPANY.profiles],
    knowsAbout:
      locale === 'bg'
        ? [
            'електронно фактуриране',
            'ЗДДС',
            'EN 16931',
            'UBL',
            'SAF-T',
            'Peppol',
            'дневници по ДДС',
          ]
        : [
            'electronic invoicing',
            'Bulgarian VAT Act',
            'EN 16931',
            'UBL',
            'SAF-T',
            'Peppol',
            'VAT ledgers',
          ],
    brand: { '@type': 'Brand', name: BRAND.name, url: base, logo: `${base}/img/brand/logo.png` },
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
    '@id': `${pageUrl(base, page, locale)}#breadcrumb`,
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
    softwareVersion: SOFTWARE_VERSION,
    // Само наличните — предстоящото не се обявява като функция (заблуждаваща реклама).
    featureList: FEATURES.filter((item) => item.status === 'live').map((item) =>
      t(`features.${item.code}.name`),
    ),
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
    organization(base, locale),
    website(base, locale),
    breadcrumbs(base, locale, t, page),
  ];
  if (page === 'home' || page === 'pricing' || page === 'accountants' || page === 'freeInvoicing') {
    graph.push(software(base, locale, t, plans));
  }
  // Страниците за рекламите: всеки раздел със стъпки — HowTo.
  const params = isLanding(page) ? landingParams(locale, t, plans) : {};
  if (isLanding(page)) {
    for (const section of landingSections(locale, t, page, params)) {
      if (section.steps.length === 0) continue;
      graph.push({
        '@type': 'HowTo',
        '@id': `${pageUrl(base, page, locale)}#${section.id}`,
        name: section.title,
        inLanguage: locale,
        step: section.steps.map((text, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          text,
        })),
      });
    }
  }
  // „Как работи“: всеки раздел — HowTo със стъпките; въпросите са в help.json (SPEC 89).
  if (page === 'help') {
    for (const section of publicHelp(locale)) {
      graph.push({
        '@type': 'HowTo',
        '@id': `${pageUrl(base, page, locale)}#${section.id}`,
        name: section.title,
        description: section.intro,
        inLanguage: locale,
        step: section.steps.map((text, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          text,
        })),
      });
    }
  }
  const faq = page === 'help' ? helpFaq(locale) : faqItems(locale, t, page, params);
  if (faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${pageUrl(base, page, locale)}#faq`,
      inLanguage: locale,
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
          datePublished: ARTICLE_PUBLISHED,
          image: `${base}/img/og-${locale}.png`,
          author: { '@id': `${COMPANY.url}/#organization` },
          publisher: { '@id': `${COMPANY.url}/#organization` },
        }
      : {}),
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '[data-speakable]'] },
    isPartOf: { '@id': `${base}/#website` },
    breadcrumb: { '@id': `${pageUrl(base, page, locale)}#breadcrumb` },
    publisher: { '@id': `${COMPANY.url}/#organization` },
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}
