// SEO/GEO/AEO помощници: canonical + hreflang за 6-те локала, ключови думи
// и JSON-LD структури. Единственият източник на истина за SEO метаданните.

import type { Metadata } from 'next';
import { LOCALES, type Locale } from '@/i18n/locales';

export const SITE_URL =
  process.env.PUBLIC_BASE_URL ?? 'https://linketto.carbonstealth.eu';

export const ORG = {
  name: 'Carbon Stealth VCC',
  url: 'https://carbonstealth.eu',
  email: 'info@carbonstealth.eu',
  address: {
    streetAddress: 'ул. „Самуил“ 3',
    postalCode: '2670',
    addressLocality: 'Бобов дол',
    addressCountry: 'BG',
  },
} as const;

// og:locale иска language_TERRITORY, не само езиковия код.
const OG_LOCALE: Record<Locale, string> = {
  bg: 'bg_BG',
  en: 'en_US',
  it: 'it_IT',
  es: 'es_ES',
  de: 'de_DE',
  fr: 'fr_FR',
};

// Единна social card (1200×630) — за силни споделяния и AI/SERP карти.
export const OG_IMAGE = {
  url: `${SITE_URL}/og.png`,
  width: 1200,
  height: 630,
  alt: 'Linketto — link in bio на всеки език',
} as const;

/** canonical + hreflang alternates за локализирана страница на сайта. */
export function localeAlternates(locale: Locale, path = '') {
  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    languages[loc] = `${SITE_URL}/${loc}${path}`;
  }
  languages['x-default'] = `${SITE_URL}/en${path}`;
  return {
    canonical: `${SITE_URL}/${locale}${path}`,
    languages,
  } satisfies Metadata['alternates'];
}

/** Обща Metadata сглобка за локализирана страница. */
export function pageMetadata(
  locale: Locale,
  path: string,
  input: { title: string; description: string; keywords?: string[] },
): Metadata {
  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: localeAlternates(locale, path),
    openGraph: {
      type: 'website',
      siteName: 'Linketto',
      title: input.title,
      description: input.description,
      url: `${SITE_URL}/${locale}${path}`,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map(
        (l) => OG_LOCALE[l],
      ),
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [OG_IMAGE.url],
    },
  };
}

/** JSON-LD: организацията майка + сайтът + приложението с плановете. */
export function siteJsonLd(input: {
  locale: Locale;
  description: string;
  plans: { name: string; priceEur: number }[];
}) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${ORG.url}#org`,
      name: ORG.name,
      url: ORG.url,
      email: ORG.email,
      logo: `${SITE_URL}/logo.png`,
      address: { '@type': 'PostalAddress', ...ORG.address },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      name: 'Linketto',
      url: SITE_URL,
      inLanguage: LOCALES,
      publisher: { '@id': `${ORG.url}#org` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Linketto',
      url: SITE_URL,
      applicationCategory: 'WebApplication',
      operatingSystem: 'Web',
      description: input.description,
      inLanguage: input.locale,
      offers: input.plans.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: plan.priceEur.toFixed(2),
        priceCurrency: 'EUR',
      })),
      publisher: { '@id': `${ORG.url}#org` },
    },
  ];
}

/** JSON-LD: FAQ страница (AEO — отговори, готови за цитиране от AI). */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
