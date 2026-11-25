/**
 * Броене на времето на сесията за напомнянето „Играете от X мин“ (клиентско —
 * помощ за играча). Дневният лимит се брои и налага от сървъра по изиграните
 * мачове (GET /api/account/responsible → playedTodayMinutes). Сесията живее в
 * sessionStorage (раздела); всеки достъп е в try/catch (частен режим).
 */

const SESSION_KEY = "aso.play.sessionStart";

export function sessionStart(now = Date.now()): number {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= now) return n;
    sessionStorage.setItem(SESSION_KEY, String(now));
  } catch {
    /* частен режим */
  }
  return now;
}

/** Минути от началото на сесията. */
export function sessionMinutes(start: number, now = Date.now()): number {
  return Math.max(0, Math.floor((now - start) / 60_000));
}

/** Следващият праг на напомнянето след `elapsed` минути (кратно на интервала). */
export function nextRealityCheck(elapsed: number, interval: number): number {
  return (Math.floor(elapsed / interval) + 1) * interval;
}
