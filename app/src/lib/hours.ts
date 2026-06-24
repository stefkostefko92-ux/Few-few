// Разбор на свободния текст в полето „работно време" (hours) и пресмятане дали
// мястото е отворено в момента. Консервативен: при текст, който не може да се
// разбере уверено, връща статус „unknown" — за да не показваме подвеждащ етикет.
//
// Поддържани форми (наблюдавани в данните):
//   "08:00–18:00"                                  (без дни → всеки ден)
//   "Денонощно (24/7)"
//   "Пон–Пет 08:30–17:00"
//   "Пон–Пет 09:00–14:00, 15:00–19:00; събота и неделя — затворено"
//   "Пон–Пет 09:00–18:00; Събота 10:00–16:00"
//   "Приемно време: Пон и Пет 08:30–17:30, Чет 10:00–16:00"

export type OpenStatus = "open" | "closed" | "unknown";
export type OpenState = { status: OpenStatus; until?: string; opensAt?: string };

// Кратки и пълни имена на дни → 0=неделя … 6=събота.
const DAY_TOKENS: Record<string, number> = {
  нед: 0, неделя: 0,
  пон: 1, понеделник: 1,
  вто: 2, вторник: 2,
  сря: 3, сряда: 3,
  чет: 4, четвъртък: 4,
  пет: 5, петък: 5,
  съб: 6, събота: 6,
};

type Interval = { start: number; end: number }; // минути от полунощ
type Group = { days: Set<number>; intervals: Interval[] };

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—−]/g, "-") // различни тирета → дефис
    .replace(/\s+/g, " ")
    .trim();
}

// Намира ден-токен в текст; връща номера на деня или null.
function dayOf(token: string): number | null {
  const t = token.trim();
  if (t in DAY_TOKENS) return DAY_TOKENS[t];
  // По-дълъг токен, който започва с известен корен (напр. „понеделник").
  for (const [k, v] of Object.entries(DAY_TOKENS)) {
    if (t.startsWith(k)) return v;
  }
  return null;
}

// Разбира ден-спецификация: „пон-пет", „пон и пет", „пон, сря, пет", „събота".
function parseDays(spec: string): Set<number> | null {
  const s = spec.trim();
  if (!s) return null;
  const days = new Set<number>();

  // Диапазон с дефис: „пон-пет".
  const range = s.split("-");
  if (range.length === 2) {
    const a = dayOf(range[0]);
    const b = dayOf(range[1]);
    if (a !== null && b !== null) {
      let i = a;
      // Върви напред по седмицата (нед=0 … съб=6), със завъртане.
      for (let guard = 0; guard < 8; guard++) {
        days.add(i);
        if (i === b) break;
        i = (i + 1) % 7;
      }
      return days;
    }
  }

  // Списък с „и" или запетая: „пон и пет", „събота и неделя".
  for (const part of s.split(/\s+и\s+|,/)) {
    const d = dayOf(part);
    if (d === null) return null; // непознат токен → не рискуваме
    days.add(d);
  }
  return days.size ? days : null;
}

const TIME_RE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;

function intervalsIn(text: string): Interval[] {
  const out: Interval[] = [];
  for (const m of text.matchAll(TIME_RE)) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    out.push({ start, end });
  }
  return out;
}

/** Разбира текста за работно време в групи (дни → интервали). null = неуспех. */
export function parseHours(raw: string): Group[] | "always" | null {
  const s = norm(raw);
  if (!s) return null;
  if (/денонощно|24\/7|non-?stop|нонстоп/.test(s)) return "always";

  const groups: Group[] = [];
  // Сегменти, разделени с „;".
  for (const seg of s.split(";")) {
    const segText = seg.replace(/^[^0-9а-я]*приемно време:?/, "").trim();
    if (!segText) continue;
    // Разделяме сегмента по запетаи на части. Част с ден-токен започва нова
    // група; част само с интервал се добавя към текущата група.
    let current: Group | null = null;
    for (const part of segText.split(",")) {
      const ivs = intervalsIn(part);
      // Текстът преди първия интервал е евентуалната ден-спецификация.
      const before = part.replace(TIME_RE, " ").trim();
      const hasDayToken = /[а-я]{3}/.test(before) && parseDays(before) !== null;

      if (hasDayToken) {
        const days = parseDays(before)!;
        current = { days, intervals: ivs };
        groups.push(current);
      } else if (current) {
        current.intervals.push(...ivs);
      } else if (ivs.length) {
        // Интервал без дни в самото начало → важи за всички дни.
        current = { days: new Set([0, 1, 2, 3, 4, 5, 6]), intervals: ivs };
        groups.push(current);
      }
      // „затворено" части нямат интервали — оставаме без открити интервали.
    }
  }

  const usable = groups.filter((g) => g.intervals.length > 0);
  return usable.length ? usable : null;
}

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

// Делник (0–6) и минути от полунощ за „сега" в зоната на София.
function sofiaNow(now: Date): { weekday: number; minutes: number } {
  const wdName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Sofia",
    weekday: "short",
  }).format(now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wdName);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [h, m] = hm.split(":").map(Number);
  return { weekday, minutes: h * 60 + m };
}

/** Текущо състояние „отворено/затворено/неясно" за дадено работно време. */
export function openState(raw: string, now: Date = new Date()): OpenState {
  const parsed = parseHours(raw);
  if (parsed === null) return { status: "unknown" };
  if (parsed === "always") return { status: "open" };

  const { weekday, minutes } = sofiaNow(now);

  for (const g of parsed) {
    if (!g.days.has(weekday)) continue;
    for (const iv of g.intervals) {
      const overnight = iv.end <= iv.start;
      const isOpen = overnight
        ? minutes >= iv.start || minutes < iv.end
        : minutes >= iv.start && minutes < iv.end;
      if (isOpen) return { status: "open", until: hhmm(iv.end) };
    }
  }

  // Затворено сега — намери следващото отваряне днес (за информативност).
  let nextToday: number | null = null;
  for (const g of parsed) {
    if (!g.days.has(weekday)) continue;
    for (const iv of g.intervals) {
      if (iv.start > minutes && (nextToday === null || iv.start < nextToday)) nextToday = iv.start;
    }
  }
  return nextToday !== null
    ? { status: "closed", opensAt: hhmm(nextToday) }
    : { status: "closed" };
}
