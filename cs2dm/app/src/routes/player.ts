import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config.js';
import { RETENTION } from '../content.js';
import type { StatLine } from '../data/repo.js';
import { formattersFor } from '../format.js';
import {
  CELL_PX,
  DUST2_OVERVIEW,
  HEATMAP_DELAY_MS,
  HEATMAP_WINDOW_DAYS,
  heatmapWindow,
  hottestSector,
  renderHeatmapSvg,
} from '../heatmap.js';
import { translatorFor, type Locale } from '../i18n.js';
import { levelForXp, levelProgress } from '../levels.js';
import { MASTERY_TIERS, masteryFor, weaponLabel } from '../mastery.js';
import { DESCRIPTION_MAX, TITLE_MAX, absolute, buildHead, pagePath, playerPath } from '../seo.js';
import { displayName, parseSteamId } from '../steamid.js';
import { renderPage } from '../view.js';
import { fitWithName, homeCrumb, safeAvatar, type PageDeps } from './pages.js';

/**
 * Публичният профил на играч (`/{език}/player/:steamId64`): статистики, ниво, майсторство, heatmap
 * (CONTRACT §3–4) и последните му мачове с линк към личния отчет (§13). Скрит (чл. 21 GDPR) → 404.
 */
export const PROFILE_MATCHES = 10;

function statView(line: StatLine | null) {
  if (!line) return null;
  return { ...line, level: levelForXp(line.xp) };
}

export function playerRouter(locale: Locale, deps: PageDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());

  router.get('/player/:steamId', async (req: Request, res: Response, next: NextFunction) => {
    const steamId = parseSteamId(req.params.steamId);
    if (!steamId) return next();
    const player = await deps.repo.player(steamId);
    if (!player) return next();
    const t = translatorFor(locale);
    const fmt = formattersFor(locale, config().DISPLAY_TZ);
    const season = await deps.repo.currentSeason();
    const seasonIds = season.id === 0 ? [0] : [0, season.id];
    const [stats, weapons, heat, matches, honors] = await Promise.all([
      deps.repo.playerStats(steamId, seasonIds),
      deps.repo.weaponStats(steamId),
      deps.repo.heatmap(steamId, heatmapWindow(now())),
      deps.repo.playerMatches(steamId, PROFILE_MATCHES),
      deps.repo.honors(steamId),
    ]);
    const name = displayName(player.name, steamId);
    const allTime = statView(stats.find((line) => line.seasonId === 0) ?? null);
    const seasonal =
      season.id === 0 ? null : statView(stats.find((line) => line.seasonId === season.id) ?? null);
    const progress = levelProgress(allTime?.xp ?? 0n);

    // Ножовете (`knife`, `knife_t`…) и други синоними са една значка — сливат се по показното име.
    const merged = new Map<string, { label: string; kills: number; headshots: number }>();
    for (const line of weapons) {
      const label = weaponLabel(line.weapon);
      const found = merged.get(label);
      if (found) {
        found.kills += line.kills;
        found.headshots += line.headshots;
      } else merged.set(label, { label, kills: line.kills, headshots: line.headshots });
    }
    const mastery = [...merged.values()]
      .sort((a, b) => b.kills - a.kills || a.label.localeCompare(b.label))
      .map((line) => ({ ...line, mastery: masteryFor(line.kills) }));

    const killsTotal = heat.kills.reduce((sum, cell) => sum + cell.n, 0);
    const deathsTotal = heat.deaths.reduce((sum, cell) => sum + cell.n, 0);
    const killsSector = hottestSector(heat.kills);
    const deathsSector = hottestSector(heat.deaths);
    const heatmaps = {
      killsTotal,
      deathsTotal,
      killsSector,
      deathsSector,
      killsSvg: renderHeatmapSvg({
        id: 'hm-kills',
        kind: 'kills',
        cells: heat.kills,
        title: t('player.heatmap.killsTitle'),
        description: t.plural('player.heatmap.killsDesc', killsTotal, {
          days: HEATMAP_WINDOW_DAYS,
          sector: killsSector ?? '—',
        }),
      }),
      deathsSvg: renderHeatmapSvg({
        id: 'hm-deaths',
        kind: 'deaths',
        cells: heat.deaths,
        title: t('player.heatmap.deathsTitle'),
        description: t.plural('player.heatmap.deathsDesc', deathsTotal, {
          days: HEATMAP_WINDOW_DAYS,
          sector: deathsSector ?? '—',
        }),
      }),
    };

    const summary = allTime ?? null;
    const params = {
      level: progress.level,
      kills: fmt.int(summary?.kills ?? 0),
      kd: fmt.kd(summary?.kills ?? 0, summary?.deaths ?? 0),
      hs: fmt.percent(summary?.headshots ?? 0, summary?.kills ?? 0),
    };
    const path = playerPath(locale, steamId);
    const head = buildHead({
      locale,
      title: fitWithName(t, 'meta.player.title', name, params, TITLE_MAX),
      description: fitWithName(t, 'meta.player.description', name, params, DESCRIPTION_MAX),
      keywords: t('meta.player.keywords'),
      path,
      pathFor: (code) => playerPath(code, steamId),
      crumbs: [
        homeCrumb(t, locale),
        { name: t('nav.leaderboard'), path: pagePath(locale, 'leaderboard') },
        { name, path },
      ],
      pageType: 'ProfilePage',
      extraNodes: [
        {
          '@type': 'Person',
          '@id': `${absolute(path)}#player`,
          name,
          identifier: steamId,
          mainEntityOfPage: { '@id': `${absolute(path)}#webpage` },
        },
      ],
      ogImageAlt: t('meta.ogAlt'),
    });
    renderPage(res, 'player', locale, 'player', head, {
      player: { ...player, name, avatarUrl: safeAvatar(player.avatarUrl) },
      season,
      allTime,
      seasonal,
      progress,
      mastery,
      masteryTiers: MASTERY_TIERS,
      honors,
      duelsDays: RETENTION.duelsDays,
      heatmaps,
      recentMatches: matches,
      retentionDays: RETENTION.matchesDays,
      heatmapInfo: {
        days: HEATMAP_WINDOW_DAYS,
        delayHours: HEATMAP_DELAY_MS / 3_600_000,
        cellUnits: Math.round(CELL_PX * DUST2_OVERVIEW.scale),
      },
    });
  });

  return router;
}
