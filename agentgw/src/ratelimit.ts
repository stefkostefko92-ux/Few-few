/**
 * Фиксиран прозорец от 60 s в паметта на процеса. Шлюзът е един процес (systemd), затова
 * споделено хранилище не е нужно; при няколко инстанции → Redis (виж SECURITY.md).
 */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** true = позволено; false = над лимита за текущата минута. */
  take(bucket: string, limitPerMin: number): boolean {
    const t = this.now();
    const cur = this.hits.get(bucket);
    if (!cur || t - cur.windowStart >= 60_000) {
      this.hits.set(bucket, { windowStart: t, count: 1 });
      this.sweep(t);
      return limitPerMin >= 1;
    }
    cur.count += 1;
    return cur.count <= limitPerMin;
  }

  /** Секунди до края на прозореца — за Retry-After. */
  retryAfter(bucket: string): number {
    const cur = this.hits.get(bucket);
    if (!cur) return 1;
    return Math.max(1, Math.ceil((cur.windowStart + 60_000 - this.now()) / 1000));
  }

  private sweep(t: number): void {
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) if (t - v.windowStart >= 60_000) this.hits.delete(k);
  }
}

/**
 * Брояч на откази („Mitigate jailbreaks“ → repeat offenders): само брой по кофа в паметта на
 * процеса, фиксиран прозорец от първия отказ. Без съдържание, нищо не се записва.
 */
export class StrikeCounter {
  private readonly strikes = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  add(bucket: string): void {
    const t = this.now();
    const cur = this.strikes.get(bucket);
    if (!cur || t - cur.windowStart >= this.windowMs) {
      this.strikes.set(bucket, { windowStart: t, count: 1 });
      this.sweep(t);
      return;
    }
    cur.count += 1;
  }

  count(bucket: string): number {
    const cur = this.strikes.get(bucket);
    if (!cur || this.now() - cur.windowStart >= this.windowMs) return 0;
    return cur.count;
  }

  retryAfter(bucket: string): number {
    const cur = this.strikes.get(bucket);
    if (!cur) return 1;
    return Math.max(1, Math.ceil((cur.windowStart + this.windowMs - this.now()) / 1000));
  }

  private sweep(t: number): void {
    if (this.strikes.size < 10_000) return;
    for (const [k, v] of this.strikes)
      if (t - v.windowStart >= this.windowMs) this.strikes.delete(k);
  }
}
