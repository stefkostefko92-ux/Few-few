// Dates on the pages, always rendered on the server: the formatting locale of the interface language (Italian, it-IT)
// and the time of Italy, where the installations are.
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

const ROME_TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Rome' });

/** «10:52»: the hour and minute in Italy, also in a browser elsewhere (round 46: the draft's bar wrote the browser's
 *  time beside the server's dates); only the digits are taken from Intl. */
export function romeTime(d: Date): string {
  const parts = ROME_TIME.formatToParts(d), of = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? '00';
  return `${of('hour')}:${of('minute')}`;
}

const ROME_DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });

/** «22/10/2026»: the day in Italy, the same text in Node and in any browser (round 50: a sketch's date in the panel,
 *  drawn on the server and in the browser alike); only the digits are taken from Intl. */
export function romeDate(d: Date): string {
  const parts = ROME_DATE.formatToParts(d), of = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? '00';
  return `${of('day')}/${of('month')}/${of('year')}`;
}
