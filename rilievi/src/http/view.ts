import { LOCALE_TAG, type Locale } from '../i18n.js';
import { BUSINESS_TZ } from '../time.js';

/** Число от базата: Int, Prisma.Decimal (има toString) или нищо. */
export type NumberLike = number | { toString(): string } | null | undefined;

export function toNumber(value: NumberLike): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/** Форматиране за шаблоните (италиански: дати, десетична запетая). Всичко е за показ. */
function buildViewHelpers(locale: Locale) {
  const tag = LOCALE_TAG[locale];
  // Колоните `@db.Date` са полунощ UTC — датата се чете в UTC, иначе би се изместила с часовата зона.
  const dayFmt = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
  });
  const numberFmt = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  /** Числото във вид за поле на формата: десетичен знак по езика, без разделител на хилядите. */
  const inputFmt = new Intl.NumberFormat(tag, { maximumFractionDigits: 2, useGrouping: false });
  return {
    day: (value: Date | null | undefined) => (value ? dayFmt.format(value) : ''),
    dateTime: (value: Date | null | undefined) => (value ? dateTimeFmt.format(value) : ''),
    num: (value: NumberLike) => {
      const n = toNumber(value);
      return n === null ? '' : numberFmt.format(n);
    },
    inputNum: (value: NumberLike) => {
      const n = toNumber(value);
      return n === null ? '' : inputFmt.format(n);
    },
  };
}

export type ViewHelpers = ReturnType<typeof buildViewHelpers>;

const cache = new Map<Locale, ViewHelpers>();

/** Зависят само от езика — един комплект на език. */
export function viewHelpers(locale: Locale): ViewHelpers {
  let helpers = cache.get(locale);
  if (!helpers) {
    helpers = buildViewHelpers(locale);
    cache.set(locale, helpers);
  }
  return helpers;
}
