import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { CONTENT_UPDATED, LEGAL_UPDATED } from '../company.js';
import { LOCALES } from '../i18n.js';
import { ROOT } from '../paths.js';
import { priceTable } from '../plans/pricing.js';
import { legalPath, PATHS } from '../seo/paths.js';

export const seoRouter: Router = Router();

/**
 * Публичното е витрината и правните страници; приложението, акаунтът и панелът са забранени за обхождане.
 * Входът, регистрацията и забравената парола НЕ са тук: те носят `noindex`, а търсачката го вижда само ако
 * може да отвори страницата. Връзките с токени (`/reset`, `/verify-email`) не се обхождат изобщо.
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
    path: (l: (typeof LOCALES)[number]) => string;
    priority: string;
    freq: string;
    updated: string;
  }> = [
    { path: (l) => PATHS[l], priority: '1.0', freq: 'weekly', updated: CONTENT_UPDATED },
    {
      path: (l) => legalPath(l, 'privacy'),
      priority: '0.3',
      freq: 'yearly',
      updated: LEGAL_UPDATED.privacy,
    },
    {
      path: (l) => legalPath(l, 'terms'),
      priority: '0.3',
      freq: 'yearly',
      updated: LEGAL_UPDATED.terms,
    },
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

/** llms.txt — кратко описание за AI търсачките, само с факти, които витрината също казва. */
seoRouter.get('/llms.txt', (_req, res) => {
  const base = config().PUBLIC_BASE_URL;
  // цените идват от ценоразписа — същия, от който смятат витрината, JSON-LD и заявките
  const eur = (cents: number) =>
    `EUR ${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
  const prices = priceTable();
  const terms = prices
    .filter((row) => row.months && row.months > 1)
    .map((row) => `${row.months} months ${eur(row.totalCents)} (-${row.discountPercent}%)`)
    .join(', ');
  const monthly = prices.find((row) => row.months === 1);
  const lifetime = prices.find((row) => row.id === 'lifetime');
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      [
        '# Rendetto by Carbon Stealth',
        '',
        '> Rendetto is browser software for designing panel furniture in 3D. From one project it produces the cut list with edge banding, the hardware list, assembly drawings, a drilling map for every part (hinge cups, mounting plates, handles, drawer slides) and CNC files: layered DXF and G-code (ISO/Fanuc style and GRBL). Every new account gets a 30-day trial.',
        '',
        '## Pages',
        `- [Rendetto (Български)](${base}/): product, prices, questions`,
        `- [Rendetto (English)](${base}/en/): product, prices, questions`,
        `- [Rendetto (Italiano)](${base}/it/): prodotto, prezzi, domande`,
        `- [Privacy policy](${base}/en/privacy) ([BG](${base}/privacy), [IT](${base}/it/privacy))`,
        `- [Terms of use](${base}/en/terms) ([BG](${base}/terms), [IT](${base}/it/terms))`,
        '',
        '## Facts',
        `- Price: ${eur(monthly?.totalCents ?? 0)} per month excluding VAT; ${terms}; lifetime ${eur(lifetime?.totalCents ?? 0)} (2.5 times the yearly price without the 12-month discount).`,
        '- After the trial ends, existing projects stay available for download; creating or changing projects needs Premium or Lifetime.',
        "- Hinge drilling follows the manufacturers' documents: Blum CLIP top, Hettich Sensys, GTV and Salice Series 200. Drawer slides: GTV H45 PRESTIGE, Blum TANDEM 560H and Blum MOVENTO 760H.",
        '- Languages: the website, account and admin pages are in Bulgarian, English and Italian; the editor, drawings and CSV tables are in Bulgarian for now.',
        '',
        '## Company',
        '- [Carbon Stealth VCC](https://carbonstealth.eu)',
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
