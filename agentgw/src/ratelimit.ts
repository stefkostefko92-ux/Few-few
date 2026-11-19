import { isIPv4, isIPv6 } from 'node:net';

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

  /** Заявки в полет по кофа — още не знаем дали ще завършат с отказ. */
  private readonly pending = new Map<string, number>();

  /**
   * Резервира „удар“ в началото на заявката: откази + заявки в полет ≥ limit → false. Без това
   * паралелни заявки минават всички покрай прага, защото отказът се брои едва в края.
   * Всяко true се връща с release() (и при успех, и при отказ — отказът се брои отделно с add()).
   */
  reserve(bucket: string, limit: number): boolean {
    const n = this.pending.get(bucket) ?? 0;
    if (this.count(bucket) + n >= limit) return false;
    this.pending.set(bucket, n + 1);
    return true;
  }

  release(bucket: string): void {
    const n = this.pending.get(bucket) ?? 0;
    if (n <= 1) this.pending.delete(bucket);
    else this.pending.set(bucket, n - 1);
  }

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

/**
 * Кофа по клиент: IPv4 (и IPv4-mapped IPv6) — адресът; IPv6 — префиксът /64, защото един абонат
 * обикновено получава цял /64 и сменя адресите в него свободно (RFC 4941 временни адреси).
 */
export function clientBucket(ip: string): string {
  const addr = ip.split('%')[0]!;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
  if (mapped && isIPv4(mapped[1]!)) return mapped[1]!;
  if (!isIPv6(addr)) return addr;
  // Вграденият IPv4 (a.b.c.d) е винаги в долните 32 бита — брои се за две групи.
  const groups = (part: string) => (part ? part.split(':') : []);
  const width = (gs: string[]) => gs.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
  const [head = '', tail] = addr.split('::');
  const h = groups(head);
  const t = tail === undefined ? [] : groups(tail);
  const full = [...h, ...Array<string>(8 - width(h) - width(t)).fill('0'), ...t];
  const prefix = full.slice(0, 4).map((g) => parseInt(g, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}
