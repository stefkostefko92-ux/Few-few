import { Prisma, type PrismaClient } from '@prisma/client';
import { METERS_PER_UNIT } from '../highlights.js';
import {
  FLAG_BASELINE_DAYS,
  FLAG_WINDOW_DAYS,
  LONG_NOSCOPE_METERS,
  type FlagCounts,
  type FlagInput,
} from './flags.js';

/**
 * Числата за „Подозрителни играчи“ (§10, само четене): един проход по `kills` за дни 0–28 с `FILTER`
 * (прозорец срещу собствена база) и минутите от `sessions` (сесиите се пазят 30 дни — базата е в тях).
 * Само убийства между хора без самоубийства — както статистиките (§3).
 */
const DAY_MS = 86_400_000;
/** Колко последни мача на флагнат играч показваме като линкове към личния отчет. */
export const FLAG_MATCH_LINKS = 5;

interface KillRow {
  steam_id: string;
  name: string;
  hidden: boolean;
  kills: number;
  headshots: number;
  wallbangs: number;
  smokes: number;
  blinds: number;
  long_noscopes: number;
  b_kills: number;
  b_headshots: number;
  b_wallbangs: number;
  b_smokes: number;
  b_blinds: number;
  b_long_noscopes: number;
}

interface MinutesRow {
  steam_id: string;
  minutes: number;
  b_minutes: number;
}

export function flagWindow(now: Date) {
  return {
    since: new Date(now.getTime() - FLAG_WINDOW_DAYS * DAY_MS),
    baseSince: new Date(now.getTime() - FLAG_BASELINE_DAYS * DAY_MS),
    until: now,
  };
}

export async function loadFlagInputs(db: PrismaClient, now: Date): Promise<FlagInput[]> {
  const { since, baseSince, until } = flagWindow(now);
  const longUnits = LONG_NOSCOPE_METERS / METERS_PER_UNIT;
  const [kills, minutes] = await Promise.all([
    db.$queryRaw<KillRow[]>(Prisma.sql`
      SELECT k.attacker_id AS steam_id, p.name, p.hidden_from_leaderboards AS hidden,
        count(*) FILTER (WHERE k.at >= ${since})::int AS kills,
        count(*) FILTER (WHERE k.at >= ${since} AND k.headshot)::int AS headshots,
        count(*) FILTER (WHERE k.at >= ${since} AND k.wallbang)::int AS wallbangs,
        count(*) FILTER (WHERE k.at >= ${since} AND k.through_smoke)::int AS smokes,
        count(*) FILTER (WHERE k.at >= ${since} AND k.attacker_blind)::int AS blinds,
        count(*) FILTER (WHERE k.at >= ${since} AND k.noscope
          AND sqrt(power(k.ax - k.vx, 2) + power(k.ay - k.vy, 2) + power(k.az - k.vz, 2)) >= ${longUnits})::int
          AS long_noscopes,
        count(*) FILTER (WHERE k.at < ${since})::int AS b_kills,
        count(*) FILTER (WHERE k.at < ${since} AND k.headshot)::int AS b_headshots,
        count(*) FILTER (WHERE k.at < ${since} AND k.wallbang)::int AS b_wallbangs,
        count(*) FILTER (WHERE k.at < ${since} AND k.through_smoke)::int AS b_smokes,
        count(*) FILTER (WHERE k.at < ${since} AND k.attacker_blind)::int AS b_blinds,
        count(*) FILTER (WHERE k.at < ${since} AND k.noscope
          AND sqrt(power(k.ax - k.vx, 2) + power(k.ay - k.vy, 2) + power(k.az - k.vz, 2)) >= ${longUnits})::int
          AS b_long_noscopes
      FROM kills k
      JOIN players p ON p.steam_id = k.attacker_id
      WHERE k.at >= ${baseSince} AND k.at < ${until}
        AND k.attacker_id IS NOT NULL AND k.attacker_id <> k.victim_id
      GROUP BY k.attacker_id, p.name, p.hidden_from_leaderboards`),
    // Отворена сесия (сървърът е паднал) се реже до края на прозореца — по-малко kpm, не повече.
    db.$queryRaw<MinutesRow[]>(Prisma.sql`
      SELECT steam_id,
        (sum(greatest(0, extract(epoch FROM
          least(coalesce(disconnected_at, ${until}), ${until}) - greatest(connected_at, ${since})))) / 60)::float8
          AS minutes,
        (sum(greatest(0, extract(epoch FROM
          least(coalesce(disconnected_at, ${until}), ${since}) - greatest(connected_at, ${baseSince})))) / 60)::float8
          AS b_minutes
      FROM sessions
      WHERE connected_at < ${until} AND coalesce(disconnected_at, ${until}) > ${baseSince}
      GROUP BY steam_id`),
  ]);
  const played = new Map(minutes.map((row) => [row.steam_id, row]));
  return kills.map((row) => {
    const time = played.get(row.steam_id);
    const base: FlagCounts = {
      kills: row.b_kills,
      headshots: row.b_headshots,
      wallbangs: row.b_wallbangs,
      smokes: row.b_smokes,
      blinds: row.b_blinds,
      longNoscopes: row.b_long_noscopes,
      minutes: time?.b_minutes ?? 0,
    };
    return {
      steamId: row.steam_id,
      name: row.name,
      hidden: row.hidden,
      kills: row.kills,
      headshots: row.headshots,
      wallbangs: row.wallbangs,
      smokes: row.smokes,
      blinds: row.blinds,
      longNoscopes: row.long_noscopes,
      minutes: time?.minutes ?? 0,
      base,
    };
  });
}

/** Последните мачове на флагнатите в прозореца — за линкове към личния отчет. */
export async function loadFlagMatches(
  db: PrismaClient,
  steamIds: ReadonlyArray<string>,
  now: Date,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (steamIds.length === 0) return out;
  const { since } = flagWindow(now);
  const rows = await db.$queryRaw<Array<{ steam_id: string; match_id: number }>>(Prisma.sql`
    SELECT steam_id, match_id FROM (
      SELECT mp.steam_id, mp.match_id,
        row_number() OVER (PARTITION BY mp.steam_id ORDER BY m.ended_at DESC, m.id DESC) AS n
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.steam_id IN (${Prisma.join([...steamIds])}) AND m.ended_at >= ${since}
    ) ranked
    WHERE n <= ${FLAG_MATCH_LINKS}
    ORDER BY steam_id, n`);
  for (const row of rows) {
    const list = out.get(row.steam_id) ?? [];
    list.push(row.match_id);
    out.set(row.steam_id, list);
  }
  return out;
}
