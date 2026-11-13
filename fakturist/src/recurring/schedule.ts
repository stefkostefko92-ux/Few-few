/**
 * Графикът на повтарящите се фактури (SPEC 51) — само дати „ГГГГ-ММ-ДД“, без часови зони. Денят от
 * месеца е котва: 31-во число пада на последния ден на по-късия месец и се връща към 31 след него.
 */
export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

const STEP_MONTHS: Record<Frequency, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Следващата дата от графика след `iso`. */
export function advance(iso: string, frequency: Frequency, anchorDay: number): string {
  const [y, m] = parts(iso);
  const index = y * 12 + (m - 1) + STEP_MONTHS[frequency];
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(Math.max(1, anchorDay), daysIn(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Първата дата от графика СЛЕД `today` — пропуснатите периоди не се наваксват (без порой от фактури). */
export function nextAfter(
  iso: string,
  frequency: Frequency,
  anchorDay: number,
  today: string,
): string {
  let next = advance(iso, frequency, anchorDay);
  while (next <= today) next = advance(next, frequency, anchorDay);
  return next;
}

/** Ключът на периода — с него Document(recurringId, recurringPeriod) е уникален. */
export function periodKey(iso: string, frequency: Frequency): string {
  const [y, m] = parts(iso);
  if (frequency === 'MONTHLY') return `${y}-${pad(m)}`;
  if (frequency === 'QUARTERLY') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return String(y);
}

const MONTHS = {
  bg: [
    'януари',
    'февруари',
    'март',
    'април',
    'май',
    'юни',
    'юли',
    'август',
    'септември',
    'октомври',
    'ноември',
    'декември',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
} as const;
const ROMAN = ['I', 'II', 'III', 'IV'] as const;

/** Името на периода за текста на редовете: „ноември 2026“, „IV тримесечие 2026“, „2026“. */
export function periodLabel(iso: string, frequency: Frequency, lang: 'bg' | 'en'): string {
  const [y, m] = parts(iso);
  if (frequency === 'MONTHLY') return `${MONTHS[lang][m - 1]} ${y}`;
  if (frequency === 'QUARTERLY') {
    const q = Math.floor((m - 1) / 3);
    return lang === 'bg' ? `${ROMAN[q]} тримесечие ${y}` : `Q${q + 1} ${y}`;
  }
  return String(y);
}

/** `{период}` / `{period}` в текста → името на периода. Други скоби остават. */
export function fillPeriod(text: string, label: string): string {
  return text.replace(/\{(период|period)\}/g, label);
}

/** Датата + дни (падежът). */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
