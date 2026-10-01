// Metadata and structured data of the public pages. Indexing stays off until the owner approves the public
// release (ALLOW_INDEXING=true); the application pages under /app are never indexed.
import type { Metadata } from 'next';
import { LOCALES, type Locale } from '@/i18n/locales';
import { indexingAllowed, publicBaseUrl } from './env';

export const SITE_NAME = 'LiftPilot';
const OG_LOCALE: Record<Locale, string> = { it: 'it_IT', en: 'en_GB', bg: 'bg_BG' };

interface PageMeta {
  locale: Locale;
  /** path after the locale, '' for the home page */
  path: string;
  title: string;
  description: string;
  keywords: readonly string[];
  indexable: boolean;
}

export function pageMetadata(p: PageMeta): Metadata {
  const base = publicBaseUrl(), url = (l: string): string => `${base}/${l}${p.path}`;
  const index = p.indexable && indexingAllowed();
  return {
    title: p.title,
    description: p.description,
    keywords: [...p.keywords],
    alternates: {
      canonical: url(p.locale),
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, url(l)])), 'x-default': url('it') },
    },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'website', siteName: SITE_NAME, title: p.title, description: p.description, url: url(p.locale), locale: OG_LOCALE[p.locale],
      alternateLocale: LOCALES.filter((l) => l !== p.locale).map((l) => OG_LOCALE[l]),
      images: [{ url: `${base}/img/og-${p.locale}.png`, width: 1200, height: 630, alt: p.title }],
    },
    twitter: { card: 'summary_large_image', title: p.title, description: p.description, images: [`${base}/img/og-${p.locale}.png`] },
  };
}

type JsonLd = Record<string, unknown>;

export function organizationLd(): JsonLd {
  return { '@type': 'Organization', '@id': 'https://carbonstealth.eu/#org', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' };
}

export function websiteLd(locale: Locale): JsonLd {
  return { '@type': 'WebSite', '@id': `${publicBaseUrl()}/#website`, name: SITE_NAME, url: `${publicBaseUrl()}/${locale}`, inLanguage: locale, publisher: { '@id': 'https://carbonstealth.eu/#org' } };
}

export function softwareLd(locale: Locale, description: string, features: readonly string[] = []): JsonLd {
  return {
    '@type': 'SoftwareApplication', name: SITE_NAME, applicationCategory: 'BusinessApplication', applicationSubCategory: 'Lift design and engineering calculation',
    operatingSystem: 'Web', inLanguage: ['it', 'en', 'bg'], description, url: `${publicBaseUrl()}/${locale}`,
    ...(features.length ? { featureList: [...features] } : {}),
    publisher: { '@id': 'https://carbonstealth.eu/#org' }, areaServed: { '@type': 'Country', name: 'Italia' },
  };
}

/** A process in steps (HowTo): its name and each step's name and text. */
export function howToLd(name: string, steps: readonly { name: string; text: string }[]): JsonLd {
  return { '@type': 'HowTo', name, step: steps.map((x, i) => ({ '@type': 'HowToStep', position: i + 1, name: x.name, text: x.text })) };
}

export function breadcrumbLd(items: readonly { name: string; url: string }[]): JsonLd {
  return { '@type': 'BreadcrumbList', itemListElement: items.map((it, j) => ({ '@type': 'ListItem', position: j + 1, name: it.name, item: it.url })) };
}

export function faqLd(qa: readonly { q: string; a: string }[]): JsonLd {
  return { '@type': 'FAQPage', mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) };
}

export function speakableLd(url: string, selectors: readonly string[]): JsonLd {
  return { '@type': 'WebPage', url, speakable: { '@type': 'SpeakableSpecification', cssSelector: [...selectors] } };
}

/** One JSON-LD graph as script text: `<` escaped so the data can never close the script element. */
export const ldJson = (nodes: readonly JsonLd[]): string =>
  JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
