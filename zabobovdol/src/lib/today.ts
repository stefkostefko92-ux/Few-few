// Чистата логика на панела „Днес в Бобов дол“ на началната страница — без база
// и без server-only, за да се тества (src/lib/__tests__/today.test.ts).
//
// „Днес“ и „утре“ са винаги по часа на София, независимо от часовата зона на
// сървъра (в Docker тя е UTC). Времената на прекъсванията се пазят като стенно
// време на София в UTC полетата (виж ingest-outages-core.ts) — затова тук
// всичко се сравнява по същия часовник: sofiaWallNow().

import { formatOutageTime, sofiaWallNow } from "@/lib/ingest-outages-core";
import { dayInfo, formatDateBg, sofiaToday } from "@/lib/calendar";

const DAY_MS = 86_400_000;

export type WallWindow = {
  /** Сега — стенно време на София в UTC полета. */
  now: Date;
  /** 00:00 днес по София (в UTC полета). */
  todayStart: Date;
  /** 00:00 утре по София. */
  tomorrowStart: Date;
  /** 00:00 вдругиден по София — краят на прозореца „днес и утре“. */
  dayAfterStart: Date;
};

/** Прозорецът „днес и утре“ по часа на София. */
export function sofiaWallWindow(now: Date = new Date()): WallWindow {
  const wall = sofiaWallNow(now);
  const todayStart = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()),
  );
  // Стенното време няма лятно/зимно часово време — денят винаги е 24 ч.
  return {
    now: wall,
    todayStart,
    tomorrowStart: new Date(todayStart.getTime() + DAY_MS),
    dayAfterStart: new Date(todayStart.getTime() + 2 * DAY_MS),
  };
}

// ───────────────────────── Днешната дата и имен ден ─────────────────────────

export type TodayCalendarInfo = {
  /** „събота, 24 октомври“ */
  dateText: string;
  names: string[];
  feasts: string[];
};

export function todayCalendar(now: Date = new Date()): TodayCalendarInfo {
  const t = sofiaToday(now);
  const info = dayInfo(t.year, t.month, t.day);
  return {
    dateText: formatDateBg(t.month, t.day, t.weekday),
    names: info.names,
    feasts: info.feasts,
  };
}

// ───────────────────────── Прекъсвания днес и утре ─────────────────────────

export type OutageTimes = { startAt: Date | null; endAt: Date | null };

/** now — вече е започнало (или няма обявено начало); today/tomorrow — предстои. */
export type OutageDay = "now" | "today" | "tomorrow";

const valid = (d: Date | null): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/**
 * Кога засяга прекъсването: „сега“, „днес“, „утре“ — или null, ако вече е
 * свършило или започва след утрешния ден. Без обявено начало се смята за
 * текущо (така го показва и /prekysvaniya), докато не мине краят му.
 */
export function outageDay(o: OutageTimes, w: WallWindow): OutageDay | null {
  const start = valid(o.startAt) ? o.startAt : null;
  const end = valid(o.endAt) ? o.endAt : null;
  if (end && end.getTime() < w.now.getTime()) return null;
  if (!start || start.getTime() <= w.now.getTime()) return "now";
  if (start.getTime() < w.tomorrowStart.getTime()) return "today";
  if (start.getTime() < w.dayAfterStart.getTime()) return "tomorrow";
  return null;
}

const DAY_ORDER: Record<OutageDay, number> = { now: 0, today: 1, tomorrow: 2 };

/**
 * Само прекъсванията, които засягат днес или утре — първо текущите, после по
 * час на започване. Кешът (getOutagesTodayTomorrow) връща по-широк прозорец;
 * точното филтриране е тук.
 */
export function pickTodayOutages<T extends OutageTimes>(
  rows: readonly T[],
  now: Date = new Date(),
): (T & { day: OutageDay })[] {
  const w = sofiaWallWindow(now);
  const out: (T & { day: OutageDay })[] = [];
  for (const r of rows) {
    const day = outageDay(r, w);
    if (day) out.push({ ...r, day });
  }
  return out.sort((a, b) => {
    const d = DAY_ORDER[a.day] - DAY_ORDER[b.day];
    if (d !== 0) return d;
    const sa = valid(a.startAt) ? a.startAt.getTime() : 0;
    const sb = valid(b.startAt) ? b.startAt.getTime() : 0;
    return sa - sb;
  });
}

export function outageDayLabel(day: OutageDay): string {
  return day === "now" ? "Сега" : day === "today" ? "Днес" : "Утре";
}

/** „09:00“ от стенното време (UTC полета). */
export function wallClock(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const wallDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Кратко „кога“ за панела (денят се вижда от етикета „Сега/Днес/Утре“):
 *   „от 09:00 до 16:00“ · „до 18:00“ · „от 10:30“ ·
 *   „до 27 октомври в 16:00“ (когато краят е в друг ден).
 */
export function outageHours(o: OutageTimes, w: WallWindow): string {
  const start = valid(o.startAt) ? o.startAt : null;
  const end = valid(o.endAt) ? o.endAt : null;
  const startsLater = start !== null && start.getTime() > w.now.getTime();
  const anchorDay = wallDay(startsLater && start ? start : w.now);
  const endText = end ? (wallDay(end) === anchorDay ? wallClock(end) : formatOutageTime(end)) : "";
  if (startsLater && start && endText) return `от ${wallClock(start)} до ${endText}`;
  if (startsLater && start) return `от ${wallClock(start)}`;
  if (endText) return `до ${endText}`;
  return "";
}

// ───────────────────────── Следващ автобус ─────────────────────────

export type BusDirectionLike = {
  title: string;
  times: readonly string[];
  notes: readonly string[];
};

const HHMM = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const WORKDAY_ONLY = /само\s+в\s+работни\s+дни/i;
// Всяко друго ограничение по дни, което не можем да разчетем сигурно. Тогава
// не показваме „следващ автобус“ (по-добре връзка, отколкото грешен час).
const OTHER_DAY_RULE = /(почивн|празни|събот|недел|уикенд|делни|без\s+работни)/i;

function toMinutes(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const norm = (hhmm: string) => {
  const mins = toMinutes(hhmm);
  return mins === null ? null : `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};

/**
 * Курсовете „само в работни дни“ според бележките на разписанието.
 * null = бележките споменават ограничение по дни, което не може да се
 * разчете сигурно (тогава не се показва следващ час).
 */
export function workdayOnlyTimes(notes: readonly string[]): Set<string> | null {
  const out = new Set<string>();
  for (const n of notes) {
    if (WORKDAY_ONLY.test(n)) {
      const found = [...n.matchAll(HHMM)].map((m) => norm(m[0])).filter((x): x is string => !!x);
      if (found.length === 0) return null;
      for (const t of found) out.add(t);
      continue;
    }
    if (OTHER_DAY_RULE.test(n)) return null;
  }
  return out;
}

/**
 * Следващият курс днес по часа на София, или null — ако днес няма повече
 * курсове или разписанието има ограничение, което не можем да разчетем.
 * Курсовете „само в работни дни“ не се предлагат в събота и неделя.
 * (Официалните празници не са известни тук — затова панелът казва, че
 * разписанието може да се променя.)
 */
export function nextBus(dir: BusDirectionLike, now: Date = new Date()): string | null {
  const workdayOnly = workdayOnlyTimes(dir.notes);
  if (!workdayOnly) return null;
  const wall = sofiaWallNow(now);
  const nowMin = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const wd = wall.getUTCDay();
  const weekend = wd === 0 || wd === 6;
  let best: { min: number; text: string } | null = null;
  for (const raw of dir.times) {
    const text = norm(raw);
    const min = text === null ? null : toMinutes(text);
    if (text === null || min === null) continue;
    if (weekend && workdayOnly.has(text)) continue;
    if (min <= nowMin) continue;
    if (!best || min < best.min) best = { min, text };
  }
  return best ? best.text : null;
}

/** Следващият курс за всяка посока; празно, ако за нито една няма. */
export function nextBuses(
  dirs: readonly BusDirectionLike[],
  now: Date = new Date(),
): { title: string; time: string }[] {
  const out: { title: string; time: string }[] = [];
  for (const d of dirs) {
    const time = nextBus(d, now);
    if (time) out.push({ title: d.title, time });
  }
  return out;
}
