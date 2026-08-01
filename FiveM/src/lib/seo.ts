import type { Metadata } from 'next';

export const SITE_NAME = 'FiveM Bulgaria';
export const SITE_URL = (process.env.PUBLIC_BASE_URL ?? 'https://fivembulgaria.carbonstealth.eu').replace(
  /\/+$/,
  '',
);

/**
 * Базовите ключови думи. Правило на репото: ≥5, като **„Carbon Stealth“ е
 * винаги сред тях** (бранд атрибуция — Carbon Stealth VCC прави продукта).
 */
export const BASE_KEYWORDS = [
  'FiveM България',
  'български FiveM сървъри',
  'FiveM RP сървъри',
  'GTA V roleplay България',
  'ESX QBCore сървъри',
  'Carbon Stealth',
];

export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

type PageMetaInput = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noindex?: boolean;
};

/** Един източник за canonical + OG + ключови думи на всяка страница. */
export function pageMetadata({
  title,
  description,
  path = '/',
  keywords = [],
  noindex = false,
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    keywords: Array.from(new Set([...keywords, ...BASE_KEYWORDS])),
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'bg_BG',
      title,
      description,
      url,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────

/**
 * Сериализира JSON-LD за вграждане в `<script>`. `JSON.stringify` НЕ екранира
 * `<`, така че име на сървър със `</script>` би затворило блока и вкарало HTML
 * (XSS). Имената идват от заявка на външен подател — екранираме винаги.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        description:
          'Директория на българските FiveM roleplay сървъри с жив статус, ревюта и туториали.',
        knowsAbout: ['FiveM', 'GTA V roleplay', 'ESX', 'QBCore', 'Qbox', 'FiveM сървъри България'],
        parentOrganization: {
          '@type': 'Organization',
          name: 'Carbon Stealth VCC',
          url: 'https://carbonstealth.eu',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: 'bg',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };
}

/** Списъкът със сървъри — това е, което AI отговарачите цитират. */
export function serverListJsonLd(servers: ReadonlyArray<{ slug: string; name: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Български FiveM сървъри',
    numberOfItems: servers.length,
    itemListElement: servers.map((server, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: server.name,
      url: absoluteUrl(`/servers/${server.slug}`),
    })),
  };
}

/** Пътеката — Google я показва вместо голия URL в резултата. */
export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** Статия с автор и дати — носачът на E-E-A-T сигналите. */
export function articleJsonLd(post: {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    inLanguage: 'bg',
    mainEntityOfPage: absoluteUrl(`/news/${post.slug}`),
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@id': `${SITE_URL}/#organization` },
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
  };
}

export function faqJsonLd(items: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
