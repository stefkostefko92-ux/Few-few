// Чистата логика на ограничителя на заявки — без `server-only` и `next/headers`,
// за да може да се тества. Обвивката за приложението е в ./ratelimit.ts.
//
// Ключовете съдържат IP адреса на посетителя — това е лична информация, затова
// изтеклите записи се чистят по ВРЕМЕ (веднъж на `sweepEveryMs`), а не само
// когато станат много. Чисти го таймер (unref — не държи процеса жив), а не
// само следващата заявка: иначе при нула трафик (нощем) IP адресите и часовете
// стояха в паметта до първата нова заявка или до рестарт.
//
// Всеки запис пази СВОЯ прозорец: ако се чистеше по прозореца на текущата
// заявка, честото търсене (5 мин) щеше да трие записите на входа (15 мин) и да
// отслаби защитата срещу налучкване на пароли.

/** Най-дългият прозорец, който приложението има право да ползва. Политиката за
 *  поверителност обещава, че IP адресите се пазят „до 20 минути“ — прозорец +
 *  интервал на чистене трябва да остане под това. Тест го пази. */
export const MAX_WINDOW_MS = 15 * 60 * 1000;
export const SWEEP_EVERY_MS = 60 * 1000;

export type RateLimiterOptions = {
  /** false = без таймер (само чистене при заявка). По подразбиране таймерът е включен. */
  timer?: boolean;
  /** Часовник за таймера (за тестовете). */
  clock?: () => number;
};

export function createRateLimiter(sweepEveryMs = SWEEP_EVERY_MS, opts: RateLimiterOptions = {}) {
  const hits = new Map<string, { t: number[]; w: number }>();
  let lastSweep = 0;
  const clock = opts.clock ?? Date.now;

  function sweep(now: number, force = false): void {
    if (!force && now - lastSweep < sweepEveryMs && hits.size <= 5000) return;
    lastSweep = now;
    for (const [k, v] of hits) {
      if (v.t.every((t) => now - t >= v.w)) hits.delete(k);
    }
  }

  // Периодично чистене и без заявки. Най-дълго IP остава: прозорец (≤ MAX_WINDOW_MS)
  // + интервал (sweepEveryMs) — под обещаните 20 минути (тест го пази).
  let timer: ReturnType<typeof setInterval> | null = null;
  if (opts.timer !== false) {
    timer = setInterval(() => {
      if (hits.size) sweep(clock(), true);
    }, sweepEveryMs);
    (timer as { unref?: () => void }).unref?.();
  }

  /** true = разрешено, false = блокирано. */
  function hit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    sweep(now);
    const arr = (hits.get(key)?.t ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      hits.set(key, { t: arr, w: windowMs });
      return false;
    }
    arr.push(now);
    hits.set(key, { t: arr, w: windowMs });
    return true;
  }

  return {
    hit,
    has: (key: string) => hits.has(key),
    size: () => hits.size,
    /** Спира таймера (тестове). */
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
