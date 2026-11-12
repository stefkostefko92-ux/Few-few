/**
 * Броене на времето в играта за инструментите за отговорна игра (клиентско —
 * напомнянето и дневният лимит са помощ за играча, не сървърна санкция; тя е
 * самоизключването). Сесията живее в sessionStorage (раздела), дневният сбор —
 * в localStorage по календарна дата. Всеки достъп е в try/catch (частен режим).
 */

const SESSION_KEY = "aso.play.sessionStart";
const DAILY_KEY = "aso.play.daily";

export interface DailyPlay {
  day: string; // YYYY-MM-DD (локална дата)
  minutes: number;
}

export function localDay(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Добави минути към дневния сбор; нов ден започва от нула. */
export function addDailyMinutes(prev: DailyPlay | null, minutes: number, today: string): DailyPlay {
  if (!prev || prev.day !== today) return { day: today, minutes };
  return { day: today, minutes: prev.minutes + minutes };
}

export function readDaily(today = localDay()): DailyPlay {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DailyPlay>) : null;
    if (parsed && parsed.day === today && typeof parsed.minutes === "number" && parsed.minutes >= 0) {
      return { day: today, minutes: Math.floor(parsed.minutes) };
    }
  } catch {
    /* няма хранилище — броим от нула */
  }
  return { day: today, minutes: 0 };
}

export function tickDaily(minutes = 1, today = localDay()): DailyPlay {
  const next = addDailyMinutes(readDaily(today), minutes, today);
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(next));
  } catch {
    /* без хранилище — само в паметта за този рендер */
  }
  return next;
}

/** Начало на сесията в този раздел (ms). */
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
