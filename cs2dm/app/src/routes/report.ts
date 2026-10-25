import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config.js';
import { RETENTION } from '../content.js';
import { BASELINE_DAYS } from '../data/match-analytics.js';
import { formattersFor } from '../format.js';
import { HEATMAP_DELAY_MS, hottestSector, renderHeatmapSvg } from '../heatmap.js';
import { MULTI_KILL_GAP_MS, formatOffset } from '../highlights.js';
import { LOCALE_TAG, translatorFor, type Locale } from '../i18n.js';
import { weaponLabel } from '../mastery.js';
import { DESCRIPTION_MAX, TITLE_MAX, buildHead, matchPath, pagePath, reportPath } from '../seo.js';
import { parseSteamId } from '../steamid.js';
import { renderPage } from '../view.js';
import { MATCH_ID } from './matches.js';
import { fitWithName, homeCrumb, type PageDeps } from './pages.js';
import { COMPARE_DIGITS, compareWithBaseline, type CompareMetric } from './report-view.js';

/**
 * Личният отчет на играч за един мач (CONTRACT §13): `/{език}/match/:id/player/:steamId64`. Само от
 * `match_players` и убийствата между хора в прозореца на мача; скрит играч (чл. 21 GDPR) → 404. Картата
 * на смъртите е по правилата на §4 (наша решетка, 32 px) и излиза час след края на мача. Страницата е
 * `noindex` — тънка и твърде много на брой за индекса; профилът и мачът са каноничните.
 */
export function reportRouter(locale: Locale, deps: PageDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());
  const tag = LOCALE_TAG[locale];
  const numbers = (digits: number) =>
    new Intl.NumberFormat(tag, {
      minimumFractionDigits: digits === 2 ? 2 : 0,
      maximumFractionDigits: digits,
    });
  const signed = (digits: number) =>
    new Intl.NumberFormat(tag, {
      signDisplay: 'exceptZero',
      minimumFractionDigits: digits === 2 ? 2 : 0,
      maximumFractionDigits: digits,
    });
  const percent = new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  router.get(
    '/match/:id/player/:steamId',
    async (req: Request, res: Response, next: NextFunction) => {
      const raw = typeof req.params.id === 'string' ? req.params.id : '';
      const steamId = parseSteamId(req.params.steamId);
      if (!MATCH_ID.test(raw) || !steamId) return next();
      const id = Number(raw);
      const report = await deps.repo.matchReport(id, steamId);
      if (!report) return next();
      const t = translatorFor(locale);
      const fmt = formattersFor(locale, config().DISPLAY_TZ);
      const { match, row, name } = report;

      // Ножовете и синонимите са едно оръжие — сливат се по показното име (като майсторството).
      const merged = new Map<string, { label: string; kills: number; headshots: number }>();
      for (const line of report.weapons) {
        const label = weaponLabel(line.weapon);
        const found = merged.get(label);
        if (found) {
          found.kills += line.kills;
          found.headshots += line.headshots;
        } else merged.set(label, { label, kills: line.kills, headshots: line.headshots });
      }
      const weapons = [...merged.values()].sort(
        (a, b) => b.kills - a.kills || a.label.localeCompare(b.label),
      );

      const multiKills = report.multiKills.map((run) => ({
        kind: t('highlights.multi.kind', { kills: run.kills }),
        time: formatOffset(run.offsetMs),
        weapons: [...new Set(run.weapons.map(weaponLabel))].join(', '),
      }));

      const show = (id: CompareMetric, value: number | null) =>
        value === null
          ? '—'
          : id === 'hs'
            ? percent.format(value / 100)
            : numbers(COMPARE_DIGITS[id]).format(value);
      const compare = report.baseline
        ? {
            matches: report.baseline.matches,
            rows: compareWithBaseline(row, report.baseline).map((line) => ({
              id: line.id,
              value: show(line.id, line.value),
              average: show(line.id, line.average),
              delta:
                line.delta === null
                  ? '—'
                  : line.id === 'hs'
                    ? t('report.compare.points', { value: signed(1).format(line.delta) })
                    : signed(COMPARE_DIGITS[line.id]).format(line.delta),
              tone: line.tone,
            })),
          }
        : null;

      // §4: никога позиции на живо — картата на смъртите излиза час след края на мача.
      const heatReady = match.endedAt.getTime() <= now().getTime() - HEATMAP_DELAY_MS;
      const deathsTotal = report.deathCells.reduce((sum, cell) => sum + cell.n, 0);
      const deathsSector = hottestSector(report.deathCells);
      const heat = {
        ready: heatReady,
        total: deathsTotal,
        sector: deathsSector,
        svg:
          heatReady && deathsTotal > 0
            ? renderHeatmapSvg({
                id: 'hm-match-deaths',
                kind: 'deaths',
                cells: report.deathCells,
                title: t('report.heat.title'),
                description: t.plural('report.heat.desc', deathsTotal, {
                  sector: deathsSector ?? '—',
                }),
              })
            : null,
      };

      const params = {
        id: match.id,
        map: match.map,
        date: fmt.date(match.endedAt),
        kills: fmt.int(row.kills),
        deaths: fmt.int(row.deaths),
        kd: fmt.kd(row.kills, row.deaths),
        hs: fmt.percent(row.headshots, row.kills),
        place: row.place,
        players: fmt.int(match.players),
      };
      const path = reportPath(locale, match.id, steamId);
      const matchUrl = matchPath(locale, match.id);
      const head = buildHead({
        locale,
        title: fitWithName(t, 'meta.report.title', name, params, TITLE_MAX),
        description: fitWithName(t, 'meta.report.description', name, params, DESCRIPTION_MAX),
        keywords: t('meta.report.keywords'),
        path,
        pathFor: (code) => reportPath(code, match.id, steamId),
        crumbs: [
          homeCrumb(t, locale),
          { name: t('nav.matches'), path: pagePath(locale, 'matches') },
          { name: t('match.h1', { id: match.id }), path: matchUrl },
          { name, path },
        ],
        ogImageAlt: t('meta.ogAlt'),
        noindex: true,
      });
      res.set('X-Robots-Tag', 'noindex, follow');
      renderPage(res, 'report', locale, 'match', head, {
        report: { match, row, name, steamId, recorded: report.recorded },
        params,
        weapons,
        multiKills,
        compare,
        heat,
        heatDelayHours: HEATMAP_DELAY_MS / 3_600_000,
        baselineDays: BASELINE_DAYS,
        retentionDays: RETENTION.matchesDays,
        multiGapSeconds: MULTI_KILL_GAP_MS / 1000,
      });
    },
  );

  return router;
}
