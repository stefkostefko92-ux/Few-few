import { Worker } from 'bullmq';
import { logger } from '../logger.js';
import { purgeExpiredSessions } from '../auth/sessions.js';
import { refreshExpiringTokens } from '../services/accounts.js';
import { runAutopilot, runAutopilotForBrand } from '../services/autopilot.js';
import { syncAllInsights } from '../services/insights.js';
import { publishPost } from '../services/publish.js';
import { processPrivateReply, purgeOldReplies } from '../services/replies.js';
import {
  AUTOPILOT_JOB,
  INSIGHTS_JOB,
  PUBLISH_JOB,
  PUBLISH_QUEUE,
  REFRESH_JOB,
  REPLY_JOB,
  createRedis,
  scheduleManagement,
  scheduleTokenRefresh,
  type AutopilotJobData,
  type PublishJobData,
  type ReplyJobData,
} from './publish-queue.js';

async function main(): Promise<void> {
  await scheduleTokenRefresh();
  await scheduleManagement();

  const worker = new Worker(
    PUBLISH_QUEUE,
    async (job) => {
      if (job.name === REFRESH_JOB) {
        const result = await refreshExpiringTokens();
        const purgedSessions = await purgeExpiredSessions();
        // commentId е псевдонимен личен данен — живее само срока от конфигурацията (PR22).
        const purgedReplies = await purgeOldReplies();
        logger.info(
          { ...result, purgedSessions, purgedReplies },
          'подновяване на токени, чистене на сесии и стари лични съобщения',
        );
        return { ...result, purgedSessions, purgedReplies };
      }
      if (job.name === REPLY_JOB) {
        const { replyId } = job.data as ReplyJobData;
        const attempts = job.opts.attempts ?? 1;
        return processPrivateReply(replyId, { lastAttempt: job.attemptsMade + 1 >= attempts });
      }
      if (job.name === PUBLISH_JOB) {
        const { postId } = job.data as PublishJobData;
        return publishPost(postId);
      }
      if (job.name === INSIGHTS_JOB) {
        const summary = await syncAllInsights();
        logger.info(summary, 'синхронизация на Insights');
        return summary;
      }
      if (job.name === AUTOPILOT_JOB) {
        const { brandId } = job.data as AutopilotJobData;
        const outcomes = brandId
          ? [await runAutopilotForBrand(brandId, 'manual')]
          : await runAutopilot();
        logger.info({ outcomes }, 'цикъл на автопилота');
        return outcomes;
      }
      throw new Error(`Непозната задача: ${job.name}`);
    },
    { connection: createRedis(), concurrency: 2 },
  );

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error.message }, 'задачата се провали');
  });
  // Без този слушател BullMQ мълчи при паднал Redis: процесът е „running“,
  // а нито един пост не излиза (Наблюдателя, 2026-09-24).
  worker.on('error', (error) => {
    logger.error({ err: error.message }, 'работникът загуби връзка с опашката');
  });

  const shutdown = async (): Promise<void> => {
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  logger.info('работникът на Piuma е готов');
}

main().catch((error: unknown) => {
  logger.error({ err: error instanceof Error ? error.message : error }, 'работникът не тръгна');
  process.exit(1);
});
