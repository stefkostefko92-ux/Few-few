import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { closeEmailQueue } from './queue/email.js';
import { ensureMediaDirs } from './reports/media.js';

async function start(): Promise<void> {
  await ensureMediaDirs();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Помагам API стартира');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'спиране на API');
    server.close(() => {
      void closeEmailQueue()
        .catch(() => undefined)
        .finally(() => prisma.$disconnect())
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error: unknown) => {
  logger.error({ err: error }, 'API не успя да стартира');
  process.exit(1);
});
