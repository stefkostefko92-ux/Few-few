import { LOCALE_TAG } from '../../i18n.js';
import { reportPath } from '../../seo.js';
import { displayName } from '../../steamid.js';
import type { AdminCtx, AdminRoute } from '../context.js';
import { FLAG_MATCH_LINKS, flagWindow, loadFlagInputs, loadFlagMatches } from '../flags-data.js';
import {
  FLAG_BASELINE_DAYS,
  FLAG_FLOORS,
  FLAG_MIN_KILLS,
  FLAG_MIN_MINUTES,
  FLAG_MIN_POPULATION,
  FLAG_PERCENTILE,
  FLAG_SPIKE_RATIO,
  FLAG_WINDOW_DAYS,
  LONG_NOSCOPE_METERS,
  scoreFlags,
  type FlagMetric,
} from '../flags.js';
import { adminLocale, renderAdmin } from '../render.js';

/**
 * „Подозрителни играчи“ (ADMIN+) — само за човешки преглед: списъкът се смята при отваряне, нищо не се
 * записва и нищо не се наказва автоматично (чл. 22 GDPR). Действие = обичайният ред (профил → наказание).
 */
export function flagRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/flags',
      cap: 'flags',
      handle: async (req, res) => {
        const now = ctx.now();
        const report = scoreFlags(await loadFlagInputs(ctx.db, now));
        const matches = await loadFlagMatches(
          ctx.db,
          report.flagged.filter((player) => !player.hidden).map((player) => player.steamId),
          now,
        );
        const locale = adminLocale(req, res);
        const share = new Intl.NumberFormat(LOCALE_TAG[locale], {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
        const rate = new Intl.NumberFormat(LOCALE_TAG[locale], {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const show = (id: FlagMetric, value: number | null) =>
          value === null ? '—' : id === 'kpm' ? rate.format(value) : share.format(value);
        renderAdmin(req, res, 'flags', {
          current: 'flags',
          window: flagWindow(now),
          population: report.population,
          players: report.flagged.map((player) => ({
            steamId: player.steamId,
            name: displayName(player.name, player.steamId),
            hidden: player.hidden,
            kills: player.kills,
            minutesRounded: Math.round(player.minutes),
            reasons: player.reasons,
            rows: player.metrics.map((metric) => ({
              id: metric.id,
              value: show(metric.id, metric.value),
              percentile: metric.percentile === null ? null : Math.round(metric.percentile * 100),
              baseline: show(metric.id, metric.baseline),
              outlier: metric.outlier,
              spike: metric.spike,
            })),
            reports: (matches.get(player.steamId) ?? []).map((id) => ({
              id,
              href: reportPath(locale, id, player.steamId),
            })),
          })),
          rules: {
            windowDays: FLAG_WINDOW_DAYS,
            baselineFrom: FLAG_WINDOW_DAYS + 1,
            baselineTo: FLAG_BASELINE_DAYS,
            minKills: FLAG_MIN_KILLS,
            minMinutes: FLAG_MIN_MINUTES,
            minPopulation: FLAG_MIN_POPULATION,
            percentile: Math.round(FLAG_PERCENTILE * 100),
            spike: new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: 1 }).format(
              FLAG_SPIKE_RATIO,
            ),
            longMeters: LONG_NOSCOPE_METERS,
            matchLinks: FLAG_MATCH_LINKS,
            floorText: {
              hs: show('hs', FLAG_FLOORS.hs),
              wallbang: show('wallbang', FLAG_FLOORS.wallbang),
              smoke: show('smoke', FLAG_FLOORS.smoke),
              blind: show('blind', FLAG_FLOORS.blind),
              longNoscope: show('longNoscope', FLAG_FLOORS.longNoscope),
              kpm: show('kpm', FLAG_FLOORS.kpm),
              meters: LONG_NOSCOPE_METERS,
            },
          },
        });
      },
    },
  ];
}
