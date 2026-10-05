import { config } from './config.js';
import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';
import { loadGeoIp } from './auth/geoip.js';
import { loadEngine } from './services/engine.js';
import { startMaintenance } from './services/maintenance.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const cfg = config();
  await loadGeoIp();
  await loadEngine();
  const server = createServer().listen(cfg.PORT, cfg.HOST, () => {
    logger.info({ port: cfg.PORT, host: cfg.HOST }, 'Rendetto слуша');
  });
  const timer = startMaintenance();
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'спиране');
    clearInterval(timer);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: errorMessage(error) }, 'процесът не тръгна');
  process.exit(1);
});
