// backend/src/lib/recurrence.js
// Кога е следващото изпращане на повтарящо се насрочено съобщение.
//
// ЗАЩО (ревю на Кодаджията, 12.11.2026 — критерий А5):
//   1. `next.setMonth(next.getMonth() + 1)` прелива: 31.01 → 03.03, а после остава
//      на 3-то число ЗАВИНАГИ, защото новата дата презаписва старата. Затова денят
//      се помни отделно (`anchorDay`) и се клампва към последния ден на месеца.
//   2. Часът се пазеше само в UTC, а таблото въвежда МЕСТНО време: след смяната на
//      лятното време дневното съобщение „в 9:00“ тръгваше в 10:00. Затова
//      съобщението носи IANA зона и следващото изпращане се смята в нея.
// Без библиотека: Intl на Node знае зоните и правилата им.

/** Валидна IANA зона ли е (напр. „Europe/Sofia“)? Празно, дълго и непознато → не. */
export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
  }
  return formatters.get(tz);
}

/** Стенният часовник в зоната `tz` (или в UTC, когато няма зона). Месецът е 1–12. */
function wallClock(date, tz) {
  if (!tz) {
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), hh: date.getUTCHours(), mm: date.getUTCMinutes(), ss: date.getUTCSeconds(), ms: date.getUTCMilliseconds() };
  }
  const p = Object.fromEntries(formatter(tz).formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute, ss: p.second, ms: date.getUTCMilliseconds() };
}

const asUtcMs = (w) => Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss, w.ms);

/** Моментът, в който часовникът в зоната `tz` показва `w`. */
function fromWallClock(w, tz) {
  const wall = asUtcMs(w);
  if (!tz) return new Date(wall);
  const offsetAt = (ts) => asUtcMs(wallClock(new Date(ts), tz)) - ts;
  // Две стъпки: отместването се взема в предполагаемия момент и се уточнява —
  // около смяната на времето първото предположение е с час встрани.
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess));
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function step(w, recurrence, anchorDay) {
  if (recurrence === "monthly") {
    const y = w.m === 12 ? w.y + 1 : w.y;
    const m = w.m === 12 ? 1 : w.m + 1;
    return { ...w, y, m, d: Math.min(anchorDay, daysInMonth(y, m)) };
  }
  const moved = new Date(Date.UTC(w.y, w.m - 1, w.d + (recurrence === "weekly" ? 7 : 1)));
  return { ...w, y: moved.getUTCFullYear(), m: moved.getUTCMonth() + 1, d: moved.getUTCDate() };
}

/** Денят от месеца, на който съобщението е насрочено — в неговата зона. */
export function anchorDayOf(sendAt, timeZone) {
  return wallClock(new Date(sendAt), isValidTimeZone(timeZone) ? timeZone : null).d;
}

/**
 * Първото изпращане след `now`: същият местен час, следващият ден / седмица / месец.
 * Пропуснатите периоди се прескачат — едно следващо изпращане, не залп.
 */
export function nextOccurrence(sendAt, recurrence, now = new Date(), { timeZone = null, anchorDay = null } = {}) {
  const tz = isValidTimeZone(timeZone) ? timeZone : null;
  let w = wallClock(new Date(sendAt), tz);
  const anchor = Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : w.d;
  let next;
  // Таванът пази от безкраен цикъл при невалидна дата; 40 000 дни са над 100 години.
  for (let i = 0; i < 40_000; i++) {
    w = step(w, recurrence, anchor);
    next = fromWallClock(w, tz);
    if (next > now) break;
  }
  return next;
}
