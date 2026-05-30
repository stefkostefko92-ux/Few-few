import { prisma } from "@aso/db";
import { logger } from "../logger.js";

/**
 * Quest cleanup (§12): delete stale quest rows from prior periods so the table
 * doesn't grow unbounded. Quests for the current day/week are created lazily by
 * the API on demand (ensureQuests), so we only prune old ones here.
 */
export async function cleanupQuests(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  // Daily quest period keys look like "d:YYYY-MM-DD"; drop any not for today.
  const result = await prisma.quest.deleteMany({
    where: {
      period: { startsWith: "d:" },
      NOT: { period: `d:${today}` },
    },
  });
  if (result.count > 0) logger.info({ removed: result.count }, "pruned stale daily quests");
}
