import { Worker } from 'bullmq';
import { logger } from '../logger.js';
import { purgeExpiredSessions } from '../auth/sessions.js';
import { refreshExpiringTokens } from '../services/accounts.js';
import { publishPost } from '../services/publish.js';
import {
  PUBLISH_JOB,
  PUBLISH_QUEUE,
  REFRESH_JOB,
  createRedis,
  scheduleTokenRefresh,
  type PublishJobData,
} from './publish-queue.js';

async function main(): Promise<void> {
  await scheduleTokenRefresh();

  const worker = new Worker(
    PUBLISH_QUEUE,
    async (job) => {
      if (job.name === REFRESH_JOB) {
        const result = await refreshExpiringTokens();
        const purgedSessions = await purgeExpiredSessions();
        logger.info({ ...result, purgedSessions }, 'подновяване на токени и чистене на сесии');
        return { ...result, purgedSessions };
      }
      if (job.name === PUBLISH_JOB) {
        const { postId } = job.data as PublishJobData;
        return publishPost(postId);
      }
      throw new Error(`Непозната задача: ${job.name}`);
    },
    { connection: createRedis(), concurrency: 2 },
  );

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error.message }, 'задачата се провали');
  });

  const shutdown = async (): Promise<void> => {
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  logger.info('работникът на Публикатор е готов');
}

main().catch((error: unknown) => {
  logger.error({ err: error instanceof Error ? error.message : error }, 'работникът не тръгна');
  process.exit(1);
});
