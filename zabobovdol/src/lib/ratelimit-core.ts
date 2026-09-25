// Чистата логика на ограничителя на заявки — без `server-only` и `next/headers`,
// за да може да се тества. Обвивката за приложението е в ./ratelimit.ts.
//
// Ключовете съдържат IP адреса на посетителя — това е лична информация, затова
// изтеклите записи се чистят по ВРЕМЕ (веднъж на `sweepEveryMs`), а не само
// когато станат много. Иначе при малък трафик IP адресите и часовете стояха в
// паметта до рестарт.
//
// Всеки запис пази СВОЯ прозорец: ако се чистеше по прозореца на текущата
// заявка, честото търсене (5 мин) щеше да трие записите на входа (15 мин) и да
// отслаби защитата срещу налучкване на пароли.

/** Най-дългият прозорец, който приложението има право да ползва. Политиката за
 *  поверителност обещава, че IP адресите се пазят „до 20 минути“ — прозорец +
 *  интервал на чистене трябва да остане под това. Тест го пази. */
export const MAX_WINDOW_MS = 15 * 60 * 1000;
export const SWEEP_EVERY_MS = 60 * 1000;

export function createRateLimiter(sweepEveryMs = SWEEP_EVERY_MS) {
  const hits = new Map<string, { t: number[]; w: number }>();
  let lastSweep = 0;

  function sweep(now: number): void {
    if (now - lastSweep < sweepEveryMs && hits.size <= 5000) return;
    lastSweep = now;
    for (const [k, v] of hits) {
      if (v.t.every((t) => now - t >= v.w)) hits.delete(k);
    }
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

  return { hit, has: (key: string) => hits.has(key) };
}
