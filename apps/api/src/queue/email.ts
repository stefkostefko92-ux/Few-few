import { Queue } from 'bullmq';

import { redisConnection } from './connection.js';

export const EMAIL_QUEUE = 'municipality-email';

export type EmailJobData = {
  reportId: string;
};

let queue: Queue<EmailJobData> | null = null;

/** Таван на времето за поставяне на задача — пази API-то от блокиране при недостъпен Redis. */
const ENQUEUE_TIMEOUT_MS = 5_000;

/** Reject-ва, ако обещанието не приключи в срока (без да виси HTTP заявката). */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis не отговори за ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Лениво създаден продуцент — Redis не се закача, докато не подадем сигнал. */
function getQueue(): Queue<EmailJobData> {
  const existing = queue;
  if (existing) {
    return existing;
  }
  const created = new Queue<EmailJobData>(EMAIL_QUEUE, {
    // commandTimeout пази командите от безкрайно чакане, ако Redis падне.
    connection: redisConnection({ commandTimeout: ENQUEUE_TIMEOUT_MS }),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: false,
    },
  });
  queue = created;
  return created;
}

/**
 * Поставя одобрен сигнал на опашката за имейл към общината. `jobId` е id-то на
 * сигнала, за да не дублираме задача при бързо двойно одобрение. Премахваме
 * предишна задача със същото id, така че ръчното пре-изпращане винаги минава;
 * worker-ът пък е идемпотентен по статус, така че дубликат не вреди. Обвито в
 * таймаут — ако Redis е недостъпен, reject-ва, вместо да виси (одобрението не
 * пада заради това; извикващият го третира като „не е поставено на опашка").
 */
export async function enqueueMunicipalityEmail(reportId: string): Promise<void> {
  const q = getQueue();
  await withTimeout(
    (async () => {
      await q.remove(reportId).catch(() => undefined);
      await q.add('send', { reportId }, { jobId: reportId });
    })(),
    ENQUEUE_TIMEOUT_MS,
  );
}

/** Затваря връзката на продуцента при спиране на процеса. */
export async function closeEmailQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
