import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import {
  HOME_FAQ,
  HOME_MODES,
  LEGAL_UPDATED,
  PRIVACY_SECTIONS,
  RETENTION,
  RULES,
  TERMS_VERSION,
  VIP_TERMS_SECTIONS,
  type PageId,
} from '../content.js';
import {
  BAN_CATEGORIES,
  RATIO_MIN_KILLS,
  SORT_KEYS,
  type Paged,
  type PublicBan,
  type Repo,
  type Season,
  type SortKey,
} from '../data/repo.js';
import { formattersFor } from '../format.js';
import { HEATMAP_WINDOW_DAYS } from '../heatmap.js';
import { translatorFor, type Locale, type Translator } from '../i18n.js';
import { ARENA, BOUNTY, XP_REWARDS, levelForXp } from '../levels.js';
import type { LiveSource, LiveStatus } from '../live.js';
import { logger } from '../logger.js';
import { MASTERY_TIERS } from '../mastery.js';
import {
  SITE_NAME,
  absolute,
  buildHead,
  fit,
  pagePath,
  withQuery,
  type Crumb,
  type JsonLdNode,
} from '../seo.js';
import { displayName, truncate } from '../steamid.js';
import { eventNodes, eventViews } from './event-seo.js';
import { matchListView } from './match-view.js';
import { renderPage, type NavId } from '../view.js';

export interface PageDeps {
  repo: Repo;
  live: LiveSource;
  now?: () => Date;
}

export const LEADERBOARD_PAGE_SIZE = 25;
export const BANS_PAGE_SIZE = 50;

/** Един елемент от query низа: масив (`?page=1&page=2`) → първият; всичко невалидно → липсва. */
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const intParam = (min: number, max: number) =>
  z.preprocess(first, z.coerce.number().int().min(min).max(max).optional()).catch(undefined);

export const leaderboardQuery = z.object({
  season: intParam(0, 1_000_000),
  sort: z.preprocess(first, z.enum(SORT_KEYS).optional()).catch(undefined),
  page: intParam(1, 1_000_000),
});

export const pageQuery = z.object({ page: intParam(1, 1_000_000) });

/** Аватарът се показва само от CDN-а на Steam по HTTPS — всичко друго в полето се пренебрегва. */
const AVATAR_HOSTS = new Set([
  'avatars.steamstatic.com',
  'avatars.akamai.steamstatic.com',
  'avatars.cloudflare.steamstatic.com',
  'avatars.fastly.steamstatic.com',
]);
export const AVATAR_ORIGINS = [...AVATAR_HOSTS].map((host) => `https://${host}`);

export function safeAvatar(url: string | null): string | null {
  if (!url) return null;
  const parsed = z.string().url().safeParse(url);
  if (!parsed.success) return null;
  try {
    const value = new URL(parsed.data);
    return value.protocol === 'https:' && AVATAR_HOSTS.has(value.hostname)
      ? value.toString()
      : null;
  } catch {
    return null;
  }
}

/** Граница: провал на един източник (базата) не сваля цялата начална страница. */
async function settle<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), label }, 'четене');
    return null;
  }
}

/** Заглавие/описание с име вътре: името се реже така, че целият низ да се побере в тавана. */
export function fitWithName(
  t: Translator,
  key: string,
  name: string,
  params: Record<string, string | number>,
  max: number,
): string {
  const full = t(key, { ...params, name });
  if ([...full].length <= max) return full;
  const overflow = [...full].length - max;
  const room = Math.max(4, [...name].length - overflow);
  return fit(t(key, { ...params, name: truncate(name, room) }), max);
}

function meta(t: Translator, page: PageId | 'player' | 'error') {
  return {
    title: t(`meta.${page}.title`),
    description: t(`meta.${page}.description`),
    keywords: t(`meta.${page}.keywords`),
  };
}

export function homeCrumb(t: Translator, locale: Locale): Crumb {
  return { name: t('nav.home'), path: pagePath(locale, 'home') };
}

/** Страница без собствени данни: само речник + head. */
function staticPage(
  locale: Locale,
  page: PageId,
  view: string,
  extra: (t: Translator) => Record<string, unknown> = () => ({}),
  pageType = 'WebPage',
) {
  return (_req: Request, res: Response) => {
    const t = translatorFor(locale);
    const head = buildHead({
      locale,
      ...meta(t, page),
      path: pagePath(locale, page),
      pathFor: (code) => pagePath(code, page),
      crumbs: [homeCrumb(t, locale), { name: t(`nav.${page}`), path: pagePath(locale, page) }],
      pageType,
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, view, locale, page, head, { ...extra(t) });
  };
}

function gameServerNode(locale: Locale, live: LiveStatus): JsonLdNode {
  return {
    '@type': 'GameServer',
    '@id': absolute('/#gameserver'),
    name: SITE_NAME,
    url: absolute(pagePath(locale, 'home')),
    game: { '@type': 'VideoGame', name: 'Counter-Strike 2' },
    // Статус се казва само когато е прочетен току-що (плъгинът или A2S от агента) — иначе
    // свойствата липсват.
    ...(live.known && live.online
      ? {
          serverStatus:
            live.maxPlayers > 0 && live.humans >= live.maxPlayers
              ? 'https://schema.org/OnlineFull'
              : 'https://schema.org/Online',
          playersOnline: live.humans,
        }
      : live.known
        ? { serverStatus: 'https://schema.org/OfflineTemporarily' }
        : {}),
  };
}

export function faqParams(): Record<string, string | number> {
  return {
    address: config().SERVER_ADDRESS,
    min: RATIO_MIN_KILLS,
  };
}

function faqNode(locale: Locale, t: Translator): JsonLdNode {
  const params = faqParams();
  return {
    '@type': 'FAQPage',
    '@id': `${absolute(pagePath(locale, 'home'))}#faq`,
    inLanguage: locale,
    mainEntity: HOME_FAQ.map((id) => ({
      '@type': 'Question',
      name: t(`home.faq.${id}.q`, params),
      acceptedAnswer: { '@type': 'Answer', text: t(`home.faq.${id}.a`, params) },
    })),
  };
}

export function pagesRouter(locale: Locale, deps: PageDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());

  router.use((_req, res, next) => {
    res.locals.locale = locale;
    res.locals.t = translatorFor(locale);
    next();
  });

  // ── Начало ────────────────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    // `/bg` → `/bg/`: един адрес на страница (canonical-ът е с наклонената черта).
    if (!req.originalUrl.split('?')[0]?.endsWith('/')) {
      res.redirect(301, pagePath(locale, 'home'));
      return;
    }
    const t = translatorFor(locale);
    const [live, season] = await Promise.all([
      deps.live.get(),
      settle('сезон', () => deps.repo.currentSeason()),
    ]);
    const [top, bans] = await Promise.all([
      season
        ? settle('топ 10', () =>
            deps.repo.leaderboard({ seasonId: season.id, sort: 'xp', page: 1, pageSize: 10 }),
          )
        : Promise.resolve(null),
      settle('последни банове', () => deps.repo.activeBans({ page: 1, pageSize: 5, now: now() })),
    ]);
    const matches = ((await settle('мачове', () => deps.repo.recentMatches(5))) ?? []).map((row) =>
      matchListView(row, t),
    );
    const events = eventViews(
      (await settle('събития', () => deps.repo.events(now()))) ?? [],
      locale,
      now(),
    );
    const head = buildHead({
      locale,
      ...meta(t, 'home'),
      path: pagePath(locale, 'home'),
      pathFor: (code) => pagePath(code, 'home'),
      crumbs: [homeCrumb(t, locale)],
      extraNodes: [
        gameServerNode(locale, live),
        faqNode(locale, t),
        ...eventNodes(events, locale, t),
      ],
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'home', locale, 'home', head, {
      live,
      season,
      top: top
        ? top.rows.map((row) => ({
            ...row,
            name: displayName(row.name, row.steamId),
            level: levelForXp(row.xp),
          }))
        : null,
      bans: bans
        ? bans.rows.map((ban) => ({ ...ban, targetName: displayName(ban.targetName, ban.steamId) }))
        : null,
      events,
      matches,
      timeZone: config().DISPLAY_TZ,
      faq: HOME_FAQ,
      faqParams: faqParams(),
      modes: HOME_MODES,
      xpRewards: XP_REWARDS,
      bounty: BOUNTY,
      arena: ARENA,
      masteryTiers: MASTERY_TIERS,
    });
  });

  // ── Класация ──────────────────────────────────────────────────────────────
  router.get('/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
    const t = translatorFor(locale);
    const query = leaderboardQuery.parse(req.query);
    const [current, seasons] = await Promise.all([deps.repo.currentSeason(), deps.repo.seasons()]);
    const seasonId = query.season ?? current.id;
    const season = seasons.find((s) => s.id === seasonId);
    if (!season) return next();
    const sort: SortKey = query.sort ?? 'xp';
    const page = query.page ?? 1;
    const result = await deps.repo.leaderboard({
      seasonId,
      sort,
      page,
      pageSize: LEADERBOARD_PAGE_SIZE,
    });
    if (page > 1 && page > result.pages) return next();

    const params = (overrides: { season?: number; sort?: SortKey; page?: number } = {}) => {
      const s = overrides.season ?? seasonId;
      const o = overrides.sort ?? sort;
      const p = overrides.page ?? page;
      return {
        season: s === current.id ? undefined : s,
        sort: o === 'xp' ? undefined : o,
        page: p > 1 ? p : undefined,
      };
    };
    const pathFor = (code: Locale) => withQuery(pagePath(code, 'leaderboard'), params());
    const head = buildHead({
      locale,
      ...meta(t, 'leaderboard'),
      path: pathFor(locale),
      pathFor,
      crumbs: [
        homeCrumb(t, locale),
        { name: t('nav.leaderboard'), path: pagePath(locale, 'leaderboard') },
      ],
      pageType: 'CollectionPage',
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'leaderboard', locale, 'leaderboard', head, {
      result: {
        ...result,
        rows: result.rows.map((row) => ({
          ...row,
          name: displayName(row.name, row.steamId),
          level: levelForXp(row.xp),
        })),
      },
      seasons,
      season,
      currentSeasonId: current.id,
      sort,
      sorts: SORT_KEYS,
      sortHref: (key: SortKey) =>
        withQuery(pagePath(locale, 'leaderboard'), params({ sort: key, page: 1 })),
      pageHref: (n: number) => withQuery(pagePath(locale, 'leaderboard'), params({ page: n })),
      minKills: RATIO_MIN_KILLS,
      xpRewards: XP_REWARDS,
      bounty: BOUNTY,
      arena: ARENA,
    });
  });

  // ── Банлист (noindex) ─────────────────────────────────────────────────────
  router.get('/bans', async (req: Request, res: Response, next: NextFunction) => {
    const t = translatorFor(locale);
    const page = pageQuery.parse(req.query).page ?? 1;
    const result: Paged<PublicBan> = await deps.repo.activeBans({
      page,
      pageSize: BANS_PAGE_SIZE,
      now: now(),
    });
    if (page > 1 && page > result.pages) return next();
    const pathFor = (code: Locale) =>
      withQuery(pagePath(code, 'bans'), { page: page > 1 ? page : undefined });
    const head = buildHead({
      locale,
      ...meta(t, 'bans'),
      path: pathFor(locale),
      pathFor,
      crumbs: [homeCrumb(t, locale), { name: t('nav.bans'), path: pagePath(locale, 'bans') }],
      noindex: true,
      pageType: 'CollectionPage',
      ogImageAlt: t('meta.ogAlt'),
    });
    res.set('X-Robots-Tag', 'noindex, follow');
    renderPage(res, 'bans', locale, 'bans', head, {
      // Изрично изброени полета: каквото не е тук, не стига до шаблона, дори репото да го върне.
      result: {
        ...result,
        rows: result.rows.map((ban) => ({
          steamId: ban.steamId,
          targetName: displayName(ban.targetName, ban.steamId),
          category: BAN_CATEGORIES.includes(ban.category) ? ban.category : 'OTHER',
          createdAt: ban.createdAt,
          expiresAt: ban.expiresAt,
        })),
      },
      pageHref: (n: number) => withQuery(pagePath(locale, 'bans'), { page: n > 1 ? n : undefined }),
    });
  });

  // ── VIP ───────────────────────────────────────────────────────────────────
  router.get('/vip', async (_req: Request, res: Response) => {
    const t = translatorFor(locale);
    const tiers = await deps.repo.vipTiers();
    const head = buildHead({
      locale,
      ...meta(t, 'vip'),
      path: pagePath(locale, 'vip'),
      pathFor: (code) => pagePath(code, 'vip'),
      crumbs: [homeCrumb(t, locale), { name: t('nav.vip'), path: pagePath(locale, 'vip') }],
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'vip', locale, 'vip', head, { tiers });
  });

  // ── Правила и правни страници ─────────────────────────────────────────────
  router.get(
    '/rules',
    staticPage(locale, 'rules', 'rules', () => ({ rules: RULES })),
  );
  router.get(
    '/privacy',
    staticPage(locale, 'privacy', 'privacy', () => ({
      sections: PRIVACY_SECTIONS,
      updated: LEGAL_UPDATED.privacy,
      params: legalParams(),
    })),
  );
  router.get(
    '/vip-terms',
    staticPage(locale, 'vipTerms', 'vip-terms', () => ({
      sections: VIP_TERMS_SECTIONS,
      updated: LEGAL_UPDATED.vipTerms,
      version: TERMS_VERSION,
      params: legalParams(),
    })),
  );
  router.get(
    '/imprint',
    staticPage(
      locale,
      'imprint',
      'imprint',
      () => ({ company: companyFields(), updated: LEGAL_UPDATED.imprint }),
      'AboutPage',
    ),
  );
  router.get(
    '/contact',
    staticPage(
      locale,
      'contact',
      'contact',
      () => ({ updated: LEGAL_UPDATED.contact }),
      'ContactPage',
    ),
  );

  return router;
}

/** Числата в правните текстове — от същите константи, които ползват задачите за чистене. */
export function legalParams(): Record<string, string | number> {
  const cfg = config();
  return {
    sessionsDays: RETENTION.sessionsDays,
    killsDays: RETENTION.killsDays,
    matchesDays: RETENTION.matchesDays,
    duelsDays: RETENTION.duelsDays,
    casesDays: RETENTION.casesDays,
    demosDays: RETENTION.demosDays,
    heatmapDays: HEATMAP_WINDOW_DAYS,
    site: cfg.PUBLIC_BASE_URL.replace(/^https?:\/\//, ''),
    company: cfg.COMPANY_LEGAL_NAME ?? 'Carbon Stealth VCC',
  };
}

/** Полетата на импресума: стойност от конфигурацията или null → „не е въведено“ на страницата. */
export function companyFields(): Array<{ id: string; value: string | null; env: string }> {
  const cfg = config();
  return [
    { id: 'legalName', value: cfg.COMPANY_LEGAL_NAME ?? null, env: 'COMPANY_LEGAL_NAME' },
    { id: 'address', value: cfg.COMPANY_ADDRESS ?? null, env: 'COMPANY_ADDRESS' },
    { id: 'eik', value: cfg.COMPANY_EIK ?? null, env: 'COMPANY_EIK' },
    { id: 'vat', value: cfg.COMPANY_VAT ?? null, env: 'COMPANY_VAT' },
    {
      id: 'representative',
      value: cfg.COMPANY_REPRESENTATIVE ?? null,
      env: 'COMPANY_REPRESENTATIVE',
    },
    { id: 'email', value: cfg.CONTACT_EMAIL ?? null, env: 'CONTACT_EMAIL' },
    { id: 'phone', value: cfg.COMPANY_PHONE ?? null, env: 'COMPANY_PHONE' },
  ];
}

export type { NavId, Season };
