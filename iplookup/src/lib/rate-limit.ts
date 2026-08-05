/**
 * Ограничение на честотата — плъзгащ се прозорец в паметта.
 *
 * Нужно е точно на едно място: активната проверка отваря връзки от НАШИЯ сървър
 * към чужд адрес. Без спирачка инструментът се превръща в усилвател — всеки
 * може да ни накара да засипем трета страна. Затова ограничението не е
 * оптимизация, а условие изобщо функцията да съществува.
 *
 * В паметта, не в база: продуктът няма база нарочно. При няколко инстанции
 * лимитът е на инстанция — приемливо, защото зад тях стои и лимитът на Nginx.
 *
 * Чиста и тествана: часовникът се подава отвън, за да няма чакане в тестовете.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Колко заявки остават в текущия прозорец. */
  remaining: number;
  /** След колко секунди си струва да се опита пак. */
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitDecision {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > cutoff);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        // Толкова, колкото остава на НАЙ-СТАРАТА заявка да излезе от прозореца.
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);

    // Подрязване: без него картата расте с всеки нов ключ до края на процеса.
    if (this.hits.size > 10_000) this.prune(now);

    return { allowed: true, remaining: this.limit - recent.length, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      const recent = times.filter((time) => time > cutoff);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  /**
   * Изчиства броенето за един ключ.
   *
   * Ползва се след успешен вход: човек, който е сбъркал паролата веднъж и после
   * е влязъл, не бива да остава наказан до края на прозореца.
   */
  forget(key: string): void {
    this.hits.delete(key);
  }

  /** Само за тестове. */
  reset(): void {
    this.hits.clear();
  }
}
