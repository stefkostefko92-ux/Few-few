// The display helpers of the survey sheets (rilievi's view helpers, src/http/view.ts, in Italian): the day of a
// `@db.Date` column, a moment in Rome, a number with at most 2 decimals, a number for a form field. The separators are
// written out (as src/lib/present/tr.ts makeFmt) instead of taken from the runtime's CLDR data, so the server and the
// browser print the same text; the result is what rilievi printed with Node's it-IT (10,5 · 1250,5 · 12.500).
import { BUSINESS_TZ } from './time';

/** A number from the database: Int, Prisma.Decimal (it has toString) or nothing. */
export type NumberLike = number | { toString(): string } | null | undefined;

export function toNumber(value: NumberLike): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false });
const moment = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Italian digits: comma for decimals; thousands grouped by a dot from 5 integer digits on (CLDR minimum grouping 2). */
function italian(n: number, group: boolean): string {
  const text = plain.format(n);
  const sign = text.startsWith('-') && /[1-9]/.test(text) ? '-' : '';
  const [int = '', frac] = text.replace(/^-/, '').split('.');
  const grouped = group && int.length >= 5 ? int.replace(/\B(?=(\d{3})+$)/g, '.') : int;
  return `${sign}${grouped}${frac ? `,${frac}` : ''}`;
}

export interface RilieviFmt {
  /** dd/mm/yyyy of a `@db.Date` (read in UTC, or the day would shift with the time zone). */
  day(value: Date | null | undefined): string;
  /** dd/mm/yyyy, hh:mm in Rome. */
  dateTime(value: Date | null | undefined): string;
  /** At most 2 decimals, grouped ("10,5", "12.500"); '' for nothing. */
  num(value: NumberLike): string;
  /** For a form field: the decimal comma, no grouping ("1250,5"); '' for nothing. */
  inputNum(value: NumberLike): string;
}

export const fmt: RilieviFmt = {
  day: (value) => {
    if (!value) return '';
    const [y, m, d] = value.toISOString().slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  },
  dateTime: (value) => {
    if (!value) return '';
    const part = (type: string) => moment.formatToParts(value).find((p) => p.type === type)?.value ?? '';
    return `${part('day')}/${part('month')}/${part('year')}, ${part('hour')}:${part('minute')}`;
  },
  num: (value) => {
    const n = toNumber(value);
    return n === null ? '' : italian(n, true);
  },
  inputNum: (value) => {
    const n = toNumber(value);
    return n === null ? '' : italian(n, false);
  },
};
