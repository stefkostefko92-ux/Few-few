'use client';

// The parts of the intervention answered one by one (round 45, owner's decision Q1): «Sì» or «No» for each, none taken
// as «No» until it is answered — a forgotten default would silently turn a replaced part's checks into «esistente».
// A «Solo argano» replaces the machine and asks only about the ropes; a modernisation asks about every part, its
// machine answered «Sì» on entry, and offers the renovation that keeps the existing sling, which answers every part it
// replaces at once (speed, load and travel still to answer). The rule's answers are shown, not asked: new ropes of their
// own number and diameter, a load the documented loads changed, the sling kept by the renovation (src/lib/lift/risposte.ts).
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { parteId } from '@/lib/calc-blank';
import type { Collaudo, Parte } from '@/lib/lift';
import { bloccata, partiDi } from '@/lib/lift/risposte';

interface Props {
  tipo: 'SOLO_ARGANO' | 'AMMODERNAMENTO';
  /** the parts as answered («Sì»: among them) */
  chosen: Collaudo;
  /** the test as the documents read it */
  value: Collaudo;
  V: FormValues;
  risposte: readonly Parte[];
  answer(p: Parte, si: boolean): void;
  /** the renovation keeping the existing sling (a modernisation only) */
  rifacimento?: { on: boolean; set(on: boolean): void };
}

const VARIATA: Partial<Record<Parte, string>> = { speed: 'parte_speed_var', load: 'parte_load_var', travel: 'parte_travel_var' };

export default function PartiSiNo({ tipo, chosen, value, V, risposte, answer, rifacimento }: Props) {
  const t = useTranslations('calculations.intervento'), tl = useTranslations('lift');
  const solo = tipo === 'SOLO_ARGANO';
  const label = (p: Parte): string => (solo && p === 'ropes' ? t('funi') : VARIATA[p] ? t(VARIATA[p]) : tl(`parte_${p}`));
  const row = (p: Parte) => {
    if (solo && p === 'machine') return <li key={p} className="parte fissa" data-part={p}><span className="parte-nome">{t('argano_fisso')}</span></li>;
    const lock = bloccata(tipo, chosen, value, V, p), answered = risposte.includes(p) || lock !== null;
    const si = lock ? lock.si : chosen.parti.includes(p);
    return (
      <li key={p} className={`parte${answered ? '' : ' da'}`} data-part={p}>
        <span className="parte-nome" id={`${parteId(p)}-label`}>{label(p)}</span>
        {lock ? (
          <span className={`parte-regola ${lock.si ? 'si' : 'no'}`}>
            {lock.perche === 'carichi' ? t('load_auto') : lock.perche === 'arcata' ? t('sling_rif') : t('si')}
          </span>
        ) : (
          <span className="seg-row parte-scelta" role="radiogroup" aria-labelledby={`${parteId(p)}-label`}>
            <button type="button" id={parteId(p)} role="radio" aria-checked={answered && si} className={answered && si ? 'on' : undefined} onClick={() => answer(p, true)}>{t('si')}</button>
            <button type="button" role="radio" aria-checked={answered && !si} className={answered && !si ? 'on' : undefined} onClick={() => answer(p, false)}>{t('no')}</button>
          </span>
        )}
        {!answered ? <span className="parte-da">{t('da')}</span> : null}
        {lock?.perche === 'funi' ? <span className="parte-perche">{t('funi_nuove')}</span> : null}
      </li>
    );
  };
  return (
    <fieldset className="parti-sino">
      <legend>{t('parti_title')}</legend>
      <p className="note">{solo ? t('parti_lead_solo') : t('parti_lead')}</p>
      {rifacimento ? (
        <div className="rif-preset">
          <button type="button" className={`btn btn-sm${rifacimento.on ? ' on' : ''}`} aria-pressed={rifacimento.on} onClick={() => rifacimento.set(!rifacimento.on)}>{t('rif_preset')}</button>
          {rifacimento.on ? <span className="note">{t('rif_on')}</span> : null}
        </div>
      ) : null}
      <ul className="parti-list">{partiDi(tipo).map(row)}</ul>
    </fieldset>
  );
}
