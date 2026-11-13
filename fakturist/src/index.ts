import { config } from './config.js';
import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';
import { createServer } from './server.js';
import { startOutboxLoop } from './mail/outbox.js';
import { startMaintenanceLoop } from './maintenance.js';
import { startBillingLoop } from './billing/loop.js';
import { startAutomationLoop } from './recurring/loop.js';

async function main(): Promise<void> {
  const cfg = config();
  const app = createServer();
  startOutboxLoop();
  startMaintenanceLoop();
  startBillingLoop();
  startAutomationLoop();
  const server = app.listen(cfg.PORT, cfg.HOST, () => {
    logger.info({ port: cfg.PORT }, 'fakturist слуша');
  });
  const stop = (signal: string) => {
    logger.info({ signal }, 'спиране');
    server.close(() => {
      prisma
        .$disconnect()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: errorMessage(error) }, 'процесът не тръгна');
  process.exit(1);
});
