/**
 * Българският календар на неработните дни — за сроковете по Регламент 1182/71 (срок, който изтича в
 * събота, неделя или официален празник, изтича в края на следващия работен ден). Дните са UTC полунощ
 * на датата (без часови зони): аритметика с цели дни.
 */
const DAY = 86_400_000;

/** Официалните празници с фиксирана дата (чл. 154, ал. 1 от Кодекса на труда): [месец, ден]. */
const FIXED_HOLIDAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], // Нова година
  [3, 3], // Ден на Освобождението
  [5, 1], // Ден на труда
  [5, 6], // Гергьовден, Ден на храбростта
  [5, 24], // Ден на светите братя Кирил и Методий
  [9, 6], // Ден на Съединението
  [9, 22], // Ден на Независимостта
  [12, 24], // Бъдни вечер
  [12, 25], // Рождество Христово
  [12, 26], // Рождество Христово
];

/** Православният Великден: изчислен по юлианския календар (Мийъс) + 13 дни за 1900–2099 г. */
export function orthodoxEaster(year: number): number {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day) + 13 * DAY;
}

const isWeekend = (day: number): boolean => {
  const weekday = new Date(day).getUTCDay();
  return weekday === 0 || weekday === 6;
};

const cache = new Map<number, ReadonlySet<number>>();

/**
 * Празниците на годината: фиксираните, Велики петък, Велика събота, Великден и понеделникът след него,
 * и неприсъствените дни по чл. 154, ал. 2 КТ — празник (без Великденските), който се пада в събота или
 * неделя, прави почивен първия работен ден след себе си.
 */
function holidays(year: number): ReadonlySet<number> {
  const known = cache.get(year);
  if (known) return known;
  const fixed = FIXED_HOLIDAYS.map(([month, day]) => Date.UTC(year, month - 1, day));
  const easter = orthodoxEaster(year);
  const days = new Set<number>([...fixed, easter - 2 * DAY, easter - DAY, easter, easter + DAY]);
  for (const holiday of fixed) {
    if (!isWeekend(holiday)) continue;
    let moved = holiday + DAY;
    while (isWeekend(moved) || days.has(moved)) moved += DAY;
    days.add(moved);
  }
  cache.set(year, days);
  return days;
}

/** Работен ден в България: не е събота, неделя, официален празник или неприсъствен ден. */
export function isBgWorkingDay(day: number): boolean {
  return !isWeekend(day) && !holidays(new Date(day).getUTCFullYear()).has(day);
}

/** Датата по София на момента `at` — като UTC полунощ. */
export function sofiaDay(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'));
}

/**
 * Последният миг на датата `ГГГГ-ММ-ДД` по София (23:59:59.999 местно време — UTC+2 зиме, UTC+3 лете);
 * null за дата, която не съществува (2026-02-30 не се прелива тихо в март).
 */
export function sofiaEndOfDay(date: string): Date | null {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== date) return null;
  const winter = day + DAY - 2 * 3_600_000 - 1;
  return new Date(sofiaDay(new Date(winter)) === day ? winter : winter - 3_600_000);
}

export { DAY };
