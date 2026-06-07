import type { ConnectionOptions } from 'bullmq';

import { env } from '../env.js';

/** Допълнителни опции за връзката (напр. таймаут за продуцента). */
type ConnectionOverrides = {
  commandTimeout?: number;
  connectTimeout?: number;
};

/**
 * Опции за връзка към Redis за BullMQ, извлечени от REDIS_URL. Подаваме обект
 * (а не готова инстанция), за да управлява BullMQ жизнения цикъл на връзката и
 * да я затвори при `close()`. `maxRetriesPerRequest: null` се изисква от worker.
 */
export function redisConnection(
  overrides: ConnectionOverrides = {},
): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null,
    ...overrides,
  };
}
