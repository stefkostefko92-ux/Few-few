'use client';

// «Tipo di intervento», the first thing «Calcolo argano» asks (round 45): «Solo argano», «Ammodernamento», «Trasformazione
// completa», each with its line and the base of its acceptance test. The scale under each name is how much of the lift
// the intervention takes into its test — the machine, the parts answered, the whole lift. Nothing is proposed, advised
// or judged before a type is chosen; the parts and the warnings of the type follow in the same card.
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { TIPI_INTERVENTO, type TipoIntervento } from '@/lib/lift';

interface Props {
  tipo: TipoIntervento | null;
  choose(t: TipoIntervento): void;
  children?: ReactNode;
}

export default function InterventoChoice({ tipo, choose, children }: Props) {
  const t = useTranslations('calculations.intervento');
  return (
    <section className={`panel intervento${tipo ? '' : ' da'}`} aria-labelledby="intervento-title">
      <div className="intervento-head">
        <h2 id="intervento-title">{t('title')}</h2>
        <p className="note">{t('lead')}</p>
      </div>
      <div className="intervento-tipi" role="radiogroup" aria-labelledby="intervento-title">
        {TIPI_INTERVENTO.map((k, i) => (
          <label key={k} className={`intervento-tipo${tipo === k ? ' on' : ''}`} data-tipo={k}>
            <input type="radio" name="intervento" id={i === 0 ? 'intervento' : undefined} value={k} checked={tipo === k} onChange={() => choose(k)} />
            <span className="tipo-nome">{t(k)}</span>
            <span className="tipo-scala" aria-hidden="true">{[0, 1, 2].map((s) => <i key={s} className={s <= i ? 'piena' : undefined} />)}</span>
            <span className="tipo-norma">{t(k === 'TRASFORMAZIONE_COMPLETA' ? 'norma_new' : 'norma_mod')}</span>
            <span className="tipo-lead">{t(`${k}_lead`)}</span>
          </label>
        ))}
      </div>
      {children}
    </section>
  );
}
