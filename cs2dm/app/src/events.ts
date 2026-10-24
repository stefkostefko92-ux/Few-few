/**
 * Събитията по график (CONTRACT §12) — общото за панела и публичната страница: видовете, таваните
 * и превръщането на „местно време“ от формата (часовата зона на сайта, DISPLAY_TZ) в UTC и обратно.
 * Без библиотека: отместването се взима от Intl и се проверява на обратен път — несъществуващ час
 * (пролетното превключване) е невалиден, а не тихо преместен.
 */
export const EVENT_KINDS = ['XP_BOOST', 'MODE', 'COMMUNITY'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_TITLE_MAX = 80;
/** Най-дългото събитие и колко напред може да се планира. */
export const EVENT_MAX_DAYS = 14;
export const EVENT_HORIZON_DAYS = 365;
/** Колко напред показва публичната страница. */
export const EVENT_PUBLIC_DAYS = 30;

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function wallClock(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

/** Стойността на `<input type="datetime-local">` в дадената зона → UTC; невалидно → null. */
export function zonedToUtc(local: string, timeZone: string): Date | null {
  const match = LOCAL.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  if (!Number.isFinite(naive)) return null;
  let utc = naive - (wallClock(naive, timeZone) - naive);
  utc = naive - (wallClock(utc, timeZone) - utc);
  const result = new Date(utc);
  return utcToZonedInput(result, timeZone) === local.trim() ? result : null;
}

/** UTC → стойност за `<input type="datetime-local">` в дадената зона. */
export function utcToZonedInput(date: Date, timeZone: string): string {
  const wall = new Date(wallClock(date.getTime(), timeZone));
  return wall.toISOString().slice(0, 16);
}

/** Събитие за публичната страница — само видимото: заглавия, време, множител, режим. */
export interface PublicEvent {
  id: number;
  kind: EventKind;
  titles: { bg: string; en: string; it: string };
  startsAt: Date;
  endsAt: Date;
  /** Множителят в десети (10…30). */
  xpTenths: number;
  modeName: string | null;
}

export function isActive(event: Pick<PublicEvent, 'startsAt' | 'endsAt'>, now: Date): boolean {
  return event.startsAt.getTime() <= now.getTime() && event.endsAt.getTime() > now.getTime();
}

/** „×1,5“ — множителят за показ по езика (без float по пътя: десети → низ). */
export function formatMultiplier(tenths: number, decimalSeparator: string): string {
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  return fraction === 0 ? `×${whole}` : `×${whole}${decimalSeparator}${fraction}`;
}
