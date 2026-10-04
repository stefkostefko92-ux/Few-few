// Dates on the pages, always rendered on the server: the formatting locale of the interface language (English is
// en-GB, with the 24-hour clock of the rest of the interface) and the time of Italy, where the installations are.
import { INTL_LOCALE, isLocale } from '@/i18n/locales';

export interface DateFormat {
  date(d: Date): string;
  dateTime(d: Date): string;
  /** Short date with seconds: the activity log. */
  stamp(d: Date): string;
}

export function dateFormat(locale: string): DateFormat {
  const tag = INTL_LOCALE[isLocale(locale) ? locale : 'it'];
  const make = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Rome', ...o });
  const date = make({ dateStyle: 'medium' }), dateTime = make({ dateStyle: 'medium', timeStyle: 'short' }), stamp = make({ dateStyle: 'short', timeStyle: 'medium' });
  return { date: (d) => date.format(d), dateTime: (d) => dateTime.format(d), stamp: (d) => stamp.format(d) };
}
