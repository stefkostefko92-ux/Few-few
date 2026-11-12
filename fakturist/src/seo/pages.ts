import type { Locale } from '../i18n.js';

/**
 * Страниците на витрината — ЕДИНСТВЕНИЯТ списък: рутерът, sitemap, hreflang, breadcrumbs и llms.txt
 * четат оттук. Нова страница = нов ред + изглед `views/site/<id>.ejs` + ключовете `site.<id>.meta.*`.
 */
export const SITE_PAGES = [
  { id: 'home', paths: { bg: '/', en: '/en/' }, priority: 1.0, changefreq: 'weekly' },
  {
    id: 'pricing',
    paths: { bg: '/ceni', en: '/en/pricing' },
    priority: 0.9,
    changefreq: 'monthly',
  },
  {
    id: 'accountants',
    paths: { bg: '/za-schetovoditeli', en: '/en/accountants' },
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    id: 'einvoicing2028',
    paths: { bg: '/e-fakturi-2028', en: '/en/e-invoicing-2028' },
    priority: 0.8,
    changefreq: 'weekly',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  paths: Record<Locale, string>;
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly';
}>;

export type SitePage = (typeof SITE_PAGES)[number];
export type SitePageId = SitePage['id'];

export function sitePage(id: SitePageId): SitePage {
  const page = SITE_PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Непозната страница ${id}`);
  return page;
}

/** Пълният адрес на страница на даден език. */
export function pageUrl(base: string, id: SitePageId, locale: Locale): string {
  return `${base}${sitePage(id).paths[locale]}`;
}
