import type { PrismaClient } from '@prisma/client';
import { collections, longestKill, multiKills, type KillEvent } from '../highlights.js';
import { displayName } from '../steamid.js';
import type { MatchHighlights, MatchName } from './repo.js';

/**
 * Анализите на мача (CONTRACT §13): хайлайтите. Всичко идва от съществуващите `kills`, `matches` и
 * `match_players` — без нови таблици. Скритите играчи (чл. 21 GDPR) никога не излизат с име или SteamID.
 */

/** Таван на убийствата, които четем за един мач (30 мин DM ≈ хиляда-две) — пази паметта. */
const MAX_KILLS = 20_000;

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
