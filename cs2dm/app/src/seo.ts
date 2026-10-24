import { config } from './config.js';
import { PAGE_SLUG, type PageId } from './content.js';
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABEL, OG_LOCALE, type Locale } from './i18n.js';

/**
 * Слоят за откриваемост (SEO/GEO/AEO): адреси, canonical, hreflang, Open Graph и JSON-LD.
 * Нула твърдо зашити адреси на сайта — всичко се строи от `PUBLIC_BASE_URL`.
 */
export const SITE_NAME = 'CarbonStealth.eu | Dust2 DM';
export const ORGANIZATION = { name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' };

/** Таваните от правилата на собственика: заглавие под 60, описание под 160 знака. */
export const TITLE_MAX = 59;
export const DESCRIPTION_MAX = 159;

export function absolute(path: string): string {
  return `${config().PUBLIC_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function pagePath(locale: Locale, page: PageId): string {
  const slug = PAGE_SLUG[page];
  return slug ? `/${locale}/${slug}` : `/${locale}/`;
}

export function playerPath(locale: Locale, steamId: string): string {
  return `/${locale}/player/${steamId}`;
}

export function matchPath(locale: Locale, id: number): string {
  return `/${locale}/match/${id}`;
}

/** Път + нормализиран query (само подадените, в даден ред) — за canonical и пагинацията. */
export function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export function alternatesFor(pathFor: (locale: Locale) => string): Alternate[] {
  return [
    ...LOCALES.map((code) => ({ hreflang: code, href: absolute(pathFor(code)) })),
    { hreflang: 'x-default', href: absolute(pathFor(DEFAULT_LOCALE)) },
  ];
}

export interface Crumb {
  name: string;
  path: string;
}

export type JsonLdNode = Record<string, unknown>;

export interface HeadInput {
  locale: Locale;
  title: string;
  description: string;
  keywords: string;
  /** Каноничният път на ТАЗИ страница (с нормализиран query, ако има). */
  path: string;
  /** Същата страница на друг език — за hreflang и превключвателя. */
  pathFor: (locale: Locale) => string;
  crumbs: Crumb[];
  noindex?: boolean;
  pageType?: string;
  extraNodes?: JsonLdNode[];
  ogImageAlt: string;
}

export interface Head {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  alternates: Alternate[];
  robots: string;
  ogLocale: string;
  ogLocaleAlternates: string[];
  ogImage: string;
  ogImageAlt: string;
  structuredData: string;
  langLinks: Array<{ locale: Locale; label: string; href: string; current: boolean }>;
}

/** Низ, отрязан до `max` знака по кодови точки, с многоточие. */
export function fit(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * JSON за `<script type="application/ld+json">`. Стойностите идват от речниците и базата (ник на
 * играч!) — `<` се екранира, за да не може низ да затвори етикета предсрочно.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function organizationNode(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': absolute('/#organization'),
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
  };
}

export function websiteNode(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': absolute('/#website'),
    url: absolute('/'),
    name: SITE_NAME,
    inLanguage: [...LOCALES],
    publisher: { '@id': absolute('/#organization') },
  };
}

export function buildHead(input: HeadInput): Head {
  const canonical = absolute(input.path);
  const title = fit(input.title, TITLE_MAX);
  const description = fit(input.description, DESCRIPTION_MAX);
  const graph: JsonLdNode[] = [
    organizationNode(),
    websiteNode(),
    {
      '@type': input.pageType ?? 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: input.locale,
      isPartOf: { '@id': absolute('/#website') },
      publisher: { '@id': absolute('/#organization') },
      breadcrumb: { '@id': `${canonical}#breadcrumbs` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumbs`,
      itemListElement: input.crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: absolute(crumb.path),
      })),
    },
    ...(input.extraNodes ?? []),
  ];
  return {
    title,
    description,
    keywords: input.keywords,
    canonical,
    alternates: alternatesFor(input.pathFor),
    robots: input.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    ogLocale: OG_LOCALE[input.locale],
    ogLocaleAlternates: LOCALES.filter((code) => code !== input.locale).map(
      (code) => OG_LOCALE[code],
    ),
    ogImage: absolute('/static/og.png'),
    ogImageAlt: input.ogImageAlt,
    structuredData: jsonForScript({ '@context': 'https://schema.org', '@graph': graph }),
    langLinks: LOCALES.map((code) => ({
      locale: code,
      label: LOCALE_LABEL[code],
      href: input.pathFor(code),
      current: code === input.locale,
    })),
  };
}
