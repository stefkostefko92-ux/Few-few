'use client';

// The mark «dal rilievo» in the installation's forms (round 44) — and «dal progetto» in «Calcolo argano» started from a
// lift design's calculation (round 45): beside a field whose value came from the linked survey (or from the drawing)
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
  /** the form starts from the survey (its notice says so): its draft keeps that it did (src/lib/collega/formato.ts) */
  parte?: boolean;
  /** «Calcolo argano» started from a lift design's calculation, or opened from the Progetto (round 45, ?dal=progetto):
   *  the values its drawing gave, marked «dal progetto» with their own badge, and the value each replaced where it held
   *  another (never kept by the draft: the survey's marks only) */
  progetto?: { date: string; valori: Readonly<Record<string, string>>; prima?: Readonly<Record<string, string>> };
}

const Ctx = createContext<OrigineRilievo | null>(null);

export function OrigineProvider({ value, children }: { value: OrigineRilievo | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Where the field's value came from, while it is still that value: the survey, else the drawing (null: neither). */
function fonteDi(o: OrigineRilievo | null, id: string, value: unknown): 'rilievo' | 'progetto' | null {
  const r = o?.valori[id], p = o?.progetto?.valori[id];
  return r !== undefined && stessoValore(value, r) ? 'rilievo' : p !== undefined && stessoValore(value, p) ? 'progetto' : null;
}

/** The value the linked survey gave a field (as the form holds it), whatever the field holds now — a reference beside
 *  another field, never filled in (round 46: the logbook's speed and travel, DatiLibretto); undefined: none. */
export function useValoreRilievo(id: string): string | undefined {
  return useContext(Ctx)?.valori[id];
}

/** The field's value came from the survey (or from the drawing) and is still that value. */
export function useDalRilievo(id: string, value: unknown): boolean {
  return fonteDi(useContext(Ctx), id, value) !== null;
}

function Badge({ date, progetto, prima }: { date: string; progetto: boolean; prima?: string | undefined }) {
  const t = useTranslations('collega.origine');
  return progetto ? <span className="badge progetto" title={prima === undefined ? t('progettoTitle', { date }) : t('progettoTitlePrima', { date, prima })}>{t('progetto')}</span>
    : <span className="badge rilievo" title={t('badgeTitle', { date })}>{t('badge')}</span>;
}

/** The badge beside the field's name, while its value is the survey's — or the drawing's, «dal progetto» (outside a
 *  linked installation — the standalone page — nothing, not even its words are asked for). */
export function DalRilievo({ id, value }: { id: string; value: unknown }) {
  const o = useContext(Ctx), on = fonteDi(o, id, value);
  if (!o || !on) return null;
  return on === 'progetto' && o.progetto ? <Badge date={o.progetto.date} progetto prima={o.progetto.prima?.[id]} /> : <Badge date={o.date} progetto={false} />;
}
