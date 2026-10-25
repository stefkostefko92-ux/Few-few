import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { CUP, addDays, cupWeek, type CupWeek } from '../cup.js';
import { formattersFor } from '../format.js';
import { translatorFor, type Locale, type Translator } from '../i18n.js';
import { absolute, buildHead, pagePath, type JsonLdNode } from '../seo.js';
import { renderPage } from '../view.js';
import { homeCrumb, type PageDeps } from './pages.js';

/**
 * Седмичната купа (CONTRACT §17): `/{език}/cup` — първите 20 на текущата седмица (кратък кеш), колко остава и
 * последните 8 победители. JSON-LD: страницата + `Event` за текущата седмица (онлайн, безплатно).
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Обядът по UTC на местната дата — показва се като същата дата във всяка зона ±11 ч. */
const noonOf = (day: string) => new Date(`${day}T12:00:00Z`);

export function weekRange(key: string): { from: Date; to: Date } {
  return { from: noonOf(key), to: noonOf(addDays(key, 6)) };
}

export function timeLeft(week: CupWeek, now: Date): { days: number; hours: number } {
  const left = Math.max(0, week.end.getTime() - now.getTime());
  return { days: Math.floor(left / DAY_MS), hours: Math.floor((left % DAY_MS) / HOUR_MS) };
}

function weekEvent(
  week: CupWeek,
  locale: Locale,
  t: Translator,
  range: { from: string; to: string },
): JsonLdNode {
  const page = absolute(pagePath(locale, 'cup'));
  return {
    '@type': 'Event',
    '@id': `${page}#week-${week.key}`,
    name: t('cup.ld.name', range),
    description: t('cup.ld.description', { podium: CUP.podium }),
    startDate: week.start.toISOString(),
    endDate: week.end.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: page },
    organizer: { '@id': absolute('/#organization') },
    image: absolute('/static/og.png'),
    isAccessibleForFree: true,
    inLanguage: locale,
  };
}

export function cupRouter(locale: Locale, deps: PageDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());

  router.get('/cup', async (_req: Request, res: Response) => {
    const t = translatorFor(locale);
    const timeZone = config().DISPLAY_TZ;
    const fmt = formattersFor(locale, timeZone);
    const at = now();
    const week = cupWeek(at, timeZone);
    const [standings, winners] = await Promise.all([
      deps.repo.cupStandings(week, CUP.top),
      deps.repo.cupWinners(CUP.winners),
    ]);
    const range = weekRange(week.key);
    const path = pagePath(locale, 'cup');
    const head = buildHead({
      locale,
      title: t('meta.cup.title'),
      description: t('meta.cup.description'),
      keywords: t('meta.cup.keywords'),
      path,
      pathFor: (code) => pagePath(code, 'cup'),
      crumbs: [homeCrumb(t, locale), { name: t('nav.cup'), path }],
      pageType: 'CollectionPage',
      extraNodes: [
        weekEvent(week, locale, t, { from: fmt.date(range.from), to: fmt.date(range.to) }),
      ],
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'cup', locale, 'cup', head, {
      week: range,
      left: timeLeft(week, at),
      standings,
      winners: winners.map((winner) => ({ ...winner, ...weekRange(winner.week) })),
      podium: CUP.podium,
    });
  });

  return router;
}
