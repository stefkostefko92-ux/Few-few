import type { Metadata } from 'next';

import { DEFAULT_LOCALE, LOCALES, OG_LOCALE, type Locale } from '@/i18n/config';
import { DISCORD_INVITE } from '@/lib/site';

export const SITE_NAME = 'FiveM BG';
export const SITE_URL = (process.env.PUBLIC_BASE_URL ?? 'https://fivembulgaria.carbonstealth.eu').replace(
  /\/+$/,
  '',
);

/**
 * Базовите ключови думи по език. Правило на репото: ≥5, като **„Carbon
 * Stealth“ е винаги сред тях** (бранд атрибуция — Carbon Stealth VCC прави
 * продукта).
 */
export const BASE_KEYWORDS: Record<Locale, string[]> = {
  bg: [
    'FiveM България',
    'български FiveM сървъри',
    'FiveM RP сървъри',
    'GTA V roleplay България',
    'ESX QBCore сървъри',
    'Carbon Stealth',
  ],
  en: [
    'FiveM Bulgaria',
    'Bulgarian FiveM servers',
    'FiveM RP servers',
    'GTA V roleplay Bulgaria',
    'ESX QBCore servers',
    'Carbon Stealth',
  ],
};

/** Абсолютен адрес БЕЗ езиков префикс (за общите файлове: sitemap, robots). */
export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Абсолютен адрес НА ЕЗИК: `/bg/servers/x`. */
export function localeUrl(locale: Locale, path = '/'): string {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}/${locale}${clean}`;
}

type PageMetaInput = {
  locale: Locale;
  title: string;
  description: string;
  /** Пътят БЕЗ езиков префикс: `/servers/x`. */
  path?: string;
  keywords?: string[];
  noindex?: boolean;
};

/**
 * Един източник за canonical + hreflang + OG + ключови думи. Всяка страница
 * сочи към себе си като canonical и изброява ВСИЧКИТЕ си езикови близнаци —
 * иначе двата езика се конкурират за едно и също запитване.
 */
export function pageMetadata({
  locale,
  title,
  description,
  path = '/',
  keywords = [],
  noindex = false,
}: PageMetaInput): Metadata {
  const url = localeUrl(locale, path);

  const languages: Record<string, string> = {};
  for (const other of LOCALES) languages[other] = localeUrl(other, path);
  languages['x-default'] = localeUrl(DEFAULT_LOCALE, path);

  return {
    title,
    description,
    keywords: Array.from(new Set([...keywords, ...BASE_KEYWORDS[locale]])),
    alternates: { canonical: url, languages },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      title,
      description,
      url,
      images: [{ url: absoluteUrl('/brand/logo.png'), width: 1280, height: 324, alt: SITE_NAME }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────

/**
 * Сериализира JSON-LD за вграждане в `<script>`. `JSON.stringify` НЕ екранира
 * `<`, така че име на сървър със `</script>` би затворило блока и вкарало HTML
 * (XSS). Имената идват от чужди сървъри и от заявки — екранираме винаги.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function siteJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl('/brand/logo.png'),
        // `sameAs` е сигналът, по който търсачките свързват сайта с профилите
        // му. Досега липсваше, защото нямаше какво да сочи.
        sameAs: [DISCORD_INVITE],
        description:
          locale === 'bg'
            ? 'Директория на българските FiveM roleplay сървъри с жив статус, правила, туториали и ревюта.'
            : 'A directory of Bulgarian FiveM roleplay servers with live status, rules, tutorials and reviews.',
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
        url: localeUrl(locale),
        inLanguage: locale,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };
}

/** Списъкът със сървъри — това е, което AI отговарачите цитират. */
export function serverListJsonLd(
  locale: Locale,
  servers: ReadonlyArray<{ slug: string; name: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: locale === 'bg' ? 'Български FiveM сървъри' : 'Bulgarian FiveM servers',
    numberOfItems: servers.length,
    itemListElement: servers.map((server, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: server.name,
      url: localeUrl(locale, `/servers/${server.slug}`),
    })),
  };
}

/** Пътеката — Google я показва вместо голия URL в резултата. */
export function breadcrumbJsonLd(
  locale: Locale,
  items: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: localeUrl(locale, item.path),
    })),
  };
}

/** Статия с автор и дати — носачът на E-E-A-T сигналите. */
export function articleJsonLd(
  locale: Locale,
  post: {
    slug: string;
    title: string;
    excerpt: string;
    author: string;
    publishedAt: Date | null;
    updatedAt: Date;
  },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    inLanguage: locale,
    mainEntityOfPage: localeUrl(locale, `/news/${post.slug}`),
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

/** Правилата и туториалите — структурирани като процедура/списък. */
export function howToJsonLd(
  locale: Locale,
  tutorial: { title: string; description: string; steps: ReadonlyArray<{ title: string; body: string }> },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: tutorial.title,
    description: tutorial.description,
    inLanguage: locale,
    step: tutorial.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
  };
}
