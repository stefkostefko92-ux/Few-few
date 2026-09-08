import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { createServer } from './server.js';

const cfg = config();
const server = createServer().listen(cfg.PORT, () => {
  logger.info({ port: cfg.PORT }, 'Публикатор слуша');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'спиране');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
