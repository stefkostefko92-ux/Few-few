import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { PublicEvent } from '../events.js';
import { CELL_PX, DUST2_OVERVIEW, cleanCells, type HeatCell } from '../heatmap.js';
import { loadHonors } from './honors.js';
import { loadMatchHighlights, loadMatchReport, loadPlayerMatches } from './match-analytics.js';
import { loadEvents, loadMatch, loadRecentMatches } from './public-extra.js';
import {
  RATIO_MIN_KILLS,
  pagesFor,
  type LeaderRow,
  type MatchDetail,
  type MatchHighlights,
  type MatchListRow,
  type MatchReport,
  type PlayerMatchRow,
  type Paged,
  type PlayerHonors,
  type PublicBan,
  type PublicPlayer,
  type PublicVipTier,
  type Repo,
  type Season,
  type SitemapPlayer,
  type SortKey,
  type StatLine,
  type WeaponLine,
} from './repo.js';

/**
 * Четенето на публичния сайт от PostgreSQL. Само SELECT — сайтът на етап 1 не пише нищо.
 *
 * Суровите заявки (класацията по K/D и HS%, агрегатите на heatmap-а) са с параметри през
 * tagged template на Prisma; подредбата е от затворен списък, никога от вход. Редовете от тях се
 * проверяват със zod — базата се пише и от C# плъгина, затова формата ѝ е граница.
 */

const ORDER: Record<SortKey, Prisma.Sql> = {
  xp: Prisma.sql`s.xp DESC, s.kills DESC`,
  kills: Prisma.sql`s.kills DESC, s.xp DESC`,
  kd: Prisma.sql`(s.kills::float8 / GREATEST(s.deaths, 1)) DESC, s.kills DESC`,
  hs: Prisma.sql`(s.headshots::float8 / GREATEST(s.kills, 1)) DESC, s.kills DESC`,
};

const leaderRow = z.object({
  steamId: z.string(),
  name: z.string(),
  kills: z.number().int(),
  deaths: z.number().int(),
  headshots: z.number().int(),
  xp: z.bigint(),
});

const totalRow = z.object({ total: z.number().int() });
const cellRow = z.object({ cx: z.number().int(), cy: z.number().int(), n: z.number().int() });

/** Активен бан по CONTRACT.md §2: BAN, неотменен, без срок или със срок в бъдещето. */
export function activeBanWhere(now: Date): Prisma.PunishmentWhereInput {
  return {
    type: 'BAN',
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/**
 * Полетата на публичния банлист. Изброени изрично (`select`), за да не се зареди изобщо
 * `reason`, `actorSteamId` или нещо друго вътрешно — тестът проверява точно този списък.
 */
export const PUBLIC_BAN_SELECT = {
  steamId: true,
  targetName: true,
  category: true,
  createdAt: true,
  expiresAt: true,
} as const satisfies Prisma.PunishmentSelect;

export class PrismaRepo implements Repo {
  constructor(private readonly db: PrismaClient) {}

  async currentSeason(): Promise<Season> {
    const select = { id: true, startsAt: true, endsAt: true } as const;
    const active = await this.db.season.findFirst({
      where: { id: { gt: 0 }, endsAt: null },
      orderBy: { id: 'desc' },
      select,
    });
    if (active) return active;
    const allTime = await this.db.season.findUnique({ where: { id: 0 }, select });
    return allTime ?? { id: 0, startsAt: new Date(0), endsAt: null };
  }

  async seasons(): Promise<Season[]> {
    return this.db.season.findMany({
      orderBy: { id: 'desc' },
      select: { id: true, startsAt: true, endsAt: true },
    });
  }

  async leaderboard(query: {
    seasonId: number;
    sort: SortKey;
    page: number;
    pageSize: number;
  }): Promise<Paged<LeaderRow>> {
    const minKills = query.sort === 'kd' || query.sort === 'hs' ? RATIO_MIN_KILLS : 1;
    const where = Prisma.sql`s.season_id = ${query.seasonId}
      AND p.hidden_from_leaderboards = false
      AND s.kills >= ${minKills}`;
    const offset = (query.page - 1) * query.pageSize;
    const [rawRows, rawTotal] = await Promise.all([
      this.db.$queryRaw<unknown[]>`
        SELECT s.steam_id AS "steamId", p.name, s.kills, s.deaths, s.headshots, s.xp
        FROM player_season_stats s
        JOIN players p ON p.steam_id = s.steam_id
        WHERE ${where}
        ORDER BY ${ORDER[query.sort]}, s.steam_id ASC
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.db.$queryRaw<unknown[]>`
        SELECT count(*)::int AS total
        FROM player_season_stats s
        JOIN players p ON p.steam_id = s.steam_id
        WHERE ${where}`,
    ]);
    const rows = z.array(leaderRow).parse(rawRows);
    const total = totalRow.parse(rawTotal[0] ?? { total: 0 }).total;
    return {
      rows: rows.map((row, index) => ({ ...row, rank: offset + index + 1 })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pages: pagesFor(total, query.pageSize),
    };
  }

  async player(steamId: string): Promise<PublicPlayer | null> {
    const found = await this.db.player.findUnique({
      where: { steamId },
      select: {
        steamId: true,
        name: true,
        avatarUrl: true,
        firstSeenAt: true,
        lastSeenAt: true,
        hiddenFromLeaderboards: true,
      },
    });
    // Правото на възражение (чл. 21 GDPR) скрива играча от всичко публично, не само от таблицата.
    if (!found || found.hiddenFromLeaderboards) return null;
    return {
      steamId: found.steamId,
      name: found.name,
      avatarUrl: found.avatarUrl,
      firstSeenAt: found.firstSeenAt,
      lastSeenAt: found.lastSeenAt,
    };
  }

  async playerStats(steamId: string, seasonIds: number[]): Promise<StatLine[]> {
    return this.db.playerSeasonStats.findMany({
      where: { steamId, seasonId: { in: seasonIds } },
      select: {
        seasonId: true,
        kills: true,
        deaths: true,
        headshots: true,
        assists: true,
        damage: true,
        shotsFired: true,
        shotsHit: true,
        bestStreak: true,
        bountiesClaimed: true,
        revenges: true,
        xp: true,
        playtimeSec: true,
      },
    });
  }

  async weaponStats(steamId: string): Promise<WeaponLine[]> {
    return this.db.weaponSeasonStats.findMany({
      where: { steamId, seasonId: 0, kills: { gt: 0 } },
      orderBy: [{ kills: 'desc' }, { weapon: 'asc' }],
      take: 60,
      select: { weapon: true, kills: true, headshots: true },
    });
  }

  async heatmap(
    steamId: string,
    window: { since: Date; until: Date },
  ): Promise<{ kills: HeatCell[]; deaths: HeatCell[] }> {
    // Една и съща трансформация като `worldToRadar` в heatmap.ts — константите идват оттам.
    const { posX, posY, scale } = DUST2_OVERVIEW;
    const [kills, deaths] = await Promise.all([
      this.db.$queryRaw<unknown[]>`
        SELECT floor((ax::float8 - ${posX}::float8) / ${scale}::float8 / ${CELL_PX}::float8)::int AS cx,
               floor((${posY}::float8 - ay::float8) / ${scale}::float8 / ${CELL_PX}::float8)::int AS cy,
               count(*)::int AS n
        FROM kills
        WHERE attacker_id = ${steamId} AND at >= ${window.since} AND at < ${window.until}
        GROUP BY 1, 2`,
      this.db.$queryRaw<unknown[]>`
        SELECT floor((vx::float8 - ${posX}::float8) / ${scale}::float8 / ${CELL_PX}::float8)::int AS cx,
               floor((${posY}::float8 - vy::float8) / ${scale}::float8 / ${CELL_PX}::float8)::int AS cy,
               count(*)::int AS n
        FROM kills
        WHERE victim_id = ${steamId} AND at >= ${window.since} AND at < ${window.until}
        GROUP BY 1, 2`,
    ]);
    return {
      kills: cleanCells(z.array(cellRow).parse(kills)),
      deaths: cleanCells(z.array(cellRow).parse(deaths)),
    };
  }

  async activeBans(query: {
    page: number;
    pageSize: number;
    now: Date;
  }): Promise<Paged<PublicBan>> {
    const where = activeBanWhere(query.now);
    const [rows, total] = await Promise.all([
      this.db.punishment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: PUBLIC_BAN_SELECT,
      }),
      this.db.punishment.count({ where }),
    ]);
    return {
      rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pages: pagesFor(total, query.pageSize),
    };
  }

  async vipTiers(): Promise<PublicVipTier[]> {
    return this.db.vipTier.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
      select: { code: true, name: true, priceCents: true, periodDays: true },
    });
  }

  async sitemapPlayers(limit: number): Promise<SitemapPlayer[]> {
    return this.db.playerSeasonStats.findMany({
      where: { seasonId: 0, kills: { gte: 1 }, player: { hiddenFromLeaderboards: false } },
      orderBy: [{ xp: 'desc' }, { steamId: 'asc' }],
      take: limit,
      select: { steamId: true, updatedAt: true },
    });
  }

  events(now: Date): Promise<PublicEvent[]> {
    return loadEvents(this.db, now);
  }

  recentMatches(limit: number): Promise<MatchListRow[]> {
    return loadRecentMatches(this.db, limit);
  }

  match(id: number): Promise<MatchDetail | null> {
    return loadMatch(this.db, id);
  }

  honors(steamId: string): Promise<PlayerHonors> {
    return loadHonors(this.db, steamId);
  }

  matchHighlights(id: number): Promise<MatchHighlights | null> {
    return loadMatchHighlights(this.db, id);
  }

  matchReport(id: number, steamId: string): Promise<MatchReport | null> {
    return loadMatchReport(this.db, id, steamId);
  }

  playerMatches(steamId: string, limit: number): Promise<PlayerMatchRow[]> {
    return loadPlayerMatches(this.db, steamId, limit);
  }

  async lastStatsUpdate(): Promise<Date | null> {
    const result = await this.db.playerSeasonStats.aggregate({ _max: { updatedAt: true } });
    return result._max.updatedAt;
  }
}
