import { prisma } from "@aso/db";
import { SELF_EXCLUDED_CODE, playDayStart, playedMinutes, selfExclusionActive } from "@aso/shared";
import { HttpError } from "../http.js";

/**
 * Отказ при активно самоизключване (отговорна игра). Ползва се от магазина
 * (покупки) — realtime прави същата проверка при влизане в маса/опашка.
 * Fail closed: при съмнение (невалидна дата) приемаме, че изключването трае.
 */
export function assertNotSelfExcluded(user: { selfExcludedUntil?: Date | null }): void {
  const until = user.selfExcludedUntil ?? null;
  if (!selfExclusionActive(until)) return;
  throw new HttpError(
    403,
    SELF_EXCLUDED_CODE,
    "Самоизключването е активно — покупките са спрени до изтичането му",
    { until: until!.toISOString() },
  );
}

/**
 * Изиграните днес минути в мачове (сървърно, по началото/края на мачовете).
 * Същото преброяване ползва realtime, за да наложи дневния лимит.
 */
export async function playedTodayMinutes(userId: string, now = Date.now()): Promise<number> {
  const dayStart = playDayStart(now);
  const rows = await prisma.matchPlayer.findMany({
    where: { userId, match: { endedAt: { gte: dayStart } } },
    select: { match: { select: { startedAt: true, endedAt: true } } },
  });
  return playedMinutes(rows.map((r) => r.match), dayStart, now);
}
