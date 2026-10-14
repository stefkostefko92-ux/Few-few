'use client';

// The mark «dal rilievo» in the installation's forms (round 44): beside a field whose value came from the linked survey
// — filled at the start or put in by «usa il valore del rilievo» (src/server/collega/forms.ts; a value the user typed
// that happens to equal the survey's is not marked) —, like the software's «standard» and «automatico» badges. It
// follows the value: once the user types another, the mark goes. The forms read it from this context, so that no field
// component needs to know where the values came from.
import { createContext, useContext, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { stessoValore } from '@/lib/collega/formato';

/** The survey the form started from, and the values it gave the form by field id (as the form holds them). */
export interface OrigineRilievo {
  /** the survey's day, written for the screen */
  date: string;
  /** only the fields whose value came from the survey */
  valori: Readonly<Record<string, string>>;
}

const Ctx = createContext<OrigineRilievo | null>(null);

export function OrigineProvider({ value, children }: { value: OrigineRilievo | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The field's value came from the survey and is still the survey's. */
export function useDalRilievo(id: string, value: unknown): boolean {
  const o = useContext(Ctx), v = o?.valori[id];
  return v !== undefined && stessoValore(value, v);
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
