import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@aso/db";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { rolloverSeasons } from "./jobs/seasons.js";
import { cleanupQuests } from "./jobs/quests.js";

const QUEUE_NAME = "aso-maintenance";

// BullMQ needs a connection with maxRetriesPerRequest=null.
const connection: ConnectionOptions = { url: env.REDIS_URL, maxRetriesPerRequest: null };

const handlers: Record<string, () => Promise<void>> = {
  "season-rollover": rolloverSeasons,
  "quest-cleanup": cleanupQuests,
};

async function main(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection });

  // Repeatable schedules (idempotent upserts keyed by jobId).
  await queue.add("season-rollover", {}, { repeat: { every: 60 * 60 * 1000 }, jobId: "season-rollover" });
  await queue.add("quest-cleanup", {}, { repeat: { pattern: "5 0 * * *" }, jobId: "quest-cleanup" });

  // Run a rollover immediately at boot so there is always an active season.
  await rolloverSeasons().catch((err) => logger.error({ err }, "initial rollover failed"));

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) {
        logger.warn({ job: job.name }, "no handler for job");
        return;
      }
      logger.debug({ job: job.name }, "running job");
      await handler();
    },
    { connection },
  );

  worker.on("failed", (job, err) => logger.error({ job: job?.name, err }, "job failed"));
  worker.on("completed", (job) => logger.debug({ job: job.name }, "job completed"));

  logger.info("🛠️  АСО worker started (maintenance queue)");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down worker");
    await Promise.allSettled([worker.close(), queue.close(), prisma.$disconnect()]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "fatal worker startup error");
  process.exit(1);
});

// Touch Redis import so a misconfigured URL fails fast at module load in dev.
void Redis;
