import { Worker } from 'bullmq';

import { sendMunicipalityEmail } from './email/municipality.js';
import { assertSmtpConfig } from './email/transport.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { redisConnection } from './queue/connection.js';
import { EMAIL_QUEUE, type EmailJobData } from './queue/email.js';

// Спира веднага при липсваща SMTP конфигурация, вместо да се проваля тихо по-късно.
assertSmtpConfig();

/**
 * Отделен процес, който консумира опашката и препраща одобрените сигнали към
 * общината по имейл. Стартира се с `npm run worker` редом до API процеса.
 */
const worker = new Worker<EmailJobData>(
  EMAIL_QUEUE,
  async (job) => {
    await sendMunicipalityEmail(job.data.reportId);
  },
  { connection: redisConnection(), concurrency: 4 },
);

worker.on('ready', () => {
  logger.info({ queue: EMAIL_QUEUE }, 'email worker готов');
});
worker.on('completed', (job) => {
  logger.info({ jobId: job.id, reportId: job.data.reportId }, 'email job завършена');
});
worker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, reportId: job?.data.reportId, err },
    'email job се провали',
  );
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'спиране на worker');
  void worker
    .close()
    .finally(() => prisma.$disconnect())
    .finally(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
