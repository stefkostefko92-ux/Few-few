import { Redis } from 'ioredis';

/**
 * Връзките към Redis 7 (опашките, pub/sub между инстанциите, лимитите, пазачът на TOTP). Адресът
 * носи паролата — НИКОГА не се логва; грешките се логват само с име/код и не по-често от веднъж на
 * 30 s (иначе всяко повторно свързване пълни лога). Ключовете на приложението са под `chatchat:`.
 */

export const KEY_PREFIX = 'chatchat';

export interface RedisLogger {
  warn(obj: object, msg: string): void;
}

export interface RedisOptions {
  /** Връзка за worker на BullMQ / абонат на pub/sub — без таван на повторенията на команда. */
  blocking?: boolean;
}

export function createRedis(
  url: string,
  name: string,
  logger: RedisLogger,
  opts: RedisOptions = {},
): Redis {
  const client = new Redis(url, {
    connectionName: `chatchat-${name}`,
    // BullMQ иска null за worker-ите; заявките на API-то (лимити, TOTP) отказват бързо.
    maxRetriesPerRequest: opts.blocking ? null : 2,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(200 * times, 5_000),
    reconnectOnError: (err) => /READONLY/.test(err.message),
  });
  let lastLog = 0;
  client.on('error', (err: NodeJS.ErrnoException) => {
    const now = Date.now();
    if (now - lastLog < 30_000) return;
    lastLog = now;
    logger.warn({ redis: name, errName: err.name, code: err.code ?? null }, 'Redis');
  });
  return client;
}

/** Затваряне без да хвърля (спиране на процеса). */
export async function closeRedis(client: Redis): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
