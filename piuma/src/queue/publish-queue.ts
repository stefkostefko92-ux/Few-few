import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

export const PUBLISH_QUEUE = 'piuma:publish';
export const REFRESH_JOB = 'refresh-tokens';
export const PUBLISH_JOB = 'publish-post';
export const INSIGHTS_JOB = 'sync-insights';
export const AUTOPILOT_JOB = 'autopilot';

export interface PublishJobData {
  postId: string;
}

/** Без brandId = всички управлявани брандове (седмичният цикъл). */
export interface AutopilotJobData {
  brandId?: string;
}

export function createRedis(): Redis {
  return new Redis(config().REDIS_URL, { maxRetriesPerRequest: null });
}

let queue: Queue | null = null;

export function publishQueue(): Queue {
  queue ??= new Queue(PUBLISH_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  return queue;
}

/** Идемпотентност: jobId = postId, за да не се публикува два пъти един пост. */
export async function enqueuePublish(postId: string, runAt?: Date): Promise<void> {
  const delay = runAt ? Math.max(runAt.getTime() - Date.now(), 0) : 0;
  await publishQueue().add(PUBLISH_JOB, { postId } satisfies PublishJobData, {
    jobId: `post:${postId}`,
    delay,
  });
}

export async function scheduleTokenRefresh(): Promise<void> {
  await publishQueue().add(
    REFRESH_JOB,
    {},
    { repeat: { pattern: '0 3 * * *' }, jobId: 'token-refresh' },
  );
}

/** Повтарящи се задачи на управлението: Insights всеки ден в 04:30, автопилот понеделник 06:00. */
export async function scheduleManagement(): Promise<void> {
  await publishQueue().add(
    INSIGHTS_JOB,
    {},
    { repeat: { pattern: '30 4 * * *' }, jobId: 'insights-daily' },
  );
  await publishQueue().add(
    AUTOPILOT_JOB,
    {},
    { repeat: { pattern: '0 6 * * 1' }, jobId: 'autopilot-weekly' },
  );
}

/** „Пусни сега“ от панела — идемпотентно за бранд, докато предишният цикъл не е приключил. */
export async function enqueueAutopilot(brandId: string): Promise<void> {
  await publishQueue().add(AUTOPILOT_JOB, { brandId } satisfies AutopilotJobData, {
    jobId: `autopilot:${brandId}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  });
}

export async function enqueueInsightsSync(): Promise<void> {
  await publishQueue().add(
    INSIGHTS_JOB,
    {},
    {
      jobId: `insights:${Math.floor(Date.now() / 60_000)}`,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/** Маха чакащата задача на пост (отмяна/отказ/повторение) — идемпотентно. */
export async function removeScheduledJob(postId: string): Promise<void> {
  const job = await publishQueue().getJob(`post:${postId}`);
  if (job) {
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting' || state === 'prioritized') await job.remove();
  }
}
