import type { Server } from "socket.io";
import { prisma } from "@aso/db";
import {
  DAILY_LIMIT_CODE,
  SELF_EXCLUDED_CODE,
  SOCKET_EVENTS,
  effectiveDailyLimit,
  nextPlayDayStart,
  playDayStart,
  playedMinutes,
  selfExclusionActive,
} from "@aso/shared";

/** Защо играч не може да седне на маса сега и до кога. */
export interface PlayBlock {
  code: typeof SELF_EXCLUDED_CODE | typeof DAILY_LIMIT_CODE;
  until: Date;
}

/** Кодът, който получават ОСТАНАЛИТЕ на масата: не издава кой и защо (самоизключването е лично). */
export const MEMBER_UNAVAILABLE_CODE = "member_unavailable";

const MESSAGE: Record<PlayBlock["code"], string> = {
  [SELF_EXCLUDED_CODE]: "Самоизключването е активно — масите са недостъпни до изтичането му",
  [DAILY_LIMIT_CODE]: "Дневният лимит за игра е достигнат — нови маси от утре",
};

/**
 * Отговорна игра: кои от `userIds` не могат да седнат на маса сега (userId → защо
 * и до кога). Самоизключване — до края му; достигнат дневен лимит — до началото
 * на следващия игрови ден. Минутите се броят от мачовете (начало/край) в базата;
 * текущият мач се доиграва, отказват се само нови маси, опашки и стаи.
 * Две заявки за целия списък; изтеклото се пренебрегва лениво (без cron).
 */
export async function playBlockedAmong(userIds: readonly string[], now = Date.now()): Promise<Map<string, PlayBlock>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  const out = new Map<string, PlayBlock>();
  if (ids.length === 0) return out;
  const rows = await prisma.user.findMany({
    where: {
      id: { in: ids },
      OR: [
        { selfExcludedUntil: { gt: new Date(now) } },
        { dailyLimitMinutes: { not: null } },
        { dailyLimitPendingAt: { not: null } },
      ],
    },
    select: {
      id: true,
      selfExcludedUntil: true,
      dailyLimitMinutes: true,
      dailyLimitPendingMinutes: true,
      dailyLimitPendingAt: true,
    },
  });
  const limits = new Map<string, number>();
  for (const r of rows) {
    if (selfExclusionActive(r.selfExcludedUntil, now)) {
      out.set(r.id, { code: SELF_EXCLUDED_CODE, until: r.selfExcludedUntil! });
      continue;
    }
    const limit = effectiveDailyLimit(
      {
        dailyLimitMinutes: r.dailyLimitMinutes ?? null,
        dailyLimitPendingMinutes: r.dailyLimitPendingMinutes ?? null,
        dailyLimitPendingAt: r.dailyLimitPendingAt ?? null,
      },
      now,
    );
    if (limit !== null) limits.set(r.id, limit);
  }
  if (limits.size === 0) return out;

  const dayStart = playDayStart(now);
  const played = await prisma.matchPlayer.findMany({
    where: { userId: { in: [...limits.keys()] }, match: { endedAt: { gte: dayStart } } },
    select: { userId: true, match: { select: { startedAt: true, endedAt: true } } },
  });
  const byUser = new Map<string, Array<{ startedAt: Date; endedAt: Date | null }>>();
  for (const p of played) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p.match]);
  const until = nextPlayDayStart(now);
  for (const [id, limit] of limits) {
    if (playedMinutes(byUser.get(id) ?? [], dayStart, now) >= limit) out.set(id, { code: DAILY_LIMIT_CODE, until });
  }
  return out;
}

/** Уведоми блокираните защо не могат да седнат, а останалите от групата — само че някой не може. */
export function notifyBlocked(io: Server, blocked: Map<string, PlayBlock>, extra: string[] = []): void {
  for (const [id, b] of blocked) {
    io.to(`u:${id}`).emit(SOCKET_EVENTS.ERROR, { code: b.code, message: MESSAGE[b.code], until: b.until.toISOString() });
  }
  const msg = { code: MEMBER_UNAVAILABLE_CODE, message: "Играч от групата не може да седне на маса сега" };
  for (const id of new Set(extra)) if (!blocked.has(id)) io.to(`u:${id}`).emit(SOCKET_EVENTS.ERROR, msg);
}

/** Съобщението към самия блокиран играч (стаи). */
export function blockedMessage(b: PlayBlock): { code: string; message: string; until: string } {
  return { code: b.code, message: MESSAGE[b.code], until: b.until.toISOString() };
}
