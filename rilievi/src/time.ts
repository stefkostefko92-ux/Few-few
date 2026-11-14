/**
 * Часовата зона на бизнеса: „днешната дата“ по подразбиране в схемата и датите на екрана и в PDF-а са
 * по Рим — независимо къде е сървърът и откъде отваря техникът.
 */
export const BUSINESS_TZ = 'Europe/Rome';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const isoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Денят като `YYYY-MM-DD` в часовата зона на бизнеса (en-CA дава точно този формат). */
export function businessDay(at: Date = new Date()): string {
  return isoDay.format(at);
}

/** `YYYY-MM-DD` → Date в полунощ UTC — така Prisma записва колона `@db.Date` без отместване. */
export function dateFromDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Колона `@db.Date` (полунощ UTC) → `YYYY-MM-DD`. */
export function dayFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
