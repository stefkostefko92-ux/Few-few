import { prisma } from "@aso/db";
import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * Season rollover (§12): ensure exactly one active season; when it ends, close
 * it and open the next, which resets the ranked ladder feel (a new season's
 * leaderboard snapshot starts fresh). Idempotent — safe to run on a schedule.
 */
export async function rolloverSeasons(): Promise<void> {
  const now = new Date();
  const active = await prisma.season.findFirst({ where: { active: true } });

  if (!active) {
    // Няма активен сезон (първо пускане или прекъсната смяна): продължаваме СЛЕД
    // последния, а не от 1 — иначе upsert би презаписал архивирания сезон 1.
    const latest = await prisma.season.findFirst({ orderBy: { index: "desc" } });
    await openSeason((latest?.index ?? 0) + 1, now);
    return;
  }

  if (active.endsAt <= now) {
    await prisma.season.update({ where: { id: active.id }, data: { active: false } });
    await openSeason(active.index + 1, now);
    logger.info({ from: active.index, to: active.index + 1 }, "season rolled over");
  }
}

async function openSeason(index: number, startsAt: Date): Promise<void> {
  const endsAt = new Date(startsAt.getTime() + env.SEASON_DAYS * 24 * 60 * 60 * 1000);
  await prisma.season.upsert({
    where: { index },
    create: { index, startsAt, endsAt, active: true },
    update: { active: true, startsAt, endsAt },
  });
  logger.info({ index, endsAt }, "season opened");
}
