'use client';

// «Tipo di intervento», the first thing «Calcolo argano» asks (round 45): «Solo argano», «Ammodernamento», «Trasformazione
// completa», each with its line and the base of its acceptance test. The scale under each name is how much of the lift
// the intervention takes into its test — the machine, the parts answered, the whole lift. Nothing is proposed, advised
// or judged before a type is chosen; the parts and the warnings of the type follow in the same card. Round 52: the «?»
// beside the title says what each type means (the cards are labels: no «?» inside them); the radio group keeps the
// title alone as its name.
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import { TIPI_INTERVENTO, type TipoIntervento } from '@/lib/lift';
import { passoId } from '@/lib/passi-moduli';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { NumeroPasso } from '../passi/BarraPassi';
import { ConAiuto } from '../shaft/Campo';

interface Props {
  tipo: TipoIntervento | null;
  choose(t: TipoIntervento): void;
  /** the card's number in the bar of the steps */
  passo?: number;
  children?: ReactNode;
}

export default function InterventoChoice({ tipo, choose, passo, children }: Props) {
  const t = useTranslations('calculations.intervento');
  return (
    <section className={`panel intervento passo-sez${tipo ? '' : ' da'}`} id={passoId('tipo')} aria-labelledby="intervento-title">
      <div className="intervento-head">
        <ConAiuto aiuto={testoAiuto(AIUTO, 'tipo')} nome={t('title')} block><h2 id="intervento-title"><NumeroPasso n={passo} />{t('title')}</h2></ConAiuto>
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
