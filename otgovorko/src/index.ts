import { PrismaClient } from '@prisma/client';
import { PrismaOwnerStore } from './auth/prisma-owner-store.js';
import { loadConfig } from './config.js';
import { VertexDraftModel } from './draft/model.js';
import { startWorker } from './draft/worker.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';
import { PrismaTicketStore } from './tickets/prisma.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = new PrismaClient();
  await db.$connect();
  const tickets = new PrismaTicketStore(db, config.dataKey);
  const model = config.vertexProjectId
    ? new VertexDraftModel({ projectId: config.vertexProjectId, region: config.vertexRegion })
    : null;
  if (!model) logger.warn('VERTEX_PROJECT_ID липсва — без чернови, писмата чакат човек');
  const stopWorker = startWorker({
    store: tickets,
    model,
    now: () => new Date(),
    canary: config.leakCanary,
    allowedDomains: config.allowedLinkDomains,
    draftModel: config.draftModel,
    retentionDays: config.retentionDays,
  });
  const app = createApp({
    config,
    tickets,
    owners: new PrismaOwnerStore(db),
    now: () => new Date(),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    pingDb: async () => {
      await db.$queryRaw`SELECT 1`;
      return true;
    },
    onError: (info) => logger.error(info, 'request failed'),
  });
  const server = app.listen(config.httpPort, '0.0.0.0', () =>
    logger.info({ port: config.httpPort, region: config.vertexRegion }, 'otgovorko listening'),
  );
  const stop = (): void => {
    stopWorker();
    server.close(() => void db.$disconnect().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : 'unknown' }, 'startup failed');
  process.exit(1);
});
