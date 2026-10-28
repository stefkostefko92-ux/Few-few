'use client';

// The remedies of one check, under its row (round 54): searched when opened — the design tried with other values, the
// screen breathing between two workings-out (lib/rimedi/cerca.ts) —, each with the value it changes, what it costs,
// what else it puts right or leaves with «Attenzione», what it asks beyond (notaLeva), and «Applica»; what the check asks
// beyond one value (rimedi.hint_<id>) under them; a check another screen puts right says which, with the way there.
// Whatever the design's inputs: the screen that holds it gives the search and the apply (FonteRimedi).
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Opzioni } from '@/lib/rimedi/cerca';
import type { Dove, Rimedio } from '@/lib/rimedi/tipi';

/** What the screen holding the design gives the remedies. */
export interface FonteRimedi<I> {
  dove(id: string): Dove;
  cerca(id: string, o: Opzioni): Promise<Rimedio<I>[]>;
  applica(r: Rimedio<I>): void;
  /** a lever's name, unit and decimals as the screen shows them */
  leva(key: string): string;
  unita(key: string): string;
  decimali?(key: string): number;
  /** said under the remedies (the catalogue's machines, on «Calcolo argano»); absent: nothing */
  nota?: string | null;
  /** said under a remedy of this lever (one that changes the loads, a refuge of another type); null: nothing */
  notaLeva?(r: { key: string; a: number | string | null }): string | null;
  /** «Calcolo argano» opened, the design kept first; absent: the user may not open it */
  calcolo?: (() => void) | null;
}

type Stato<I> = { fase: 'cerco' } | { fase: 'fatto'; rimedi: Rimedio<I>[] } | { fase: 'errore' };

const pausa = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

/** A field's label as a remedy names it: its unit, shown with the values, left out. */
export const senzaUnita = (label: string): string => label.replace(/\s*\((?:mm|m|kg|kW|N·m)\)$/, '');

/** `nome`: a check's name (what a remedy puts right or breaks); `fmt`: the screen's numbers. */
export default function RimediVerifica<I>({ id, fonte, nome, fmt, onApplied }: {
  id: string; fonte: FonteRimedi<I>; nome(id: string): string; fmt(x: number, dec?: number): string; onApplied(): void;
}) {
  const t = useTranslations('rimedi'), dove = fonte.dove(id);
  // the answer kept with the search it answers: a new design (or check) reads «Cerco…» until its own comes
  const [esito, setEsito] = useState<{ per: FonteRimedi<I>; id: string; stato: Stato<I> } | null>(null);
  useEffect(() => {
    if (dove !== 'qui') return;
    const stop = new AbortController(), per = fonte;
    fonte.cerca(id, { pausa, signal: stop.signal })
      .then((rimedi) => { if (!stop.signal.aborted) setEsito({ per, id, stato: { fase: 'fatto', rimedi } }); })
      .catch(() => { if (!stop.signal.aborted) setEsito({ per, id, stato: { fase: 'errore' } }); });
    return () => stop.abort();
  }, [id, fonte, dove]);
  const stato: Stato<I> = esito && esito.per === fonte && esito.id === id ? esito.stato : { fase: 'cerco' };
  if (dove !== 'qui') {
    return (
      <div className="rimedi" role="status">
        <p className="note">{t.has(`hint_${id}`) ? t(`hint_${id}`) : t(dove)}</p>
        {dove === 'calcolo' && fonte.calcolo ? <button type="button" className="btn btn-sm" onClick={fonte.calcolo}>{t('apriCalcolo')}</button> : null}
      </div>
    );
  }
  if (stato.fase === 'cerco') return <div className="rimedi" role="status" aria-busy="true"><p className="note">{t('cerco')}</p></div>;
  if (stato.fase === 'errore') return <div className="rimedi" role="status"><p className="note">{t('errore')}</p></div>;
  const val = (key: string, x: number | string | null, label?: string): string =>
    x === null ? t('torna') : typeof x === 'number' ? `${fmt(x, fonte.decimali?.(key) ?? 0)}${fonte.unita(key) ? `\u00a0${fonte.unita(key)}` : ''}` : label ?? x;
  return (
    <div className="rimedi" role="status">
      {stato.rimedi.length ? (
        <>
          <p className="note">{t('lead')}</p>
          <ul className="rimedi-list">
            {stato.rimedi.map((r) => {
              const delta = typeof r.a === 'number' && typeof r.da === 'number' ? r.a - r.da : null;
              const nota = fonte.notaLeva?.(r) ?? null;
              return (
                <li key={r.key} data-leva={r.key}>
                  <div className="rimedio-riga">
                    <span className="rimedio-cosa">
                      <strong>{fonte.leva(r.key)}</strong>{' '}
                      <span className="rimedio-val">{val(r.key, r.da, r.labelDa)} → {val(r.key, r.a, r.label)}</span>
                      {delta !== null ? <span className="note"> ({delta > 0 ? '+' : '−'}{fmt(Math.abs(delta), fonte.decimali?.(r.key) ?? 0)}{fonte.unita(r.key) ? `\u00a0${fonte.unita(r.key)}` : ''})</span> : null}
                    </span>
                    <span className={`rimedio-costo ${r.costo}`}>{t(`costo_${r.costo}`)}</span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => { fonte.applica(r); onApplied(); }}>{t('applica')}</button>
                  </div>
                  {r.risolti.length ? <p className="note ok">{t('risolve', { list: r.risolti.map(nome).join('; ') })}</p> : null}
                  {r.nuovi.length ? <p className="note warn">{t('avvisa', { list: r.nuovi.map((n) => nome(n.id)).join('; ') })}</p> : null}
                  {nota ? <p className="note">{nota}</p> : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : t.has(`hint_${id}`) ? null : <p className="note">{t('nessuno')}</p>}
      {/* what the check asks beyond one value: data to enter, another standard for an existing building */}
      {t.has(`hint_${id}`) ? <p className="note">{t(`hint_${id}`)}</p> : null}
      {fonte.nota ? <p className="note">{fonte.nota}</p> : null}
    </div>
  );
}
