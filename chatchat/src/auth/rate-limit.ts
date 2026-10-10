import { createHash } from 'node:crypto';
import {
  MemoryStore,
  type ClientRateLimitInfo,
  type Options,
  type Store,
} from 'express-rate-limit';
import type { Redis } from 'ioredis';

/**
 * Общите лимити на заявките (§15.1) за няколко инстанции на API-то (NFR-06): броячът е в Redis,
 * иначе всяка инстанция би пускала своя лимит (×N). Ключът (потребител или IP) се пази само като
 * хеш с префикса на лимита — без IP адреси в Redis; срокът на ключа е прозорецът. Redis недостъпен
 * → броячът в паметта на инстанцията (по-слаб лимит, но не отказ на входа).
 *
 * Без REDIS_URL (една инстанция, тестове) `sharedStore` връща undefined → express-rate-limit ползва
 * своя MemoryStore, както досега. Фабриката се задава от createApp ПРЕДИ рутерите (те правят
 * лимитите си при създаване); всеки лимит иска собствено име (и собствен Store — правилото на
 * express-rate-limit).
 */

export type RateLimitStoreFactory = (name: string) => Store;

let factory: RateLimitStoreFactory | null = null;

/** Задава (или маха с null) общото хранилище за следващите лимити. */
export function useRateLimitStores(next: RateLimitStoreFactory | null): void {
  factory = next;
}

/** Хранилището на лимит с това име — или undefined (паметта на процеса). */
export function sharedStore(name: string): Store | undefined {
  return factory?.(name);
}

/** INCR + срок при първия удар, атомарно; връща [удари, оставащи ms]. */
const INCREMENT_LUA = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}`;

const DECREMENT_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 and tonumber(redis.call('GET', KEYS[1])) > 0 then
  redis.call('DECR', KEYS[1])
end
return 1`;

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;
  private readonly fallback = new MemoryStore();

  constructor(
    private readonly redis: Redis,
    name: string,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {
    this.prefix = `chatchat:rl:${name}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  private key(key: string): string {
    return this.prefix + createHash('sha256').update(key).digest('hex').slice(0, 32);
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const reply = await this.redis.eval(INCREMENT_LUA, 1, this.key(key), String(this.windowMs));
      if (!Array.isArray(reply)) throw new Error('bad_reply');
      const hits = Number(reply[0]);
      const ttl = Number(reply[1]);
      if (!Number.isInteger(hits) || !Number.isFinite(ttl)) throw new Error('bad_reply');
      return { totalHits: hits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    } catch (err) {
      this.onError(err);
      return this.fallback.increment(key);
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const k = this.key(key);
      const [hits, ttl] = await Promise.all([this.redis.get(k), this.redis.pttl(k)]);
      if (hits === null) return undefined;
      return { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    } catch (err) {
      this.onError(err);
      return this.fallback.get(key);
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.redis.eval(DECREMENT_LUA, 1, this.key(key));
    } catch (err) {
      this.onError(err);
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.redis.del(this.key(key));
    } catch (err) {
      this.onError(err);
    }
    await this.fallback.resetKey(key);
  }
}
