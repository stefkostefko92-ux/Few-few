import { config } from './config.js';
import { withCache } from './data/cached-repo.js';
import { PrismaRepo } from './data/prisma-repo.js';
import { prisma } from './db.js';
import { RedisLiveSource } from './live.js';
import { logger } from './logger.js';
import { createWebRedis } from './queue.js';
import { createServer } from './server.js';

const cfg = config();
const redis = createWebRedis(cfg.REDIS_URL);
// Без слушател ioredis хвърля „Unhandled error event“ при всеки опит за връзка.
redis.on('error', (error: Error) => {
  logger.warn({ err: error.message }, 'Redis: грешка във връзката');
});

const app = createServer({
  repo: withCache(new PrismaRepo(prisma)),
  live: new RedisLiveSource(redis),
  health: {
    db: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    redis: async () => {
      const answer = await redis.ping();
      if (answer !== 'PONG') throw new Error('Redis не отговори с PONG');
    },
  },
});

const server = app.listen(cfg.PORT, cfg.HOST, () => {
  logger.info({ port: cfg.PORT, host: cfg.HOST }, 'cs2dm сайтът слуша');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'спиране');
  server.close();
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'базата');
  }
  redis.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
