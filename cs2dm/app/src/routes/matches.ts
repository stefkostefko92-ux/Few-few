import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config.js';
import { formatMultiplier } from '../events.js';
import { formattersFor } from '../format.js';
import { translatorFor, type Locale, type Translator } from '../i18n.js';
import { weaponLabel } from '../mastery.js';
import { DESCRIPTION_MAX, TITLE_MAX, buildHead, matchPath, pagePath, type Crumb } from '../seo.js';
import { renderPage } from '../view.js';
import { decimalSeparator } from './event-seo.js';
import { highlightsView, matchListView, matchMinutes } from './match-view.js';
import { fitWithName, type PageDeps } from './pages.js';

/**
 * Картите на мачовете (CONTRACT §13): `/{език}/matches` — последните 30, и `/{език}/match/:id` — един
 * мач. Скритите играчи (чл. 21 GDPR) идват от репото без име и SteamID → „скрит играч“, без линк.
 */
export const MATCHES_LIST_SIZE = 30;
/** Само цифри, без водеща нула — иначе 404 без заявка към базата. */
export const MATCH_ID = /^[1-9]\d{0,9}$/;

function crumbs(t: Translator, locale: Locale): Crumb[] {
  return [
    { name: t('nav.home'), path: pagePath(locale, 'home') },
    { name: t('nav.matches'), path: pagePath(locale, 'matches') },
  ];
}

export function matchesRouter(locale: Locale, deps: PageDeps): Router {
  const router = Router();

  router.get('/matches', async (_req: Request, res: Response) => {
    const t = translatorFor(locale);
    const rows = await deps.repo.recentMatches(MATCHES_LIST_SIZE);
    const head = buildHead({
      locale,
      title: t('meta.matches.title'),
      description: t('meta.matches.description'),
      keywords: t('meta.matches.keywords'),
      path: pagePath(locale, 'matches'),
      pathFor: (code) => pagePath(code, 'matches'),
      crumbs: crumbs(t, locale),
      pageType: 'CollectionPage',
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'matches', locale, 'matches', head, {
      rows: rows.map((row) => matchListView(row, t)),
    });
  });

  router.get('/match/:id', async (req: Request, res: Response, next: NextFunction) => {
    const raw = typeof req.params.id === 'string' ? req.params.id : '';
    if (!MATCH_ID.test(raw)) return next();
    const [match, highlights] = await Promise.all([
      deps.repo.match(Number(raw)),
      deps.repo.matchHighlights(Number(raw)),
    ]);
    if (!match) return next();
    const t = translatorFor(locale);
    const fmt = formattersFor(locale, config().DISPLAY_TZ);
    const first = match.rows[0];
    const topName = first ? (first.name ?? t('match.hiddenPlayer')) : '—';
    const params = {
      id: match.id,
      map: match.map,
      date: fmt.date(match.endedAt),
      kills: fmt.int(match.kills),
      players: fmt.int(match.players),
      topKills: fmt.int(first?.kills ?? 0),
    };
    const path = matchPath(locale, match.id);
    const head = buildHead({
      locale,
      title: fitWithName(t, 'meta.match.title', topName, params, TITLE_MAX),
      description: fitWithName(t, 'meta.match.description', topName, params, DESCRIPTION_MAX),
      keywords: t('meta.match.keywords'),
      path,
      pathFor: (code) => matchPath(code, match.id),
      crumbs: [...crumbs(t, locale), { name: t('match.h1', { id: match.id }), path }],
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'match', locale, 'match', head, {
      match: {
        ...match,
        minutes: matchMinutes(match),
        multiplier:
          match.xpTenths > 10 ? formatMultiplier(match.xpTenths, decimalSeparator(locale)) : null,
        eventTitle: match.event ? match.event[locale] : null,
        rows: match.rows.map((row) => ({
          ...row,
          name: row.name ?? t('match.hiddenPlayer'),
          weapon: row.topWeapon ? weaponLabel(row.topWeapon) : null,
        })),
      },
      highlights: highlights ? highlightsView(highlights, t, locale) : null,
    });
  });

  return router;
}
