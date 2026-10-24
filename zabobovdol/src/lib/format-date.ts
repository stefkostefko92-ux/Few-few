// Дати и часове на български — един формат за целия сайт и ВИНАГИ по
// софийско време, независимо от часовата зона на сървъра (продукцията е с
// TZ=UTC — без изрична зона „09:33“ излизаше „07:33“).
//
// Два вида стойности в базата:
//   • истински момент (createdAt, updatedAt, publishedAt от новини, „сега“)
//     → показва се в Europe/Sofia (по подразбиране);
//   • „стенно“ софийско време, записано в UTC полетата — всичко, което
//     админът въвежда в поле тип datetime (Event.startAt/endAt, Outage,
//     Obituary.ceremonyAt…; виж lib/admin/format.ts, ingest-outages-core.ts,
//     pechat/sedmitsa/week.ts) → `{ wall: true }`: показва се както е въведено.
//     Превод през Europe/Sofia би добавил още +2/+3 ч.
//
// Без Intl за имената на месеци и дни: изходът е еднакъв на сървъра и в
// браузъра (различните версии на ICU пишат „09:33“ / „9:33 ч.“ / „24.10.2026 г.“).
// Между число и мерна дума е неразделящ интервал (U+00A0) — „24 октомври“,
// „2026 г.“ и „09:33 ч.“ не се разделят на два реда.

export const SOFIA_TZ = "Europe/Sofia";

export type DateInput = Date | string | number;
export type DateOpts = {
  /** Стойността е стенно софийско време в UTC полетата (админ поле datetime). */
  wall?: boolean;
};

const NBSP = " ";

const MONTHS = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];
const WEEKDAYS = ["неделя", "понеделник", "вторник", "сряда", "четвъртък", "петък", "събота"];

type Parts = { y: number; m: number; d: number; hh: number; mm: number; ss: number; wd: number };

let sofiaFmt: Intl.DateTimeFormat | null = null;

function toDate(input: DateInput): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function weekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function partsOf(date: Date, opts?: DateOpts): Parts {
  if (opts?.wall) {
    return {
      y: date.getUTCFullYear(),
      m: date.getUTCMonth() + 1,
      d: date.getUTCDate(),
      hh: date.getUTCHours(),
      mm: date.getUTCMinutes(),
      ss: date.getUTCSeconds(),
      wd: date.getUTCDay(),
    };
  }
  sofiaFmt ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const x of sofiaFmt.formatToParts(date)) {
    if (x.type !== "literal") p[x.type] = Number(x.value);
  }
  const y = p.year;
  const m = p.month;
  const d = p.day;
  return { y, m, d, hh: p.hour % 24, mm: p.minute, ss: p.second, wd: weekday(y, m, d) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function withParts(input: DateInput, opts: DateOpts | undefined, f: (p: Parts) => string): string {
  const date = toDate(input);
  return date ? f(partsOf(date, opts)) : "";
}

const dayMonth = (p: Parts) => `${p.d}${NBSP}${MONTHS[p.m - 1]}`;
const year = (p: Parts) => `${p.y}${NBSP}г.`;
const time = (p: Parts) => `${pad(p.hh)}:${pad(p.mm)}${NBSP}ч.`;

/** „събота, 24 октомври 2026 г.“ */
export function formatDateLong(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${WEEKDAYS[p.wd]}, ${dayMonth(p)} ${year(p)}`);
}

/** „24 октомври 2026 г.“ */
export function formatDate(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${dayMonth(p)} ${year(p)}`);
}

/** „24 октомври“ */
export function formatDayMonth(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, dayMonth);
}

/** „събота, 24 октомври“ */
export function formatWeekdayDayMonth(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${WEEKDAYS[p.wd]}, ${dayMonth(p)}`);
}

/** „октомври 2026 г.“ */
export function formatMonthYear(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${MONTHS[p.m - 1]} ${year(p)}`);
}

/** „09:33 ч.“ */
export function formatTime(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, time);
}

/** „събота, 24 октомври 2026 г., 09:33 ч.“ */
export function formatDateTime(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${WEEKDAYS[p.wd]}, ${dayMonth(p)} ${year(p)}, ${time(p)}`);
}

/** „24.10.2026“ — само в таблици и служебни списъци. */
export function formatDateNumeric(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${pad(p.d)}.${pad(p.m)}.${p.y}`);
}

/** „24.10.2026, 09:33“ — само в таблици и служебни списъци (админ). */
export function formatDateTimeNumeric(input: DateInput, opts?: DateOpts): string {
  return withParts(
    input,
    opts,
    (p) => `${pad(p.d)}.${pad(p.m)}.${p.y}, ${pad(p.hh)}:${pad(p.mm)}`,
  );
}

/**
 * Кога е събитие — в едно изречение:
 *   без край / край в същия миг → „сряда, 29 октомври 2026 г., 18:00 ч.“
 *   същия ден                   → „сряда, 29 октомври 2026 г., 18:00–21:00 ч.“
 *   различни дни                → „сряда, 29 октомври, 18:00 ч. – четвъртък, 30 октомври 2026 г., 12:00 ч.“
 */
export function formatEventWhen(
  start: DateInput,
  end?: DateInput | null,
  opts?: DateOpts,
): string {
  const s = toDate(start);
  if (!s) return "";
  const a = partsOf(s, opts);
  const e = end == null ? null : toDate(end);
  if (!e || e.getTime() <= s.getTime()) {
    return `${WEEKDAYS[a.wd]}, ${dayMonth(a)} ${year(a)}, ${time(a)}`;
  }
  const b = partsOf(e, opts);
  if (a.y === b.y && a.m === b.m && a.d === b.d) {
    return `${WEEKDAYS[a.wd]}, ${dayMonth(a)} ${year(a)}, ${pad(a.hh)}:${pad(a.mm)}–${time(b)}`;
  }
  const first = a.y === b.y ? `${WEEKDAYS[a.wd]}, ${dayMonth(a)}` : `${WEEKDAYS[a.wd]}, ${dayMonth(a)} ${year(a)}`;
  return `${first}, ${time(a)} – ${WEEKDAYS[b.wd]}, ${dayMonth(b)} ${year(b)}, ${time(b)}`;
}

/** „2026-10-24“ — за <time dateTime> (датата по софийско време). */
export function isoDate(input: DateInput, opts?: DateOpts): string {
  return withParts(input, opts, (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`);
}

// Отместване на София спрямо UTC (минути) в даден момент: +120 зима, +180 лято.
function sofiaOffsetMin(date: Date): number {
  const p = partsOf(date);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * ISO 8601 с отместването на София — „2026-10-29T09:33:00+02:00“. За JSON-LD
 * (startDate на събитие) и <time dateTime>: търсачките разбират точния миг.
 * С `{ wall: true }` стенното време от UTC полетата се превежда в истинския
 * момент (09:33 в базата = 09:33 софийско).
 */
export function isoDateTime(input: DateInput, opts?: DateOpts): string {
  const date = toDate(input);
  if (!date) return "";
  let local: Parts;
  let offset: number;
  if (opts?.wall) {
    local = partsOf(date, { wall: true });
    const wallMs = Date.UTC(local.y, local.m - 1, local.d, local.hh, local.mm, local.ss);
    // Отместването зависи от самия момент — две стъпки стигат и около
    // смяната на часа.
    offset = sofiaOffsetMin(new Date(wallMs - 120 * 60000));
    offset = sofiaOffsetMin(new Date(wallMs - offset * 60000));
  } else {
    local = partsOf(date);
    offset = sofiaOffsetMin(date);
  }
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return (
    `${local.y}-${pad(local.m)}-${pad(local.d)}T${pad(local.hh)}:${pad(local.mm)}:${pad(local.ss)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
