'use client';

// The mark «dal rilievo» in the installation's forms (round 44): beside a field whose value is still the one measured in
// the linked survey (src/lib/collega/prefill.ts), like the software's «standard» and «automatico» badges. It follows the
// value: once the user types another, the mark goes. The forms read it from this context, so that no field component
// needs to know where the values came from.
import { createContext, useContext, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/** The survey the form started from, and its values by field id (as the form holds them). */
export interface OrigineRilievo {
  /** the survey's day, written for the screen */
  date: string;
  valori: Readonly<Record<string, string>>;
}

const Ctx = createContext<OrigineRilievo | null>(null);

export function OrigineProvider({ value, children }: { value: OrigineRilievo | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The same value however written: «630» and 630, «6.5» and «6,5». */
function same(a: unknown, b: string): boolean {
  const s = String(a ?? '').trim();
  if (s === '' || b === '') return false;
  const x = Number(s.replace(',', '.')), y = Number(b.replace(',', '.'));
  return s === b || (Number.isFinite(x) && Number.isFinite(y) && x === y);
}

/** The field still holds the survey's value. */
export function useDalRilievo(id: string, value: unknown): boolean {
  const o = useContext(Ctx), v = o?.valori[id];
  return v !== undefined && same(value, v);
}

function Badge({ date }: { date: string }) {
  const t = useTranslations('collega.origine');
  return <span className="badge rilievo" title={t('badgeTitle', { date })}>{t('badge')}</span>;
}

/** The badge beside the field's name, while its value is the survey's (outside a linked installation — the standalone
 *  page — nothing, not even its words are asked for). */
export function DalRilievo({ id, value }: { id: string; value: unknown }) {
  const o = useContext(Ctx), on = useDalRilievo(id, value);
  return on && o ? <Badge date={o.date} /> : null;
}
