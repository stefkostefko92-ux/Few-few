'use client';

// The parts of the intervention answered one by one (round 45, owner's decision Q1): «Sì» or «No» for each, none taken
// as «No» until it is answered — a forgotten default would silently turn a replaced part's checks into «esistente».
// A «Solo argano» replaces the machine and asks only about the ropes; a modernisation asks about every part, its
// machine answered «Sì» on entry, and offers the renovation that keeps the existing sling, which answers every part it
// replaces at once (speed, load and travel still to answer). The rule's answers are shown, not asked: new ropes of their
// own number and diameter, a load the documented loads changed, a speed or a travel the logbook counts as changed (round
// 46: locked «Sì», the reason beside it and named by the lock, aria-describedby), the sling kept by the renovation
// (src/lib/lift/risposte.ts). Round 46: under a new machine on the existing controller the controller's speed regulation
// is asked (RegolazioneQuadro: under the ropes of a «Solo argano», under the controller of a modernisation), one or two
// speeds locking the controller «Sì» in a modernisation (11.2.1 / 11.2); the optional parts are a group of their own
// with «No» checked (AltreParti, owner's decision Q3).
// Each pair is two native radio buttons of one group (arrow keys move and answer, one tab stop per part, as the type
// cards above); none is checked while the part is still to answer.
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { parteId } from '@/lib/calc-blank';
import type { Collaudo, Parte } from '@/lib/lift';
import { corsaOf, variazioneCorsa, variazioneVelocita, velocitaOf } from '@/lib/lift/modifica';
import { bloccata, facoltativeDi, partiDi, type Bloccata } from '@/lib/lift/risposte';
import type { Fmt } from '@/lib/present/tr';
import type { Regolazione } from '@/lib/lift/modifica';
import AltreParti from './AltreParti';
import RegolazioneQuadro from './RegolazioneQuadro';

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
  /** the existing controller's speed regulation, when it is asked (risposte.ts chiediRegolazione) */
  regolazione?: { set(r: Regolazione): void } | null;
  fmt: Fmt;
}

const VARIATA: Partial<Record<Parte, string>> = { machine: 'parte_argano', speed: 'parte_speed_var', load: 'parte_load_var', travel: 'parte_travel_var' };

/** A part's name in «Calcolo argano» — in its list and in the list of what is missing, the same words. */
export function etichettaParte(t: (k: string) => string, tl: (k: string) => string, tipo: string | null, p: Parte): string {
  return tipo === 'SOLO_ARGANO' && p === 'ropes' ? t('funi') : VARIATA[p] ? t(VARIATA[p]) : tl(`parte_${p}`);
}

export default function PartiSiNo({ tipo, chosen, value, V, risposte, answer, rifacimento, regolazione = null, fmt }: Props) {
  const t = useTranslations('calculations.intervento'), tl = useTranslations('lift');
  const solo = tipo === 'SOLO_ARGANO';
  const label = (p: Parte): string => etichettaParte(t, tl, tipo, p);
  // why the rule answers: the ropes of their own, the documented loads, the logbook's speed and travel against the design's
  const norma = value.norma === '10411-11' ? '10411-11' : '10411-1';
  const perche = (lock: Bloccata): string | null => {
    if (lock.perche === 'funi') return t('funi_nuove');
    if (lock.perche === 'carichi') return t('perche_carichi');
    if (lock.perche === 'inverter') return t('perche_inverter', { clausola: norma === '10411-11' ? 'UNI 10411-11, 11.2' : 'UNI 10411-1, 11.2.1' });
    const v = lock.perche === 'velocita' ? velocitaOf(V) : null, H = lock.perche === 'corsa' ? corsaOf(V) : null;
    const xv = v !== null ? variazioneVelocita(norma, value.libretto, v) : null, xh = H !== null ? variazioneCorsa(norma, value.libretto, H) : null;
    if (xv) return t('perche_velocita', { dv: `${xv.dv < 0 ? '−' : '+'}${fmt(Math.abs(xv.dv) * 100, 1)} %`, rif: fmt(xv.rif, 2),
      clausola: norma === '10411-11' ? 'UNI 10411-11, 15' : xv.aumento ? 'UNI 10411-1, 15.1' : 'UNI 10411-1, 15.16' });
    if (xh && value.libretto?.H) return t('perche_corsa', { dH: `${xh.dH < 0 ? '−' : '+'}${fmt(Math.abs(xh.dH), 2)} m`, H: fmt(value.libretto.H, 2), clausola: `UNI ${norma}, 16` });
    return null;
  };
  const AUTO_LABEL: Partial<Record<Bloccata['perche'], string>> = { carichi: 'load_auto', velocita: 'velocita_auto', corsa: 'corsa_auto', arcata: 'sling_rif',
    inverter: 'quadro_auto' };
  // the regulation's question goes under the part it hangs on: the ropes of a «Solo argano», the controller otherwise
  const dopo: Parte = solo ? 'ropes' : 'controller';
  const domanda = regolazione ? <RegolazioneQuadro key="regolazione" value={chosen.regolazione} set={regolazione.set} norma={norma} /> : null;
  const row = (p: Parte) => {
    if (solo && p === 'machine') return <li key={p} className="parte fissa" data-part={p}><span className="parte-nome">{t('argano_fisso')}</span></li>;
    const lock = bloccata(tipo, chosen, value, V, p), answered = risposte.includes(p) || lock !== null;
    const si = lock ? lock.si : chosen.parti.includes(p), why = lock ? perche(lock) : null, whyId = `${parteId(p)}-perche`;
    return (
      <li key={p} className={`parte${answered ? '' : ' da'}`} data-part={p}>
        <span className="parte-nome" id={`${parteId(p)}-label`}>{label(p)}</span>
        {lock ? (
          <span className={`parte-regola ${lock.si ? 'si' : 'no'}`} aria-describedby={why ? whyId : undefined}>
            {t(AUTO_LABEL[lock.perche] ?? 'si')}
          </span>
        ) : (
          <span className="seg-row parte-scelta" role="radiogroup" aria-labelledby={`${parteId(p)}-label`}>
            {([true, false] as const).map((x) => (
              <label key={String(x)} className={answered && si === x ? 'on' : undefined}>
                <input type="radio" name={parteId(p)} id={x ? parteId(p) : undefined} value={x ? 'si' : 'no'} checked={answered && si === x} onChange={() => answer(p, x)} />
                {t(x ? 'si' : 'no')}
              </label>
            ))}
          </span>
        )}
        {!answered ? <span className="parte-da">{t('da')}</span> : null}
        {why ? <span className="parte-perche" id={whyId}>{why}</span> : null}
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
      <ul className="parti-list">{partiDi(tipo).flatMap((p) => (p === dopo && domanda ? [row(p), domanda] : [row(p)]))}</ul>
      {solo ? null : <AltreParti parti={facoltativeDi(tipo, chosen)} chosen={chosen} answer={answer} />}
    </fieldset>
  );
}
