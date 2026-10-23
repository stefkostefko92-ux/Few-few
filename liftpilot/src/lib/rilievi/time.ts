// The business's time zone: the default "today" of a sheet and the dates on the screen and in the PDF are Rome's —
// wherever the server is and wherever the technician opens it from. Ported from rilievi (src/time.ts).
export const BUSINESS_TZ = 'Europe/Rome';

const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The day as `YYYY-MM-DD` in the business's time zone (taken from the parts, whatever the runtime's CLDR data). */
export function businessDay(at: Date = new Date()): string {
  const part = (type: string) => isoDay.formatToParts(at).find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** `YYYY-MM-DD` → a Date at midnight UTC: that is how Prisma writes a `@db.Date` column without a shift. */
export function dateFromDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A `@db.Date` column (midnight UTC) → `YYYY-MM-DD`. */
export function dayFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
