import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { PlayerHonors } from './repo.js';

/**
 * Значките на профила (CONTRACT §15) — пише ги C# плъгинът (`player_badges`), сайтът само чете.
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

export async function loadHonors(db: PrismaClient, steamId: string): Promise<PlayerHonors> {
  // `details` се пише от плъгина — числото се взема само ако наистина е число (иначе NULL, не грешка).
  const raw = await db.$queryRaw<unknown[]>`
    SELECT kind, count(*)::int AS n, max(earned_at) AS "lastAt",
           max(CASE WHEN details->>'kills' ~ '^[0-9]{1,6}$' THEN (details->>'kills')::int END) AS best
    FROM player_badges
    WHERE steam_id = ${steamId}
    GROUP BY kind
    ORDER BY kind`;
  const badges = z
    .array(badgeRow)
    .parse(raw)
    .flatMap((row) =>
      isBadgeKind(row.kind)
        ? [{ kind: row.kind, count: row.n, lastAt: row.lastAt, bestKills: row.best }]
        : [],
    );
  return { badges };
}
