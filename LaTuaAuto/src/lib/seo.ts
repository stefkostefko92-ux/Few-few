import type { Metadata } from 'next';
import { DEFAULT_LOCALE, LOCALES, OG_LOCALE, type Locale } from '@/i18n/locales';

export const SITE_URL = (process.env.PUBLIC_BASE_URL ?? 'https://latuaauto.carbonstealth.eu').replace(/\/$/, '');
export const SITE_NAME = 'LaTuaAuto';
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? 'info@carbonstealth.eu';

// Правилото на репото: ≥5 ключови думи, една винаги „Carbon Stealth“.
export const BASE_KEYWORDS: Record<Locale, string[]> = {
  it: ['Carbon Stealth', 'chat targa', 'avvisare proprietario auto', 'scadenze auto', 'revisione auto', 'bollo auto', 'assicurazione RCA', 'multa sconto 30%'],
  en: ['Carbon Stealth', 'license plate chat', 'contact car owner by plate', 'car deadlines Italy', 'revisione', 'bollo auto', 'RCA insurance', 'traffic fine Italy'],
  de: ['Carbon Stealth', 'Kennzeichen Chat', 'Autobesitzer kontaktieren', 'Auto Fristen Italien', 'Revisione', 'Bollo Auto', 'RCA Versicherung', 'Bußgeld Italien'],
};

export function hreflangFor(path: string): Record<string, string> {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]));
  return { ...languages, 'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${path}` };
}

export interface PageMeta {
  locale: Locale;
  path: string; // „/“, „/come-funziona“ …
  title: string;
  description: string;
  keywords?: string[];
  noindex?: boolean;
}

export function pageMetadata(meta: PageMeta): Metadata {
  const path = meta.path === '/' ? '' : meta.path;
  const url = `${SITE_URL}/${meta.locale}${path}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: meta.title,
    description: meta.description,
    keywords: [...BASE_KEYWORDS[meta.locale], ...(meta.keywords ?? [])],
    alternates: { canonical: url, languages: hreflangFor(path) },
    robots: meta.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      url,
      siteName: SITE_NAME,
      title: meta.title,
      description: meta.description,
      locale: OG_LOCALE[meta.locale],
    },
    twitter: { card: 'summary_large_image', title: meta.title, description: meta.description },
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Carbon Stealth VCC',
    url: 'https://carbonstealth.eu',
    email: CONTACT_EMAIL,
  };
}

export function websiteJsonLd(locale: Locale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_URL}/${locale}`,
    inLanguage: locale,
    description,
    publisher: { '@type': 'Organization', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' },
  };
}

export function softwareAppJsonLd(locale: Locale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web, iOS, Android',
    inLanguage: locale,
    description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    url: `${SITE_URL}/${locale}`,
  };
}

export function faqJsonLd(items: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export function breadcrumbJsonLd(locale: Locale, items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}/${locale}${it.path === '/' ? '' : it.path}`,
    })),
  };
}
