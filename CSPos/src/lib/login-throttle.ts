// Защита срещу brute-force на ПИН: временно заключване по код на оператор след
// няколко поредни неуспешни опита. В паметта на процеса (касата е един Node
// процес — десктоп/самостоятелен сървър), нулира се при рестарт и при успех.

const MAX_FAILS = 5; // опити преди заключване
const LOCK_MS = 60_000; // 60 секунди заключване
const RESET_MS = 5 * 60_000; // изчистване на брояча при бездействие

interface Entry {
  fails: number;
  lockedUntil: number;
  last: number;
}

const attempts = new Map<number, Entry>();

/** Заключен ли е операторът? Връща оставащото време (ms), 0 ако е свободен. */
export function lockedFor(operatorCode: number): number {
  const e = attempts.get(operatorCode);
  if (!e) return 0;
  const now = Date.now();
  if (now - e.last > RESET_MS) {
    attempts.delete(operatorCode);
    return 0;
  }
  return e.lockedUntil > now ? e.lockedUntil - now : 0;
}

/** Регистрира неуспешен опит; заключва при достигане на прага. */
export function recordFail(operatorCode: number): void {
  const now = Date.now();
  const e = attempts.get(operatorCode) ?? { fails: 0, lockedUntil: 0, last: now };
  if (now - e.last > RESET_MS) e.fails = 0;
  e.fails += 1;
  e.last = now;
  if (e.fails >= MAX_FAILS) {
    e.lockedUntil = now + LOCK_MS;
    e.fails = 0; // след заключване броим наново
  }
  attempts.set(operatorCode, e);
}

/** Успешен вход — изчиства историята за оператора. */
export function recordSuccess(operatorCode: number): void {
  attempts.delete(operatorCode);
}
