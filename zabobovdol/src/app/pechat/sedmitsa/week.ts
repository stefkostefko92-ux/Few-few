import type { Prisma } from "@prisma/client";
import { sofiaDay } from "@/lib/stats-core";
import { sofiaWallNow } from "@/lib/ingest-outages-core";
import { formatDate, formatTime } from "@/lib/format-date";

// Чистата логика на листа „Седмицата в Бобов дол“ (без база) — за тестовете.

const DAY_MS = 24 * 60 * 60 * 1000;

// Седемте дни от днес (по българско време): [start, end). start е полунощ UTC на
// софийската дата — същото, което Postgres пази в колона от тип date
// (DutyRoster.date), затова сравнението е точно.
export function weekWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = sofiaDay(now);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

// Главна само първата буква („Понеделник, 26 октомври“) — CSS capitalize би
// направил и месеца с главна, което на български е грешно.
export function capFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase("bg-BG") + s.slice(1) : s;
}

// Датата на дежурството е „чиста“ дата (полунощ UTC) → форматираме в UTC, за
// да не се измести с ден.
export function fmtDutyDay(d: Date): string {
  return capFirst(
    new Intl.DateTimeFormat("bg-BG", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d),
  );
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// „23 – 29 октомври 2026 г.“ / „30 октомври – 5 ноември 2026 г.“
export function fmtWeekRange(start: Date, endExclusive: Date): string {
  const last = new Date(endExclusive.getTime() - DAY_MS);
  const day = (d: Date) =>
    new Intl.DateTimeFormat("bg-BG", { timeZone: "UTC", day: "numeric" }).format(d);
  const dayMonth = (d: Date) =>
    new Intl.DateTimeFormat("bg-BG", { timeZone: "UTC", day: "numeric", month: "long" }).format(d);
  const sameMonth = start.getUTCMonth() === last.getUTCMonth();
  const year = last.getUTCFullYear();
  return sameMonth
    ? `${day(start)} – ${dayMonth(last)} ${year} г.`
    : `${dayMonth(start)} – ${dayMonth(last)} ${year} г.`;
}

// Обявените (планови) спирания, които започват до края на седмицата и още не
// са приключили. Без крайна дата — само ако започват от днес нататък (иначе
// забравен стар запис би висял на таблото с месеци).
//
// startAt/endAt са „стенно“ време на София в UTC полетата (виж
// ingest-outages-core.ts) — затова „сега“ е sofiaWallNow(now), а не истинският
// момент (иначе приключило спиране висеше на листа още 2–3 ч.). start/end от
// weekWindow са полунощ UTC на софийската дата — същата конвенция.
export function outageWhere(now: Date, start: Date, end: Date) {
  return {
    published: true,
    planned: true,
    startAt: { not: null, lt: end },
    OR: [{ endAt: { gte: sofiaWallNow(now) } }, { endAt: null, startAt: { gte: start } }],
  } satisfies Prisma.OutageWhereInput;
}

// Час и дата на прекъсване — часът, който е обявен в София. Времената се пазят
// като „стенно“ време на София в UTC полетата (виж ingest-outages-core.ts),
// затова се форматират в UTC: друг превод през Europe/Sofia би добавил още
// +2/+3 ч. („09:00“ ставаше „11:00“).
export function fmtWhen(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "numeric",
    month: "long",
  }).format(d);
}

// „23 октомври 2026 г., 19:45 ч.“ — кога е генериран листът (виси на таблото
// с дни). Същият формат като навсякъде в сайта (lib/format-date, по София).
export function fmtGenerated(d: Date): string {
  return `${formatDate(d)}, ${formatTime(d)}`;
}

// Кратко, без да се реже по средата на дума.
export function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "") + "…";
}

// Дежурствата, групирани по ден (в реда на датите).
export function groupByDay<T extends { date: Date }>(rows: T[]): { key: string; date: Date; items: T[] }[] {
  const out: { key: string; date: Date; items: T[] }[] = [];
  for (const r of rows) {
    const key = dayKey(r.date);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(r);
    else out.push({ key, date: r.date, items: [r] });
  }
  return out;
}
