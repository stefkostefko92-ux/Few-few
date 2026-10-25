import { Redis, type RedisOptions } from 'ioredis';

/**
 * Опашката на работника. Името е без двоеточие — BullMQ 5 отказва `new Queue('a:b')`; ключовете в
 * Redis пак са с префикса на договора (`cs2dm:`) през `prefix`.
 */
export const MAINTENANCE_QUEUE = 'cs2dm-maintenance';
export const BULL_PREFIX = 'cs2dm:bull';
export const PURGE_JOB = 'purge-retention';
/** На 6 часа (в :17, извън кръглия час): след престой работникът наваксва бързо, партидите са малки. */
export const PURGE_SCHEDULE = '17 */6 * * *';
/** Значките на седмичната купа (CONTRACT §17): всеки час в :07 — завършилата седмица се връчва до час след края. */
export const CUP_JOB = 'cup-awards';
export const CUP_SCHEDULE = '7 * * * *';

/** Връзка за BullMQ: `maxRetriesPerRequest: null` е изискване на BullMQ за блокиращите команди. */
export function createQueueRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Връзка за сайта (живото състояние, /health): без опашка при прекъсване и с кратки таймаути —
 * паднал Redis прави статуса „неизвестен“ веднага, вместо страницата да виси.
 */
export function createWebRedis(url: string, overrides: RedisOptions = {}): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    ...overrides,
  });
}
