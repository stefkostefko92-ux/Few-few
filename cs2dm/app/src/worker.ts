import { Queue, Worker } from 'bullmq';
import { config } from './config.js';
import { prismaDeleteBatch } from './data/purge-sql.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import {
  BULL_PREFIX,
  MAINTENANCE_QUEUE,
  PURGE_JOB,
  PURGE_SCHEDULE,
  createQueueRedis,
} from './queue.js';
import { PURGE_TARGETS, purge, type PurgeResult } from './retention.js';

/**
 * Работникът: чистенето по сроковете (CONTRACT.md §7) като повтаряща се задача на BullMQ.
 * Планировчикът е идемпотентен (`upsertJobScheduler` по име) — всеки рестарт го презаписва,
 * вместо да добави втори.
 */
async function runPurge(): Promise<PurgeResult[]> {
  const deleteBatch = prismaDeleteBatch(prisma);
  const now = new Date();
  const results: PurgeResult[] = [];
  for (const target of PURGE_TARGETS) {
    const result = await purge(target, deleteBatch, now);
    logger.info(result, 'чистене по срок');
    results.push(result);
  }
  return results;
}

async function main(): Promise<void> {
  const cfg = config();
  const queue = new Queue(MAINTENANCE_QUEUE, {
    connection: createQueueRedis(cfg.REDIS_URL),
    prefix: BULL_PREFIX,
  });
  await queue.upsertJobScheduler(
    PURGE_JOB,
    { pattern: PURGE_SCHEDULE, tz: 'UTC' },
    {
      name: PURGE_JOB,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    },
  );

  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      if (job.name === PURGE_JOB) return runPurge();
      throw new Error(`Непозната задача: ${job.name}`);
    },
    { connection: createQueueRedis(cfg.REDIS_URL), prefix: BULL_PREFIX, concurrency: 1 },
  );
  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error.message }, 'задачата се провали');
  });
  // Без този слушател BullMQ мълчи при паднал Redis: процесът „работи“, а нищо не се чисти.
  worker.on('error', (error) => {
    logger.error({ err: error.message }, 'работникът загуби връзка с опашката');
  });

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  logger.info({ schedule: PURGE_SCHEDULE }, 'работникът на cs2dm е готов');
}

main().catch((error: unknown) => {
  logger.error(
    { err: error instanceof Error ? error.message : String(error) },
    'работникът не тръгна',
  );
  process.exit(1);
});
