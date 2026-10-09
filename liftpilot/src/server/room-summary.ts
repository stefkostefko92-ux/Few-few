import 'server-only';
// The line that names a saved machine room (RoomDesign.summary, src/lib/room/summary.ts) in the reader's language: the
// lists of the project and of the calculation, the head of its page, the revision of a drawing set. A record whose line
// cannot be read is shown as it was stored.
import { getLocale, getTranslations } from 'next-intl/server';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { readRoomSummary, roomSummaryText } from '@/lib/room/summary';

export interface RoomSummaryRecord {
  summary: string;
  inputs: unknown;
  results: unknown;
}

export async function roomSummaryLine(): Promise<(r: RoomSummaryRecord) => string> {
  const [t, ts, locale] = await Promise.all([getTranslations('room'), getTranslations('shaft'), getLocale()]);
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  return (r) => {
    const s = readRoomSummary(r);
    return s ? roomSummaryText(s, (k, v) => t(k, v), (k, v) => ts(k, v), (x) => fmt(x, 0)) : r.summary;
  };
}
