import { Queue } from 'bullmq';

import { redisConnection } from './connection.js';

export const EMAIL_QUEUE = 'municipality-email';

export type EmailJobData = {
  reportId: string;
};

let queue: Queue<EmailJobData> | null = null;

/** Лениво създаден продуцент — Redis не се закача, докато не подадем сигнал. */
function getQueue(): Queue<EmailJobData> {
  const existing = queue;
  if (existing) {
    return existing;
  }
  const created = new Queue<EmailJobData>(EMAIL_QUEUE, {
    connection: redisConnection(),
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
 * worker-ът пък е идемпотентен по статус, така че дубликат не вреди.
 */
export async function enqueueMunicipalityEmail(reportId: string): Promise<void> {
  const q = getQueue();
  await q.remove(reportId).catch(() => undefined);
  await q.add('send', { reportId }, { jobId: reportId });
}

/** Затваря връзката на продуцента при спиране на процеса. */
export async function closeEmailQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
