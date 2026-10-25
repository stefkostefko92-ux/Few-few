import type { PrismaClient } from '@prisma/client';
import { aggregate } from '../heatmap.js';
import { collections, longestKill, multiKills, type KillEvent } from '../highlights.js';
import { displayName } from '../steamid.js';
import type {
  MatchBaseline,
  MatchHighlights,
  MatchName,
  MatchReport,
  PlayerMatchRow,
  WeaponLine,
} from './repo.js';

/**
 * Анализите на мача (CONTRACT §13): хайлайти, личен отчет и „последни мачове“ на профила. Всичко идва от
 * съществуващите `kills`, `matches` и `match_players` — без нови таблици. Скритите играчи (чл. 21 GDPR)
 * никога не излизат с име или SteamID.
 */
const DAY_MS = 86_400_000;
/** Таван на убийствата, които четем за един мач (30 мин DM ≈ хиляда-две) — пази паметта. */
const MAX_KILLS = 20_000;
/** Сравнението в личния отчет: средното на играча за мач в толкова дни преди този. */
export const BASELINE_DAYS = 7;

const KILL_SELECT = {
  at: true,
  attackerId: true,
  victimId: true,
  weapon: true,
  headshot: true,
  wallbang: true,
  noscope: true,
  throughSmoke: true,
  attackerBlind: true,
  ax: true,
  ay: true,
  az: true,
  vx: true,
  vy: true,
  vz: true,
} as const;

const HIDDEN: MatchName = { steamId: null, name: null };

/** Имената от картата на мача; непознат или скрит → „скрит играч“. */
function namesOf(
  rows: ReadonlyArray<{
    steamId: string;
    name: string;
    player: { hiddenFromLeaderboards: boolean };
  }>,
) {
  const map = new Map<string, MatchName>();
  for (const row of rows) {
    map.set(
      row.steamId,
      row.player.hiddenFromLeaderboards
        ? HIDDEN
        : { steamId: row.steamId, name: displayName(row.name, row.steamId) },
    );
  }
  return (steamId: string): MatchName => map.get(steamId) ?? HIDDEN;
}

export async function loadMatchHighlights(
  db: PrismaClient,
  id: number,
): Promise<MatchHighlights | null> {
  const match = await db.match.findUnique({
    where: { id },
    select: {
      startedAt: true,
      endedAt: true,
      rows: {
        select: { steamId: true, name: true, player: { select: { hiddenFromLeaderboards: true } } },
      },
    },
  });
  if (!match) return null;
  const events: KillEvent[] = await db.kill.findMany({
    where: { at: { gte: match.startedAt, lte: match.endedAt } },
    orderBy: { at: 'asc' },
    take: MAX_KILLS,
    select: KILL_SELECT,
  });
  const name = namesOf(match.rows);
  const longest = longestKill(events, match.startedAt);
  return {
    recorded: events.length > 0,
    multiKills: multiKills(events, match.startedAt).map(({ steamId, ...rest }) => ({
      ...name(steamId),
      ...rest,
    })),
    collections: collections(events).map(({ leader, ...rest }) => ({
      ...rest,
      leader: name(leader),
    })),
    longest: longest
      ? {
          ...name(longest.steamId),
          weapon: longest.weapon,
          meters: longest.meters,
          offsetMs: longest.offsetMs,
        }
      : null,
  };
}

async function baselineFor(
  db: PrismaClient,
  steamId: string,
  before: Date,
): Promise<MatchBaseline | null> {
  const agg = await db.matchPlayer.aggregate({
    where: {
      steamId,
      match: { endedAt: { gte: new Date(before.getTime() - BASELINE_DAYS * DAY_MS), lt: before } },
    },
    _count: { _all: true },
    _avg: { kills: true, deaths: true, headshots: true, xp: true },
  });
  const matches = agg._count._all;
  if (matches === 0) return null;
  return {
    matches,
    kills: agg._avg.kills ?? 0,
    deaths: agg._avg.deaths ?? 0,
    headshots: agg._avg.headshots ?? 0,
    xp: agg._avg.xp ?? 0,
  };
}

export async function loadMatchReport(
  db: PrismaClient,
  id: number,
  steamId: string,
): Promise<MatchReport | null> {
  const row = await db.matchPlayer.findUnique({
    where: { matchId_steamId: { matchId: id, steamId } },
    include: { match: true, player: { select: { hiddenFromLeaderboards: true } } },
  });
  if (!row || row.player.hiddenFromLeaderboards) return null;
  const { match } = row;
  const [events, baseline] = await Promise.all([
    db.kill.findMany({
      where: {
        at: { gte: match.startedAt, lte: match.endedAt },
        OR: [{ attackerId: steamId }, { victimId: steamId }],
      },
      orderBy: { at: 'asc' },
      take: MAX_KILLS,
      select: KILL_SELECT,
    }),
    baselineFor(db, steamId, match.startedAt),
  ]);
  const weapons = new Map<string, WeaponLine>();
  for (const event of events) {
    if (event.attackerId !== steamId || event.victimId === steamId) continue;
    const line = weapons.get(event.weapon) ?? { weapon: event.weapon, kills: 0, headshots: 0 };
    line.kills += 1;
    if (event.headshot) line.headshots += 1;
    weapons.set(event.weapon, line);
  }
  return {
    match: {
      id: match.id,
      map: match.map,
      mode: match.mode,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      kills: match.kills,
      players: match.players,
    },
    steamId,
    name: displayName(row.name, steamId),
    row: {
      place: row.place,
      kills: row.kills,
      deaths: row.deaths,
      headshots: row.headshots,
      bestStreak: row.bestStreak,
      bountiesClaimed: row.bountiesClaimed,
      xp: row.xp,
    },
    recorded: events.length > 0,
    weapons: [...weapons.values()].sort(
      (a, b) => b.kills - a.kills || a.weapon.localeCompare(b.weapon),
    ),
    multiKills: multiKills(events, match.startedAt)
      .filter((run) => run.steamId === steamId)
      .map(({ steamId: _id, ...rest }) => rest),
    deathCells: aggregate(
      events.filter((event) => event.victimId === steamId).map((e) => ({ x: e.vx, y: e.vy })),
    ),
    baseline,
  };
}

export async function loadPlayerMatches(
  db: PrismaClient,
  steamId: string,
  limit: number,
): Promise<PlayerMatchRow[]> {
  const rows = await db.matchPlayer.findMany({
    where: { steamId, player: { hiddenFromLeaderboards: false } },
    orderBy: [{ match: { endedAt: 'desc' } }, { matchId: 'desc' }],
    take: limit,
    select: {
      place: true,
      kills: true,
      deaths: true,
      xp: true,
      match: { select: { id: true, endedAt: true, players: true } },
    },
  });
  return rows.map((row) => ({
    id: row.match.id,
    endedAt: row.match.endedAt,
    place: row.place,
    players: row.match.players,
    kills: row.kills,
    deaths: row.deaths,
    xp: row.xp,
  }));
}
