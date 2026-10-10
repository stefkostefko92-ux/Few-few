import type { Redis } from 'ioredis';
import { decryptSecret } from '../crypto.js';
import { totpStep, verifyTotp } from './totp.js';

/**
 * Помощници за втория фактор: пазач срещу повторно използван код и проверка на кода.
 * Издателят в приложението за удостоверяване (Google Authenticator, Aegis…) е „ChatChat“.
 */

export const MFA_ISSUER = 'ChatChat';

/**
 * Последната приета TOTP стъпка на човек — прихванат код не минава втори път в прозореца си.
 * `accept` е АТОМАРЕН: приема стъпката само ако е след последната — два паралелни опита със
 * същия код (и в две инстанции на API-то) минават най-много веднъж.
 */
export interface TotpReplayStore {
  lastStep(userId: string): Promise<number | null>;
  /** true → стъпката е приета (и запомнена); false → вече използван код. */
  accept(userId: string, step: number): Promise<boolean>;
  /** Нова тайна/нулиране — паметта за човека се забравя (без да се чака). */
  forget(userId: string): void;
}

/**
 * В паметта на процеса (една инстанция, без REDIS_URL); при рестарт се губи, което отваря най-много
 * ±1 стъпка (≤ 90 s) за вече използван код. С няколко инстанции — `RedisTotpReplayGuard`.
 */
export class TotpReplayGuard implements TotpReplayStore {
  private readonly last = new Map<string, number>();

  async lastStep(userId: string): Promise<number | null> {
    return this.last.get(userId) ?? null;
  }

  async accept(userId: string, step: number): Promise<boolean> {
    const prev = this.last.get(userId);
    if (prev !== undefined && step <= prev) return false;
    this.last.set(userId, step);
    // Стари стъпки не пазят нищо (прозорецът е ±1) — таванът не позволява растеж без край.
    if (this.last.size > 10_000) {
      const floor = totpStep(Date.now() / 1000) - 2;
      for (const [id, s] of this.last) if (s < floor) this.last.delete(id);
    }
    return true;
  }

  forget(userId: string): void {
    this.last.delete(userId);
  }
}

/** GET + сравнение + SET в една Lua стъпка (атомарно в Redis). */
const ACCEPT_LUA = `
local prev = redis.call('GET', KEYS[1])
if prev and tonumber(prev) >= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1`;

/** Стъпките остаряват за 90 s; ключът живее 5 мин. */
const TTL_MS = 5 * 60 * 1000;

/**
 * Общ за всички инстанции на API-то (NFR-06): последната стъпка е в Redis. Redis недостъпен →
 * пазачът в паметта (същият риск като при рестарт, ±1 стъпка), не отказ на входа на персонала.
 */
export class RedisTotpReplayGuard implements TotpReplayStore {
  private readonly local = new TotpReplayGuard();

  constructor(
    private readonly redis: Redis,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  private key(userId: string): string {
    return `chatchat:totp:${userId}`;
  }

  async lastStep(userId: string): Promise<number | null> {
    try {
      const raw = await this.redis.get(this.key(userId));
      const n = raw === null ? NaN : Number(raw);
      return Number.isInteger(n) ? n : null;
    } catch (err) {
      this.onError(err);
      return this.local.lastStep(userId);
    }
  }

  async accept(userId: string, step: number): Promise<boolean> {
    try {
      const ok = await this.redis.eval(
        ACCEPT_LUA,
        1,
        this.key(userId),
        String(step),
        String(TTL_MS),
      );
      return ok === 1;
    } catch (err) {
      this.onError(err);
      return this.local.accept(userId, step);
    }
  }

  forget(userId: string): void {
    this.local.forget(userId);
    this.redis.del(this.key(userId)).catch((err: unknown) => this.onError(err));
  }
}

/**
 * Проверява код срещу шифрованата тайна. Повреден запис или грешен ключ → false (fail-closed),
 * не 500 — човекът вижда „грешен код“, администраторът нулира MFA.
 */
export async function checkTotp(
  key: Buffer,
  replay: TotpReplayStore,
  user: { id: string; totpSecretEnc: string | null },
  code: string,
): Promise<boolean> {
  if (!user.totpSecretEnc) return false;
  let secret: string;
  try {
    secret = decryptSecret(user.totpSecretEnc, key);
  } catch {
    return false;
  }
  const step = verifyTotp(secret, code, await replay.lastStep(user.id));
  if (step === null) return false;
  return replay.accept(user.id, step);
}
