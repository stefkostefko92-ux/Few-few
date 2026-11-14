import { prisma } from "@aso/db";
import { isoWeek } from "@aso/shared";
import { logger } from "../logger.js";

/**
 * Quest cleanup (§12): delete stale quest rows from prior periods so the table
 * doesn't grow unbounded. Quests for the current day/week are created lazily by
 * the API on demand (ensureQuests), so we only prune old ones here.
 * Периодите са UTC: дневни „d:YYYY-MM-DD“, седмични „w:YYYY-Www“.
 */
export async function cleanupQuests(now: Date = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  const week = isoWeek(now);
  const result = await prisma.quest.deleteMany({
    where: {
      OR: [
        { period: { startsWith: "d:" }, NOT: { period: `d:${today}` } },
        { period: { startsWith: "w:" }, NOT: { period: `w:${week}` } },
      ],
    },
  });
  if (result.count > 0) logger.info({ removed: result.count }, "pruned stale quests");
}
