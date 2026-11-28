import type { Locale } from '../i18n.js';
import { feature, type FeatureCode } from '../features.js';

/**
 * Страниците на витрината — ЕДИНСТВЕНИЯТ списък: рутерът, sitemap, hreflang, breadcrumbs и llms.txt
 * четат оттук. Нова страница = нов ред + изглед `views/site/<id>.ejs` + ключовете `site.<id>.meta.*`.
 * Страница за рекламите — ред тук + `LANDING_IDS` в landing.ts + съдържанието в речника (общ изглед landing.ejs).
 * Страница за една функция носи `feature`: публикува се само когато функцията е `live` (SPEC 99) — иначе
 * няма адрес, не е в sitemap/llms.txt и витрината не води към нея.
 */
const ALL_SITE_PAGES = [
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
  {
    id: 'freeInvoicing',
    paths: { bg: '/bezplatna-programa-za-fakturi', en: '/en/free-invoicing-software' },
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    id: 'proforma',
    paths: { bg: '/proforma-faktura', en: '/en/pro-forma-invoice' },
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    id: 'vatLedgers',
    paths: { bg: '/dnevnitsi-po-dds', en: '/en/vat-ledgers' },
    priority: 0.7,
    changefreq: 'monthly',
    feature: 'vat-ledgers',
  },
  {
    id: 'saft',
    paths: { bg: '/saf-t', en: '/en/saf-t' },
    priority: 0.7,
    changefreq: 'monthly',
    feature: 'saf-t',
  },
  {
    id: 'help',
    paths: { bg: '/kak-raboti', en: '/en/how-it-works' },
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    id: 'news',
    paths: { bg: '/kakvo-novo', en: '/en/whats-new' },
    priority: 0.6,
    changefreq: 'weekly',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  paths: Record<Locale, string>;
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly';
  feature?: FeatureCode;
}>;

export type SitePage = (typeof ALL_SITE_PAGES)[number];
export type SitePageId = SitePage['id'];

/** Публикувана ли е страницата: без функция или с пусната функция (`live`). */
export function isPublished(page: SitePage): boolean {
  return !('feature' in page) || feature(page.feature).status === 'live';
}

/** Публикуваните страници — всичко, което витрината показва, връзва и подава на търсачките. */
export const SITE_PAGES: readonly SitePage[] = ALL_SITE_PAGES.filter(isPublished);

/** Страница по id — и непубликувана (адресът ѝ остава известен за деня на пускането). */
export function sitePage(id: SitePageId): SitePage {
  const page = ALL_SITE_PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Непозната страница ${id}`);
  return page;
}

/** Пълният адрес на страница на даден език. */
export function pageUrl(base: string, id: SitePageId, locale: Locale): string {
  return `${base}${sitePage(id).paths[locale]}`;
}
