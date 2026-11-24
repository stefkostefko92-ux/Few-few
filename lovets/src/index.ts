import { PrismaClient } from '@prisma/client';
import { PrismaOwnerStore } from './auth/prisma-owner-store.js';
import { loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';
import { PrismaStore } from './store/prisma.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = new PrismaClient();
  await db.$connect();
  const app = createApp({
    config,
    store: new PrismaStore(db),
    owners: new PrismaOwnerStore(db),
    now: () => new Date(),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    pingDb: async () => {
      await db.$queryRaw`SELECT 1`;
      return true;
    },
    onError: (err) =>
      logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'request failed'),
  });
  const server = app.listen(config.httpPort, '0.0.0.0', () =>
    logger.info({ port: config.httpPort }, 'lovets listening'),
  );
  const stop = (): void => {
    server.close(() => void db.$disconnect().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : 'unknown' }, 'startup failed');
  process.exit(1);
});
