import { LOCALE_TAG, translatorFor, type Locale } from '../i18n.js';
import { countryName } from '../auth/geoip.js';
import { hwidLabel } from '../auth/device.js';
import { formatMoney } from '../plans/pricing.js';
import { displayLabel } from '../labels.js';

const DAY = 24 * 60 * 60 * 1000;

/** Форматиране за шаблоните, наточено за езика на заявката. Всичко е за показ — сметките са другаде. */
function buildViewHelpers(locale: Locale) {
  const tag = LOCALE_TAG[locale];
  const dateFmt = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Sofia',
  });
  const shortDateFmt = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Sofia',
  });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Sofia',
  });
  const numberFmt = new Intl.NumberFormat(tag);
  const relativeFmt = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const t = translatorFor(locale);
  return {
    date: (value: Date | null | undefined) => (value ? dateFmt.format(value) : ''),
    shortDate: (value: Date | null | undefined) => (value ? shortDateFmt.format(value) : ''),
    dateTime: (value: Date | null | undefined) => (value ? dateTimeFmt.format(value) : ''),
    isoDate: (value: Date | null | undefined) => (value ? value.toISOString() : ''),
    num: (value: number | null | undefined) =>
      value === null || value === undefined ? '' : numberFmt.format(value),
    money: (cents: number) => formatMoney(cents, locale),
    country: (code: string | null | undefined) => countryName(code, tag),
    hwid: (hash: string | null | undefined) => hwidLabel(hash),
    /** Кой е направил промяната / бележка от системата — знаците стават думи на езика на страницата. */
    label: (value: string | null | undefined) => displayLabel(value, t),
    relative: (value: Date | null | undefined) => {
      if (!value) return '';
      const diff = value.getTime() - Date.now();
      const abs = Math.abs(diff);
      if (abs < 60_000) return relativeFmt.format(Math.round(diff / 1000), 'second');
      if (abs < 3_600_000) return relativeFmt.format(Math.round(diff / 60_000), 'minute');
      if (abs < DAY) return relativeFmt.format(Math.round(diff / 3_600_000), 'hour');
      return relativeFmt.format(Math.round(diff / DAY), 'day');
    },
  };
}

export type ViewHelpers = ReturnType<typeof buildViewHelpers>;

const cache = new Map<Locale, ViewHelpers>();

/** Зависят само от езика (`relative` чете часа при всяко извикване) — един комплект на език. */
export function viewHelpers(locale: Locale): ViewHelpers {
  let helpers = cache.get(locale);
  if (!helpers) {
    helpers = buildViewHelpers(locale);
    cache.set(locale, helpers);
  }
  return helpers;
}
