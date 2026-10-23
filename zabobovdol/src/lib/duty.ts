// Чистата логика на графика на дежурните аптеки (без база и без server-only),
// за да може да се тества. Заявката към базата е в ./duty-db.ts.
//
// Датата в DutyRoster е календарен ден (@db.Date) и Prisma го връща като
// полунощ по UTC. „Днес“ идва от sofiaDay() — денят в София, пак като полунощ
// по UTC. Затова двете се сравняват по ключ „ГГГГ-ММ-ДД“ в UTC, а не по час.

/** Колко дни след днешния се показват в графика. */
export const DUTY_DAYS_AHEAD = 7;

const DAY_MS = 86_400_000;

/** Ключ „ГГГГ-ММ-ДД“ на календарния ден (полунощ по UTC). */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  return new Date(`${dayKey(d)}T00:00:00Z`);
}

export function addDays(day: Date, n: number): Date {
  return new Date(startOfDay(day).getTime() + n * DAY_MS);
}

/** Прозорецът за заявката: от днес (вкл.) до последния показван ден (вкл.). */
export function dutyRange(
  today: Date,
  daysAhead: number = DUTY_DAYS_AHEAD,
): { gte: Date; lt: Date } {
  const start = startOfDay(today);
  return { gte: start, lt: addDays(start, daysAhead + 1) };
}

export type DutyDay<T> = { key: string; date: Date; entries: T[] };

/**
 * Разделя записите на „днес“ и „следващите дни“. Записи извън прозореца и
 * с невалидна дата се пропускат. В един ден може да има повече от една
 * дежурна аптека — пазят се всички, в реда, в който са дошли.
 */
export function pickDuty<T extends { date: Date }>(
  rows: readonly T[],
  today: Date,
  daysAhead: number = DUTY_DAYS_AHEAD,
): { today: T[]; upcoming: DutyDay<T>[] } {
  const todayKey = dayKey(today);
  const lastKey = dayKey(addDays(today, daysAhead));
  const byDay = new Map<string, T[]>();
  for (const r of rows) {
    if (!(r.date instanceof Date) || Number.isNaN(r.date.getTime())) continue;
    const k = dayKey(r.date);
    if (k < todayKey || k > lastKey) continue;
    const list = byDay.get(k);
    if (list) list.push(r);
    else byDay.set(k, [r]);
  }
  const upcoming = [...byDay.keys()]
    .filter((k) => k !== todayKey)
    .sort()
    .map((k) => ({ key: k, date: new Date(`${k}T00:00:00Z`), entries: byDay.get(k) ?? [] }));
  return { today: byDay.get(todayKey) ?? [], upcoming };
}

// Календарният ден се показва в UTC — той вече Е денят (полунощ по UTC),
// затова не бива да се отмества с часовата зона на сървъра или на София.
const DAY_FMT = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** „събота, 24 октомври“ */
export function formatDutyDay(date: Date): string {
  return DAY_FMT.format(date);
}

/** „Днес, …“ / „Утре, …“ / „понеделник, …“ — по-лесно за четене. */
export function dutyDayLabel(date: Date, today: Date): string {
  const text = formatDutyDay(date);
  const k = dayKey(date);
  if (k === dayKey(today)) return `Днес, ${text}`;
  if (k === dayKey(addDays(today, 1))) return `Утре, ${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
