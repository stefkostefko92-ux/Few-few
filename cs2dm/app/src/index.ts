import { Redis } from 'ioredis';
import {
  AGENT_CHANNELS,
  BRIDGE_CHANNELS,
  RedisCommandChannel,
  UNAVAILABLE,
} from './admin/commands.js';
import { adminKeys } from './admin/keys.js';
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

// Отговорите на моста и агента идват по pub/sub — абонатът е отделна връзка (в режим на абонамент
// тя не може да прави други команди). Свързва се при първата команда.
const subscriber = new Redis(cfg.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});
subscriber.on('error', (error: Error) => {
  logger.warn({ err: error.message }, 'Redis (абонат): грешка във връзката');
});

const keys = adminKeys(cfg);
if (keys.invalid.length > 0) {
  // Само имената — стойностите на ключовете никога не стигат до лога.
  logger.error({ keys: keys.invalid }, 'невалидни ключове на панела — частта им е изключена');
}
const command = (key: string | null, channels: { cmd: string; ack: string }) =>
  key ? new RedisCommandChannel({ publisher: redis, subscriber, channels, key }) : UNAVAILABLE;

const live = new RedisLiveSource(redis);
const app = createServer({
  repo: withCache(new PrismaRepo(prisma)),
  live,
  health: {
    db: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    redis: async () => {
      const answer = await redis.ping();
      if (answer !== 'PONG') throw new Error('Redis не отговори с PONG');
    },
  },
  admin: {
    db: prisma,
    live,
    bridge: command(keys.bridgeKey, BRIDGE_CHANNELS),
    agent: command(keys.agentKey, AGENT_CHANNELS),
  },
});

const server = app.listen(cfg.PORT, cfg.HOST, () => {
  logger.info(
    {
      port: cfg.PORT,
      host: cfg.HOST,
      panel: keys.encKey !== null,
      bridge: keys.bridgeKey !== null,
      agent: keys.agentKey !== null,
    },
    'cs2dm сайтът слуша',
  );
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
  subscriber.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
