import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { CUP, CUP_BADGES, type CupStanding, type CupWeek, type CupWinner } from '../cup.js';
import { displayName } from '../steamid.js';

/**
 * Седмичната купа (CONTRACT §17): класирането на седмицата (страницата и работникът — една и съща заявка) и
 * последните победители (от значките). Подредбата е като `CupStore.CupStandingsSql` на плъгина (`!cup`) — тестът
 * пуска и двете срещу базата. Скритите играчи (чл. 21 GDPR) не участват и не се показват.
 */
type Reader = PrismaClient | Prisma.TransactionClient;

const standingRow = z.object({
  place: z.number().int().positive(),
  steamId: z.string(),
  name: z.string(),
  xp: z.number().int().positive(),
  matches: z.number().int().positive(),
});

export async function loadCupStandings(
  db: Reader,
  week: Pick<CupWeek, 'start' | 'end'>,
  limit: number,
): Promise<CupStanding[]> {
  const rows = await db.$queryRaw<unknown[]>`
    SELECT (row_number() OVER (ORDER BY sum(mp.xp) DESC, mp.steam_id))::int AS place,
           mp.steam_id AS "steamId", p.name, sum(mp.xp)::int AS xp, count(*)::int AS matches
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    JOIN players p ON p.steam_id = mp.steam_id
    WHERE m.ended_at >= ${week.start} AND m.ended_at < ${week.end}
      AND NOT p.hidden_from_leaderboards
    GROUP BY mp.steam_id, p.name
    HAVING sum(mp.xp) > 0
    ORDER BY xp DESC, mp.steam_id
    LIMIT ${limit}`;
  return z
    .array(standingRow)
    .parse(rows)
    .map((row) => ({ ...row, name: displayName(row.name, row.steamId) }));
}

const winnerDetails = z.object({ xp: z.number().int().nonnegative() });

export async function loadCupWinners(db: PrismaClient, limit: number): Promise<CupWinner[]> {
  const rows = await db.playerBadge.findMany({
    where: {
      kind: CUP_BADGES.winner,
      period: { not: null },
      player: { hiddenFromLeaderboards: false },
    },
    orderBy: [{ period: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { steamId: true, period: true, details: true, player: { select: { name: true } } },
  });
  return rows.map((row) => {
    const details = winnerDetails.safeParse(row.details);
    return {
      week: row.period ?? '',
      steamId: row.steamId,
      name: displayName(row.player.name, row.steamId),
      xp: details.success ? details.data.xp : 0,
    };
  });
}

export interface CupAward {
  week: string;
  awarded: number;
  /** Седмицата вече има значки — нищо не се пипа (повторно пускане, друг работник). */
  skipped: boolean;
}

/**
 * Значките на една завършила седмица — в една транзакция под advisory lock: има ли вече значка от купата за
 * периода → нищо (класирането междувременно може да се е сменило — скрит играч, изтрит профил — но наградата е
 * веднъж). Иначе първият → `cup_winner`, вторият и третият → `cup_podium`, `details = {week, xp, place}`;
 * уникалността (играч, вид, период) пази и сама.
 */
export async function awardCupWeek(db: PrismaClient, week: CupWeek): Promise<CupAward> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cs2dm_cup'))`;
    const already = await tx.playerBadge.count({
      where: { kind: { in: [CUP_BADGES.winner, CUP_BADGES.podium] }, period: week.key },
    });
    if (already > 0) return { week: week.key, awarded: 0, skipped: true };
    const podium = await loadCupStandings(tx, week, CUP.podium);
    const created = await tx.playerBadge.createMany({
      data: podium.map((row) => ({
        steamId: row.steamId,
        kind: row.place === 1 ? CUP_BADGES.winner : CUP_BADGES.podium,
        period: week.key,
        details: { week: week.key, xp: row.xp, place: row.place },
      })),
      skipDuplicates: true,
    });
    return { week: week.key, awarded: created.count, skipped: false };
  });
}
