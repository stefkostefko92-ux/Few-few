import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import {
  CONTENT_UPDATED,
  HOME_FAQ,
  LEGAL_UPDATED,
  NOINDEX_PAGES,
  PAGES,
  PAGE_SLUG,
  RETENTION,
  type PageId,
} from '../content.js';
import type { Repo } from '../data/repo.js';
import { LOCALES, localeFromHeader, translate, type Locale } from '../i18n.js';
import { XP_REWARDS } from '../levels.js';
import { logger } from '../logger.js';
import { SITE_NAME, absolute, alternatesFor, pagePath, playerPath } from '../seo.js';
import { parseSteamId } from '../steamid.js';
import { PUBLIC_DIR } from '../view.js';
import { faqParams, legalParams } from './pages.js';

/** Колко профила на играчи влизат в sitemap — само върхът на класацията за всички времена. */
export const SITEMAP_PLAYERS = 50;

/**
 * Ключът за IndexNow НЕ е тайна — публичен знак за собственост, който търсачката чете от сайта.
 * Протоколът го иска на `/<ключ>.txt`; `tools/seo/indexnow.mjs` го търси и на `/indexnow-key.txt`.
 */
export const INDEXNOW_KEY = readFileSync(join(PUBLIC_DIR, 'indexnow-key.txt'), 'utf8').trim();

const LASTMOD: Record<PageId, string> = {
  home: CONTENT_UPDATED,
  leaderboard: CONTENT_UPDATED,
  bans: CONTENT_UPDATED,
  vip: CONTENT_UPDATED,
  rules: LEGAL_UPDATED.rules,
  privacy: LEGAL_UPDATED.privacy,
  vipTerms: LEGAL_UPDATED.vipTerms,
  imprint: LEGAL_UPDATED.imprint,
  contact: LEGAL_UPDATED.contact,
};

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function urlEntry(pathFor: (locale: Locale) => string, lastmod: string, priority: string) {
  const links = alternatesFor(pathFor)
    .map(
      (alt) =>
        `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${xmlEscape(alt.href)}"/>`,
    )
    .join('\n');
  return LOCALES.map((locale) =>
    [
      '  <url>',
      `    <loc>${xmlEscape(absolute(pathFor(locale)))}</loc>`,
      links,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n'),
  );
}

/** Езикът за пренасочване на адрес без език: от `Accept-Language`, иначе български. */
function detected(req: Request): Locale {
  return localeFromHeader(req.get('accept-language'));
}

function redirectLocalized(req: Request, res: Response, path: (locale: Locale) => string) {
  const search = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';
  res.vary('Accept-Language');
  res.redirect(302, `${path(detected(req))}${search}`);
}

export function rootRouter(repo: Repo): Router {
  const router = Router();

  router.get('/', (req, res) => redirectLocalized(req, res, (locale) => pagePath(locale, 'home')));

  // Адресите без език: плъгинът изписва „cs2.carbonstealth.eu/bans“ в съобщението за бан.
  for (const page of PAGES) {
    const slug = PAGE_SLUG[page];
    if (!slug) continue;
    router.get(`/${slug}`, (req, res) => redirectLocalized(req, res, (l) => pagePath(l, page)));
  }
  router.get('/player/:steamId', (req, res, next) => {
    const steamId = parseSteamId(req.params.steamId);
    if (!steamId) return next();
    redirectLocalized(req, res, (locale) => playerPath(locale, steamId));
  });

  router.get('/favicon.ico', (_req, res) => res.redirect(301, '/static/favicon.svg'));

  router.get('/robots.txt', (_req, res) => {
    res
      .type('text/plain')
      .send(
        [
          'User-agent: *',
          'Allow: /',
          'Disallow: /health',
          '',
          `Sitemap: ${absolute('/sitemap.xml')}`,
          '',
        ].join('\n'),
      );
  });

  router.get('/sitemap.xml', async (_req, res) => {
    const [players, statsUpdated] = await Promise.all([
      repo.sitemapPlayers(SITEMAP_PLAYERS).catch((error: unknown) => {
        logger.error({ err: String(error) }, 'sitemap: играчите не се прочетоха');
        return [];
      }),
      repo.lastStatsUpdate().catch(() => null),
    ]);
    const live = statsUpdated ? statsUpdated.toISOString().slice(0, 10) : CONTENT_UPDATED;
    const latest = (a: string, b: string) => (a > b ? a : b);
    const entries: string[] = [];
    for (const page of PAGES) {
      if (NOINDEX_PAGES.has(page)) continue;
      const dynamic = page === 'home' || page === 'leaderboard';
      const lastmod = dynamic ? latest(live, LASTMOD[page]) : LASTMOD[page];
      const priority = page === 'home' ? '1.0' : page === 'leaderboard' ? '0.9' : '0.5';
      entries.push(...urlEntry((locale) => pagePath(locale, page), lastmod, priority));
    }
    for (const player of players) {
      entries.push(
        ...urlEntry(
          (locale) => playerPath(locale, player.steamId),
          player.updatedAt.toISOString().slice(0, 10),
          '0.6',
        ),
      );
    }
    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`,
      );
  });

  router.get(['/indexnow-key.txt', `/${INDEXNOW_KEY}.txt`], (_req, res) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });

  /** За четящите модели (GEO): какво е сървърът, как се влиза и къде е важното — в прав текст. */
  router.get('/llms.txt', (_req, res) => {
    const en = (key: string, params: Record<string, string | number> = {}) =>
      translate('en', key, params);
    const faq = faqParams();
    const legal = legalParams();
    const lines = [
      `# ${SITE_NAME}`,
      '',
      `> ${en('meta.home.description')}`,
      '',
      en('home.lead'),
      '',
      '## Join',
      `- Steam: steam://connect/${config().SERVER_ADDRESS}`,
      `- CS2 console: connect ${config().SERVER_ADDRESS}`,
      '',
      '## XP per kill',
      ...XP_REWARDS.map(
        (reward) => `- ${en(`leaderboard.how.rewards.${reward.id}`)}: ${reward.xp}`,
      ),
      `- ${en('leaderboard.how.level')}`,
      '',
      '## FAQ',
      ...HOME_FAQ.map((id) => `- ${en(`home.faq.${id}.q`, faq)} ${en(`home.faq.${id}.a`, faq)}`),
      '',
      '## Data and privacy',
      `- ${en('privacy.sections.retention.items.0', legal)}`,
      `- ${en('privacy.sections.retention.items.1', legal)}`,
      `- ${en('privacy.sections.retention.items.2', legal)}`,
      `- ${en('privacy.sections.website.items.0', legal)}`,
      `- Retention days: sessions ${RETENTION.sessionsDays}, kills ${RETENTION.killsDays}, demos ${RETENTION.demosDays}`,
      '',
      '## Pages',
      ...PAGES.filter((page) => !NOINDEX_PAGES.has(page)).flatMap((page) =>
        LOCALES.map(
          (locale) => `- ${en(`nav.${page}`)} (${locale}): ${absolute(pagePath(locale, page))}`,
        ),
      ),
      '',
      '## Publisher',
      '- Carbon Stealth VCC: https://carbonstealth.eu',
      '',
    ];
    res.type('text/plain').send(lines.join('\n'));
  });

  return router;
}
