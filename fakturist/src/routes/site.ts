import { Router, type Request, type Response } from 'express';
import { BRAND } from '../brand.js';
import { ARTICLE_PUBLISHED, COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { FEATURES, FEATURE_GROUPS } from '../features.js';
import { LOCALE_TAG, translator, type Locale } from '../i18n.js';
import { safeJson } from '../http/json-ld.js';
import { demoChain } from '../site-demo-chain.js';
import { publicPlans } from '../billing/public-plans.js';
import { pageUrl, SITE_PAGES, type SitePageId } from '../seo/pages.js';
import { faqItems, structuredData } from '../seo/structured-data.js';
import { byDay, LAST_UPDATE, NEWS } from '../news/entries.js';
import { NEWS_FEED_PATHS } from '../news/feed.js';
import { helpFaq, publicHelp } from '../help/content.js';
import { SOFTWARE_VERSION } from '../version.js';
import { campaignQuery, readCampaign, withQuery } from '../marketing/campaign.js';
import { isLanding, landingParams, landingSections } from '../seo/landing.js';

/** Сума в евроцентове за показване: „9,00 €“ / „€9.00“. */
export function formatEuro(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

async function renderSitePage(
  req: Request,
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
  res.locals.articlePublished = ARTICLE_PUBLISHED;
  res.locals.page = id;
  res.locals.plans = plans;
  res.locals.features = FEATURES;
  res.locals.featureGroups = FEATURE_GROUPS;
  res.locals.formatEuro = (cents: number) => formatEuro(cents, locale);
  const params = isLanding(id) ? landingParams(locale, t, plans ?? []) : {};
  res.locals.landingParams = params;
  res.locals.sections = isLanding(id) ? landingSections(locale, t, id, params) : [];
  res.locals.faq = id === 'help' ? helpFaq(locale) : faqItems(locale, t, id, params);
  res.locals.helpSections = id === 'help' ? publicHelp(locale) : [];
  // Етикетът на кампанията (SPEC 93) — само в адресите. Вътрешните връзки го носят само когато е изрично в
  // адреса (рекламата); сайтът, от който идва посетителят, отива само във връзката към регистрацията — иначе
  // всеки органичен посетител би разнасял „utm_source=www.google.com“ из сайта (SEO, 23.11.2026).
  const selfHost = new URL(base).hostname;
  const explicit = readCampaign(req.query, undefined, selfHost);
  const campaign = explicit ?? readCampaign({}, req.get('referer') ?? undefined, selfHost);
  const carried = campaignQuery(explicit);
  // Страницата зависи от Referer винаги (и без етикет — иначе общ кеш би дал варианта без етикет на всеки,
  // Кодаджията, 25.11.2026); с етикет — изобщо не се пази в общ кеш.
  res.vary('Referer');
  if (campaign) res.set('Cache-Control', 'private');
  res.locals.urls = Object.fromEntries(
    SITE_PAGES.map((page) => [
      page.id,
      carried ? `${page.paths[locale]}?${carried}` : page.paths[locale],
    ]),
  ) as Record<SitePageId, string>;
  res.locals.appUrls = {
    register: withQuery('/registraciya', locale, campaign),
    login: withQuery('/vhod', locale, null),
  };
  res.locals.demoChain = demoChain();
  res.locals.registrationOpen = config().REGISTRATION_OPEN;
  // „Какво ново“ (src/news/): дните с новините, датата на последната, емисията, версията.
  res.locals.newsDays = byDay(NEWS);
  res.locals.newsUpdated = LAST_UPDATE;
  res.locals.newsFeed = NEWS_FEED_PATHS[locale];
  res.locals.softwareVersion = SOFTWARE_VERSION;
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
  res.render(isLanding(id) ? 'site/landing' : `site/${id}`);
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
