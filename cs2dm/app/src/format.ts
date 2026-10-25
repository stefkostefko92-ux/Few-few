import { LOCALE_TAG, type Locale } from './i18n.js';

/**
 * Числата и датите се форматират само при показ, по езика на страницата. Парите идват като цели
 * евроцентове и се подават на Intl като точен десетичен НИЗ — без float по пътя.
 */
export interface Formatters {
  int(value: number | bigint): string;
  /** k / d с два знака; при 0 смърти делим на 1 (както и класацията). */
  kd(kills: number, deaths: number): string;
  /** Процент с един знак; при нулев знаменател — тире. */
  percent(part: number, whole: number): string;
  euro(cents: number): string;
  date(value: Date): string;
  dateTime(value: Date): string;
  iso(value: Date): string;
  /** Изиграно време: „12 ч 30 мин“ — шаблонът е от речника. */
  duration(seconds: number, template: (h: number, m: number) => string): string;
}

export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents))
    throw new RangeError('сумата трябва да е цяло число евроцентове');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formattersFor(locale: Locale, timeZone: string): Formatters {
  const tag = LOCALE_TAG[locale];
  const integer = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const twoDecimals = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' });
  const day = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone });
  const dayTime = new Intl.DateTimeFormat(tag, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
  return {
    int: (value) => integer.format(value),
    kd: (kills, deaths) => twoDecimals.format(kills / Math.max(deaths, 1)),
    percent: (part, whole) => (whole > 0 ? percent.format(part / whole) : '—'),
    euro: (cents) => money.format(centsToDecimal(cents) as Intl.StringNumericLiteral),
    date: (value) => day.format(value),
    dateTime: (value) => dayTime.format(value),
    iso: (value) => value.toISOString(),
    duration: (seconds, template) => {
      const total = Math.max(0, Math.floor(seconds / 60));
      return template(Math.floor(total / 60), total % 60);
    },
  };
}
