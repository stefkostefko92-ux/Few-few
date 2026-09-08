import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

export const PUBLISH_QUEUE = 'publikator:publish';
export const REFRESH_JOB = 'refresh-tokens';
export const PUBLISH_JOB = 'publish-post';

export interface PublishJobData {
  postId: string;
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
