import { BUSINESS_TZ, DAY } from '../time.js';

const parti = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** С колко милисекунди часовникът в Рим е пред UTC в момента `at` (+1 h зимата, +2 h лятото). */
function scartoRoma(at: number): number {
  const p = Object.fromEntries(parti.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const comeUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return comeUtc - Math.floor(at / 1000) * 1000;
}

/**
 * Полунощ в Рим на деня `YYYY-MM-DD` (плюс `giorni` дни) като момент — началото на деня, в който
 * съобщението се показва, и краят след последния му ден. Смяната на часа е в 2–3 ч, полунощ не пада в нея.
 */
export function mezzanotteRoma(day: string, giorni = 0): Date {
  const utc = Date.parse(`${day}T00:00:00.000Z`) + giorni * DAY;
  if (Number.isNaN(utc)) return new Date(Number.NaN);
  const prima = utc - scartoRoma(utc);
  return new Date(utc - scartoRoma(prima));
}

/**
 * Час, написан в Рим (`YYYY-MM-DDTHH:mm` от `<input type="datetime-local">`), като момент; null — не е
 * истински ден и час. В часа на смяната (2–3 ч) — както Date го нагласи; регистрите не стигат дотам.
 */
export function momentoRoma(value: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m || !giornoValido(m[1]!) || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  const utc = Date.parse(`${value}:00.000Z`);
  const prima = utc - scartoRoma(utc);
  return new Date(utc - scartoRoma(prima));
}

/** Моментът като `YYYY-MM-DDTHH:mm` по Рим — стойността на `<input type="datetime-local">`. */
export function inputRoma(at: Date): string {
  const p = Object.fromEntries(parti.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** `YYYY-MM-DD` е истински ден („2026-02-31“ не е — Date би го преместил тихо на 3 март). */
export function giornoValido(day: string): boolean {
  const t = Date.parse(`${day}T00:00:00.000Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day;
}

/** Денят по Рим на момента `at` като „12/11/2026“ — за писмата (изгледите ползват `fmt`). */
export function giornoRoma(at: Date): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ })
    .format(at)
    .split('-');
  return `${d}/${m}/${y}`;
}

/** Началото на седмицата (понеделник, полунощ UTC) на момента `at` — групите на графиката. */
export function inizioSettimana(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const giorno = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - giorno * DAY);
}
