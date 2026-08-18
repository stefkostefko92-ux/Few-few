// backend/src/lib/rateLimitStore.js
// Redis хранилище за `express-rate-limit` (v7 Store интерфейс).
//
// ЗАЩО (одит 11.08.2026): броячите срещу НАЛУЧКВАНЕ вече живеят в Redis, но
// самите РЕЙТ ЛИМИТИ още стояха в паметта на процеса (подразбиращият се
// MemoryStore). Това оставяше две реални дупки:
//   1. РЕСТАРТ ГИ НУЛИРА. Всеки деплой изчистваше квотите — нападателят просто
//      изчаква рестарт (или го предизвиква с товар) и почва отначало.
//   2. НЕ СЕ ДЕЛЯТ между процеси. При втора реплика утре всяка би пазила
//      собствен брояч, тоест реалният таван е N × обявения.
//
// Пише се на ръка, вместо да се добавя `rate-limit-redis`: интерфейсът е три
// метода, клиентът вече съществува, а всяка нова зависимост в пътя на
// автентикацията е нова повърхност.
//
// ПОВЕДЕНИЕ ПРИ ОТКАЗ НА REDIS: пада обратно към подадения резервен MemoryStore.
// Съзнателно fail-open по НАЛИЧНОСТ — паднал Redis не бива да заключи целия
// вход; защитата отслабва до „както беше досега", а тайните и без това са
// защитени криптографски и от bruteForce слоя (който сам решава по-лошото от
// памет и Redis).
import { MemoryStore } from "express-rate-limit";
import { getRedis } from "./redisClient.js";

export class RedisRateLimitStore {
  constructor(prefix = "rl") {
    this.prefix = prefix;
    this.fallback = new MemoryStore();
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.windowSec = Math.max(1, Math.ceil(options.windowMs / 1000));
    this.fallback.init(options);
  }

  key(k) {
    return `${this.prefix}:${k}`;
  }

  async increment(k) {
    const redis = getRedis();
    if (!redis) return this.fallback.increment(k);
    try {
      // INCR + EXPIRE в един курс. `expire … NX` слага срок САМО при първото
      // увеличение — иначе всяка заявка би удължавала прозореца и лимитът
      // никога не би се нулирал за активен клиент (класически плъзгащ капан).
      const p = redis.pipeline();
      p.incr(this.key(k));
      p.expire(this.key(k), this.windowSec, "NX");
      p.pttl(this.key(k));
      const res = await p.exec();
      if (!res) return this.fallback.increment(k);

      const totalHits = Number(res[0]?.[1]) || 1;
      const ttlMs = Number(res[2]?.[1]);
      const resetTime = new Date(Date.now() + (ttlMs > 0 ? ttlMs : this.windowMs));
      return { totalHits, resetTime };
    } catch {
      return this.fallback.increment(k);
    }
  }

  async decrement(k) {
    const redis = getRedis();
    if (!redis) return this.fallback.decrement(k);
    try {
      await redis.decr(this.key(k));
    } catch {
      return this.fallback.decrement(k);
    }
  }

  async resetKey(k) {
    const redis = getRedis();
    if (!redis) return this.fallback.resetKey(k);
    try {
      await redis.del(this.key(k));
    } catch {
      return this.fallback.resetKey(k);
    }
  }
}

/** Удобен конструктор — по едно хранилище (и префикс) на лимитер. */
export function redisStore(prefix) {
  return new RedisRateLimitStore(prefix);
}
