/**
 * Времето на писмата (чисти функции): местното време на човека (IANA зона), тихите часове и
 * повторните опити. Тихите часове важат за ВСИЧКИ писма, и за спешните (правото на
 * „изключване“ — L. 81/2017 за Италия); спешното остава веднага в приложението.
 */

export interface LocalTime {
  /** YYYY-MM-DD по зоната — ключът на дневния дайджест. */
  date: string;
  /** Минути от полунощ (0…1439). */
  minutes: number;
}

export function localTime(at: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** [start, end) по местното време; start > end — през полунощ (22:00–07:00). */
export function inQuietHours(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Кога свършват тихите часове, ако сега е в тях (иначе null). Сметката е по минути от „сега“ —
 * при смяна на лятното часово време писмото може да тръгне с час по-рано/късно (приемливо).
 */
export function quietUntil(
  now: Date,
  timeZone: string,
  quiet: { start: number | null; end: number | null },
): Date | null {
  if (quiet.start === null || quiet.end === null) return null;
  const { minutes } = localTime(now, timeZone);
  if (!inQuietHours(minutes, quiet.start, quiet.end)) return null;
  const delta = (quiet.end - minutes + 1440) % 1440 || 1440;
  const atMinute = now.getTime() - (now.getTime() % 60_000);
  return new Date(atMinute + delta * 60_000);
}

/** Повтор след 1, 2, 4… минути, най-много час. */
export function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
}
