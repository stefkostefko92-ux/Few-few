import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { COMPANY, CONTENT_UPDATED, LEGAL_UPDATED } from '../company.js';
import { LOCALE_LABEL, LOCALES, translate, type Locale } from '../i18n.js';
import { ROOT } from '../paths.js';
import { TRIAL_DAYS } from '../plans/plan.js';
import { lifetimeRuleParams, priceTable, VAT_BG_PERCENT } from '../plans/pricing.js';
import { WITHDRAWAL_DAYS } from '../plans/withdrawal.js';
import { LEGAL, legalPath, PATHS, type LegalPage } from '../seo/paths.js';

export const seoRouter: Router = Router();

/**
 * Публичното е витрината и правните страници; приложението, акаунтът и панелът са забранени за обхождане.
 * Входът, регистрацията и забравената парола НЕ са тук: те носят `noindex`, а търсачката го вижда само ако
 * може да отвори страницата. Връзките с токени (`/reset`, `/verify-email`) не се обхождат изобщо.
 * `Disallow` сравнява по началото на адреса — `/app` хваща и `/apple-touch-icon.png`, затова иконката
 * е разрешена изрично (по-дългото правило печели).
 */
seoRouter.get('/robots.txt', (_req, res) => {
  const base = config().PUBLIC_BASE_URL;
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Allow: /apple-touch-icon.png',
        'Disallow: /app',
        'Disallow: /account',
        'Disallow: /admin',
        'Disallow: /reset',
        'Disallow: /verify-email',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        '',
      ].join('\n'),
    );
});

seoRouter.get('/sitemap.xml', (_req, res) => {
  const base = config().PUBLIC_BASE_URL;
  const pages: Array<{
    path: (l: Locale) => string;
    priority: string;
    freq: string;
    updated: string;
  }> = [
    { path: (l) => PATHS[l], priority: '1.0', freq: 'weekly', updated: CONTENT_UPDATED },
    // правните страници — от същия списък, от който се правят и маршрутите им
    ...LEGAL.map((page) => ({
      path: (l: Locale) => legalPath(l, page),
      priority: '0.3',
      freq: 'yearly',
      updated: LEGAL_UPDATED[page],
    })),
  ];
  const urls = pages.flatMap((page) =>
    LOCALES.map((locale) => {
      const links = [
        ...LOCALES.map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${alt}" href="${base}${page.path(alt)}"/>`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${base}${page.path('bg')}"/>`,
      ].join('\n');
      return `  <url>\n    <loc>${base}${page.path(locale)}</loc>\n    <lastmod>${page.updated}</lastmod>\n    <changefreq>${page.freq}</changefreq>\n    <priority>${page.priority}</priority>\n${links}\n  </url>`;
    }),
  );
  res
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`,
    );
});

/** Адресите в llms.txt идват от `seo/paths.ts`, както в sitemap — тук са само надписите им. */
const LLMS_LANDING_NOTE: Record<Locale, string> = {
  bg: 'product, prices, questions',
  en: 'product, prices, questions',
  it: 'prodotto, prezzi, domande',
};
const LLMS_LEGAL_TITLE: Record<LegalPage, string> = {
  privacy: 'Privacy policy',
  terms: 'Terms and conditions',
};

/** llms.txt — кратко описание за AI търсачките, само с факти, които витрината също казва. */
seoRouter.get('/llms.txt', (_req, res) => {
  const base = config().PUBLIC_BASE_URL;
  const en = (key: string) => translate('en', key);
  // цените идват от ценоразписа — същия, от който смятат витрината, JSON-LD и заявките
  const eur = (cents: number) =>
    `EUR ${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
  const prices = priceTable();
  const terms = prices
    .filter((row) => row.months && row.months > 1)
    .map(
      (row) =>
        `${row.months} months ${eur(row.totalWithVatCents)} incl. VAT, ${eur(row.totalCents)} excl. VAT (-${row.discountPercent}%)`,
    )
    .join('; ');
  const monthly = prices.find((row) => row.months === 1);
  const lifetime = prices.find((row) => row.id === 'lifetime');
  const rule = lifetimeRuleParams('en');
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      [
        '# Korpora by Carbon Stealth',
        '',
        `> Korpora is browser software for designing panel furniture in 3D. From one project it produces the cut list with edge banding, the hardware list, assembly drawings, a drilling map for every part (hinge cups, mounting plates, handles, drawer slides) and CNC files: layered DXF and G-code (ISO/Fanuc style and GRBL). Every new account gets a ${TRIAL_DAYS}-day trial, starting when the email is confirmed.`,
        '',
        '## Pages',
        ...LOCALES.map(
          (l) => `- [Korpora (${LOCALE_LABEL[l]})](${base}${PATHS[l]}): ${LLMS_LANDING_NOTE[l]}`,
        ),
        ...LEGAL.map(
          (page) =>
            `- [${LLMS_LEGAL_TITLE[page]}](${base}${legalPath('en', page)}) ([BG](${base}${legalPath('bg', page)}), [IT](${base}${legalPath('it', page)}))`,
        ),
        '',
        '## Facts',
        `- Status: ${translate('en', 'landing.faq.beta.a', { contact: config().CONTACT_EMAIL })}`,
        `- Price for consumers (incl. ${VAT_BG_PERCENT}% Bulgarian VAT): ${eur(monthly?.totalWithVatCents ?? 0)} per month (${eur(monthly?.totalCents ?? 0)} excl. VAT); ${terms}; Lifetime ${eur(lifetime?.totalWithVatCents ?? 0)} (${eur(lifetime?.totalCents ?? 0)} excl. VAT), ${rule.multiple} times the yearly price without the ${rule.months}-month discount, valid for as long as Korpora is offered. Plans do not renew automatically.`,
        `- Ordering: from the account, with an order button that states the obligation to pay; payment by bank transfer against an invoice. Consumers may withdraw within ${WITHDRAWAL_DAYS} days with the "Withdraw from contract here" button.`,
        '- After the trial ends, existing projects stay available for download; creating or changing projects needs Premium or Lifetime.',
        "- Hinge drilling follows the manufacturers' documents: Blum CLIP top, Hettich Sensys, GTV and Salice Series 200. Drawer slides: GTV H45 PRESTIGE, Blum TANDEM 560H and Blum MOVENTO 760H.",
        '- Languages: the website, account and admin pages are in Bulgarian, English and Italian; the editor, drawings and CSV tables are in Bulgarian for now.',
        '',
        '## Company',
        `- [${COMPANY.name}](${COMPANY.url}) (in Bulgarian: ${COMPANY.nameBg}), ${en('company.legalForm')}, company number (EIK) ${COMPANY.eik}, VAT number ${COMPANY.vat}; ${en('company.street')}, ${COMPANY.postalCode} ${en('company.city')}, ${en('company.country')}; phone ${COMPANY.phone}`,
        '',
      ].join('\n'),
    );
});

/**
 * IndexNow: ключът е публичен по замисъл — търсачката го чете от сайта, за да повярва, че известието за
 * нова страница идва от собственика. `tools/seo/indexnow.mjs` го търси на `/indexnow-key.txt`.
 */
const INDEXNOW_KEY = readFileSync(join(ROOT, 'public', 'indexnow-key.txt'), 'utf8').trim();
seoRouter.get(['/indexnow-key.txt', `/${INDEXNOW_KEY}.txt`], (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(INDEXNOW_KEY);
});

/**
 * Иконите в корена: браузърите и търсачките ги искат на тези адреси и без `<link>`. Google Search не
 * приема SVG за иконка — ICO и PNG се правят от емблемата в логото със `scripts/brand.mjs`.
 * Файлът се дава спрямо `root`: с пълен път `send` отказва (404) всеки път с папка, започваща с точка
 * (`/srv/.releases/…`), защото проверява за „скрити“ файлове целия път, не само името.
 */
const IMG = { root: join(ROOT, 'public', 'img') };
const ICON_CACHE = 'public, max-age=604800';
seoRouter.get('/favicon.ico', (_req, res) => {
  res.type('image/x-icon').set('Cache-Control', ICON_CACHE).sendFile('favicon.ico', IMG);
});
seoRouter.get('/apple-touch-icon.png', (_req, res) => {
  res.type('image/png').set('Cache-Control', ICON_CACHE).sendFile('apple-touch-icon.png', IMG);
});
/** Иконите на манифеста са в `/static` (кеш 30 дни, immutable): нова икона трябва да смени адреса. */
seoRouter.get('/site.webmanifest', (_req, res) => {
  res
    .type('application/manifest+json')
    .set('Cache-Control', 'public, max-age=86400')
    .send(
      JSON.stringify({
        name: 'Korpora',
        short_name: 'Korpora',
        start_url: '/',
        display: 'browser',
        background_color: '#f6f7f1',
        theme_color: '#f6f7f1',
        icons: [192, 512].map((size) => ({
          src: `/static/img/icon-${size}.png?v=${String(res.locals.v)}`,
          sizes: `${size}x${size}`,
          type: 'image/png',
        })),
      }),
    );
});
