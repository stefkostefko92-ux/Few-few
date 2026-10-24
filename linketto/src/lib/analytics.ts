// Помощни чисти функции за таба „Детайлни аналитики". Агрегациите идват от
// БД (page.tsx), а тук е логиката без странични ефекти — тества се директно.

import { isLocale } from "../i18n/locales";

export interface DayRow {
  day: string | Date;
  views: number;
  clicks: number;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  views: number;
  clicks: number;
}

function toISODate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

/**
 * Допълва редовете от БД до непрекъсната дневна поредица за последните
 * `days` дни (липсващите дни = 0), подредена възходящо по дата.
 */
export function fillDailySeries(
  rows: readonly DayRow[],
  days: number,
  now: Date,
): DayPoint[] {
  const byDate = new Map<string, { views: number; clicks: number }>();
  for (const row of rows) {
    byDate.set(toISODate(row.day), {
      views: row.views,
      clicks: row.clicks,
    });
  }
  const out: DayPoint[] = [];
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  for (let i = days - 1; i >= 0; i--) {
    const date = toISODate(new Date(start - i * 86_400_000));
    const hit = byDate.get(date);
    out.push({ date, views: hit?.views ?? 0, clicks: hit?.clicks ?? 0 });
  }
  return out;
}

/** Click-through rate (%) — кликове спрямо посещения, закръглено. */
export function ctr(views: number, clicks: number): number {
  if (views <= 0) return 0;
  return Math.round((clicks / views) * 100);
}

/** Най-голямата стойност в поредицата (за скалиране на стълбовете). */
export function seriesMax(series: readonly DayPoint[]): number {
  let max = 0;
  for (const point of series) {
    max = Math.max(max, point.views, point.clicks);
  }
  return max;
}

/** Конверсия (%) — продажби спрямо посещения. */
export function conversionRate(views: number, sales: number): number {
  if (views <= 0) return 0;
  return Math.round((sales / views) * 1000) / 10; // 1 знак след запетаята
}

// Измеренията на ClickEvent идват от URL/хедър — в базата влиза само краен
// речник, иначе произволен низ се появява в разбивките по език/държава.
export function localeOf(hl: string | null): string | undefined {
  return hl && isLocale(hl) ? hl : undefined;
}

// ISO-3166 alpha-2; Cloudflare праща и XX (няма данни) и T1 (Tor).
export function countryOf(cc: string | null): string | undefined {
  const v = (cc ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : undefined;
}
