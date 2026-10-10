import { LOCALE_TAG, translatorFor, type Locale } from '../i18n.js';
import { countryName } from '../auth/geoip.js';
import { hwidLabel } from '../auth/device.js';
import { orderNo } from '../plans/order-number.js';
import { formatMoney } from '../plans/pricing.js';
import { displayLabel } from '../labels.js';
import { BUSINESS_TZ, DAY, HOUR } from '../time.js';

/** Форматиране за шаблоните, наточено за езика на заявката. Всичко е за показ — сметките са другаде. */
function buildViewHelpers(locale: Locale) {
  const tag = LOCALE_TAG[locale];
  const dateFmt = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: BUSINESS_TZ,
  });
  // На английски 09/10/2026 се чете и като 10 септември: там месецът е съкратена дума („9 Oct 2026“);
  // на български и италиански цифрите са недвусмислени (ден, после месец).
  const month = locale === 'en' ? 'short' : '2-digit';
  const day = locale === 'en' ? 'numeric' : '2-digit';
  const shortDateFmt = new Intl.DateTimeFormat(tag, {
    day,
    month,
    year: 'numeric',
    timeZone: BUSINESS_TZ,
  });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, {
    day,
    month,
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
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
    /** Номерът на поръчката за хората („KP-2026-000123“), не вътрешният cuid. */
    orderNo,
    country: (code: string | null | undefined) => countryName(code, tag),
    hwid: (hash: string | null | undefined) => hwidLabel(hash),
    /** Кой е направил промяната / бележка от системата — знаците стават думи на езика на страницата. */
    label: (value: string | null | undefined) => displayLabel(value, t),
    relative: (value: Date | null | undefined) => {
      if (!value) return '';
      const diff = value.getTime() - Date.now();
      const abs = Math.abs(diff);
      if (abs < 60_000) return relativeFmt.format(Math.round(diff / 1000), 'second');
      if (abs < HOUR) return relativeFmt.format(Math.round(diff / 60_000), 'minute');
      if (abs < DAY) return relativeFmt.format(Math.round(diff / HOUR), 'hour');
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
