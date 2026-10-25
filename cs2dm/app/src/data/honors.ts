import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { PlayerHonors } from './repo.js';

/**
 * Отличията на профила (CONTRACT §15) — значките (`player_badges`) и дуелите (`duels`) пише C# плъгинът,
 * сайтът само чете.
 * Агрегат по вид: колко пъти, кога за последно и рекордът (`details.kills`). Непознат вид се прескача —
 * нов вид значка = ред тук + текст в трите речника.
 */
export const BADGE_KINDS = ['zone_king'] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

const isBadgeKind = (kind: string): kind is BadgeKind =>
  (BADGE_KINDS as readonly string[]).includes(kind);

const badgeRow = z.object({
  kind: z.string(),
  n: z.number().int().positive(),
  lastAt: z.date(),
  best: z.number().int().nonnegative().nullable(),
});

const duelRow = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
});

export async function loadHonors(db: PrismaClient, steamId: string): Promise<PlayerHonors> {
  const [raw, duelsRaw] = await Promise.all([
    loadBadgeRows(db, steamId),
    loadDuelRows(db, steamId),
  ]);
  const badges = z
    .array(badgeRow)
    .parse(raw)
    .flatMap((row) =>
      isBadgeKind(row.kind)
        ? [{ kind: row.kind, count: row.n, lastAt: row.lastAt, bestKills: row.best }]
        : [],
    );
  return { badges, duels: duelRow.parse(duelsRaw[0]) };
}

function loadBadgeRows(db: PrismaClient, steamId: string): Promise<unknown[]> {
  // `details` се пише от плъгина — числото се взема само ако наистина е число (иначе NULL, не грешка).
  return db.$queryRaw<unknown[]>`
    SELECT kind, count(*)::int AS n, max(earned_at) AS "lastAt",
           max(CASE WHEN details->>'kills' ~ '^[0-9]{1,6}$' THEN (details->>'kills')::int END) AS best
    FROM player_badges
    WHERE steam_id = ${steamId}
    GROUP BY kind
    ORDER BY kind`;
}

/** Победи · загуби · равни (§15) за срока на `duels` (90 дни). При равенство редът на двамата е без значение. */
function loadDuelRows(db: PrismaClient, steamId: string): Promise<unknown[]> {
  return db.$queryRaw<unknown[]>`
    SELECT count(*) FILTER (WHERE winner_id = ${steamId} AND NOT draw)::int AS wins,
           count(*) FILTER (WHERE loser_id = ${steamId} AND NOT draw)::int AS losses,
           count(*) FILTER (WHERE draw)::int AS draws
    FROM duels
    WHERE winner_id = ${steamId} OR loser_id = ${steamId}`;
}
