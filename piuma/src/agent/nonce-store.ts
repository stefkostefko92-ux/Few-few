import type { Redis } from 'ioredis';

/** Пази видяните nonce-ове поне колкото е прозорецът на подписа — повторна заявка се отхвърля. */
export interface NonceStore {
  /** true = нов (приет); false = вече видян. Хвърля при недостъпен склад — fail-closed. */
  claim(keyId: string, nonce: string, ttlSeconds: number): Promise<boolean>;
}

export class RedisNonceStore implements NonceStore {
  constructor(private readonly redis: Redis) {}

  async claim(keyId: string, nonce: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      `piuma:nonce:${keyId}:${nonce}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }
}

/** За тестове и еднопроцесна разработка. */
export class MemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>();

  async claim(keyId: string, nonce: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    for (const [key, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(key);
    }
    const key = `${keyId}:${nonce}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + ttlSeconds * 1000);
    return true;
  }
}
