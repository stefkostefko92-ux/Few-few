import { Router, type Request, type Response } from 'express';
import { BRAND } from '../brand.js';
import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { FEATURES, FEATURE_GROUPS } from '../features.js';
import { LOCALE_TAG, translator, type Locale } from '../i18n.js';
import { safeJson } from '../http/json-ld.js';
import { publicPlans } from '../billing/public-plans.js';
import { pageUrl, SITE_PAGES, type SitePageId } from '../seo/pages.js';
import { faqItems, structuredData } from '../seo/structured-data.js';

/** Сума в евроцентове за показване: „9,00 €“ / „€9.00“. */
export function formatEuro(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

async function renderSitePage(
  _req: Request,
  res: Response,
  id: SitePageId,
  locale: Locale,
): Promise<void> {
  const base = config().PUBLIC_BASE_URL;
  const t = translator(locale);
  const plans = await publicPlans();
  const keywords = t(`site.${id}.meta.keywords`)
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
  res.locals.lang = locale;
  res.locals.htmlLang = locale;
  res.locals.t = t;
  res.locals.brand = BRAND;
  res.locals.company = COMPANY;
  res.locals.contentUpdated = CONTENT_UPDATED;
  res.locals.page = id;
  res.locals.plans = plans;
  res.locals.features = FEATURES;
  res.locals.featureGroups = FEATURE_GROUPS;
  res.locals.formatEuro = (cents: number) => formatEuro(cents, locale);
  res.locals.faq = faqItems(locale, t, id);
  res.locals.urls = Object.fromEntries(
    SITE_PAGES.map((page) => [page.id, page.paths[locale]]),
  ) as Record<SitePageId, string>;
  res.locals.registrationOpen = config().REGISTRATION_OPEN;
  res.locals.seo = {
    title: t(`site.${id}.meta.title`),
    description: t(`site.${id}.meta.description`),
    keywords,
    canonical: pageUrl(base, id, locale),
    alternates: { bg: pageUrl(base, id, 'bg'), en: pageUrl(base, id, 'en') },
    xDefault: pageUrl(base, id, 'bg'),
    ogLocale: locale === 'bg' ? 'bg_BG' : 'en_GB',
    ogImage: `${base}/img/og-${locale}.png`,
    jsonLd: safeJson(structuredData({ base, locale, t, page: id, plans: plans ?? [] })),
  };
  res.render(`site/${id}`);
}

export function siteRouter(): Router {
  const router = Router();
  for (const page of SITE_PAGES) {
    for (const locale of ['bg', 'en'] as const) {
      router.get(page.paths[locale], (req, res, next) => {
        renderSitePage(req, res, page.id, locale).catch(next);
      });
    }
  }
  // `/en` без наклонена черта → каноничния адрес на английската начална страница.
  router.get('/en', (_req, res) => res.redirect(301, '/en/'));
  return router;
}
