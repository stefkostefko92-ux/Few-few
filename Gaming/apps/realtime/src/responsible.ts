import type { Server } from "socket.io";
import { prisma } from "@aso/db";
import { SELF_EXCLUDED_CODE, SOCKET_EVENTS } from "@aso/shared";

/**
 * Отговорна игра: кои от `userIds` са в активно самоизключване (userId → край).
 * Една заявка за целия списък; изтеклите се пренебрегват лениво (без cron).
 */
export async function selfExcludedAmong(userIds: readonly string[]): Promise<Map<string, Date>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, selfExcludedUntil: { gt: new Date() } },
    select: { id: true, selfExcludedUntil: true },
  });
  const out = new Map<string, Date>();
  for (const r of rows) if (r.selfExcludedUntil) out.set(r.id, r.selfExcludedUntil);
  return out;
}

/** Уведоми самоизключените, че не могат да влязат в маса/опашка. */
export function notifySelfExcluded(io: Server, excluded: Map<string, Date>, extra: string[] = []): void {
  for (const [id, until] of excluded) {
    io.to(`u:${id}`).emit(SOCKET_EVENTS.ERROR, {
      code: SELF_EXCLUDED_CODE,
      message: "Самоизключването е активно — масите са недостъпни до изтичането му",
      until: until.toISOString(),
    });
  }
  const msg = { code: SELF_EXCLUDED_CODE, message: "Играч на масата е в самоизключване" };
  for (const id of new Set(extra)) if (!excluded.has(id)) io.to(`u:${id}`).emit(SOCKET_EVENTS.ERROR, msg);
}
