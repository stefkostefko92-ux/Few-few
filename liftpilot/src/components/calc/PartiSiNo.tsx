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
// with «No» checked (AltreParti, owner's decision Q3). Round 47 (owner's decision D1): where the documents show no
// change of speed, load or travel the part starts answered «No» with the mark «dai documenti» and the why (the logbook's
// sentence, frasi-libretto.ts; the loads the documented ones) — the answer stays the user's to change, and a «Sì» against
// the documents says that the relazione leaves it for the engineer to confirm; a change the documents do not decide, or
// none documented, stays to answer, the list of what is missing naming what is needed (mancaParte).
// Each pair is two native radio buttons of one group (arrow keys move and answer, one tab stop per part, as the type
// cards above); none is checked while the part is still to answer. Round 52: each part, the renovation and the list's
// title with their «?» (messages/aiuto/calcolo.json); the names stay the radio groups' and the list's accessible names.
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { testoAiuto } from '@/lib/aiuto';
import { parteId } from '@/lib/calc-blank';
import type { Collaudo, Parte } from '@/lib/lift';
import { carichiOf, corsaOf, portataVariata, variazioneCorsa, variazioneVelocita, velocitaOf, type EsitoDoc } from '@/lib/lift/modifica';
import { bloccata, esitoParte, facoltativeDi, partiDi, type Bloccata } from '@/lib/lift/risposte';
import type { Fmt } from '@/lib/present/tr';
import type { Regolazione } from '@/lib/lift/modifica';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { fraseCorsa, fraseVelocita } from '../lift/frasi-libretto';
import { ConAiuto } from '../shaft/Campo';
import AltreParti from './AltreParti';
import { etichettaParte } from './etichette-parti';
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
    // the comparison the change is measured on: an increase from the reference (15.1), a decrease from the logbook's (15.16)
    const c = xv?.confronti[0];
    if (xv && c) return t('perche_velocita', { dv: `${c.dv < 0 ? '−' : '+'}${fmt(Math.abs(c.dv) * 100, 1)} %`, rif: fmt(c.rispetto, 2),
      di: t(c.di === '50hz' ? 'perche_di_50hz' : 'perche_di_libretto'),
      clausola: norma === '10411-11' ? 'UNI 10411-11, 15' : xv.aumento ? 'UNI 10411-1, 15.1' : 'UNI 10411-1, 15.16' });
    if (xh && value.libretto?.H) return t('perche_corsa', { dH: `${xh.dH < 0 ? '−' : '+'}${fmt(Math.abs(xh.dH), 2)} m`, H: fmt(value.libretto.H, 2), clausola: `UNI ${norma}, 16` });
    return null;
  };
  const AUTO_LABEL: Partial<Record<Bloccata['perche'], string>> = { carichi: 'load_auto', velocita: 'velocita_auto', corsa: 'corsa_auto', arcata: 'sling_rif',
    inverter: 'quadro_auto' };
  // why the documents answer «No», leave the change open, or wait for the calculation's value (round 47, D1)
  const perDoc = (p: Parte, e: EsitoDoc): string | null => {
    if (e === 'attesa') return t(`attesa_${p}`);
    if (p === 'speed') {
      if (e === 'aperta') return t('perche_velocita_aperta');
      const f = fraseVelocita(norma, value.libretto, velocitaOf(V), fmt);
      return f ? tl(f.key, f.values) : null;
    }
    if (p === 'travel') {
      const f = fraseCorsa(norma, value.libretto, corsaOf(V), fmt);
      return f ? tl(f.key, f.values) : null;
    }
    const doc = value.documentato, ora = carichiOf(V);
    if (e === 'aperta') {
      return doc && ora && portataVariata(doc, ora) ? t('perche_portata_aperta', { Q0: fmt(doc.Q, 0), Q: fmt(ora.Q, 0) }) : t('perche_carichi_aperta');
    }
    // a new car: its mass to confirm — on the existing sling with point 22, with the sling replaced too 6.1 alone
    const cabina = chosen.parti.includes('car') ? ` ${t(chosen.parti.includes('sling') ? 'perche_carichi_cabina_arcata' : 'perche_carichi_cabina')}` : '';
    return `${t('perche_carichi_uguali')}${cabina}`;
  };
  // a change the documents bring, answered «Sì» by the user before the rule would lock it: the lock's words (round 47 review)
  const PERCHE_SI: Partial<Record<Parte, Bloccata['perche']>> = { speed: 'velocita', load: 'carichi', travel: 'corsa' };
  // the regulation's question goes under the part it hangs on: the ropes of a «Solo argano», the controller otherwise
  const dopo: Parte = solo ? 'ropes' : 'controller';
  const domanda = regolazione ? <RegolazioneQuadro key="regolazione" value={chosen.regolazione} set={regolazione.set} norma={norma} /> : null;
  const row = (p: Parte) => {
    if (solo && p === 'machine') return <li key={p} className="parte fissa" data-part={p}><span className="parte-nome">{t('argano_fisso')}</span></li>;
    const lock = bloccata(tipo, chosen, value, V, p), e = lock ? null : esitoParte(tipo, value, V, p), doc = e === 'no';
    const answered = risposte.includes(p) || lock !== null || doc, si = lock ? lock.si : chosen.parti.includes(p);
    const motivo = PERCHE_SI[p], why = lock ? perche(lock) : e === 'si' && motivo ? perche({ si: true, perche: motivo }) : e ? perDoc(p, e) : null;
    const whyId = `${parteId(p)}-perche`, controId = `${parteId(p)}-contro`;
    const described = [why ? whyId : '', doc && si ? controId : ''].filter(Boolean).join(' ') || undefined;
    return (
      <li key={p} className={`parte${answered || e === 'attesa' ? '' : ' da'}`} data-part={p} data-doc={e ?? undefined}>
        <ConAiuto aiuto={testoAiuto(AIUTO, `parte_${p}`)} nome={label(p)} className="parte-lbl">
          <span className="parte-nome" id={`${parteId(p)}-label`}>{label(p)}</span>
        </ConAiuto>
        {lock ? (
          <span className={`parte-regola ${lock.si ? 'si' : 'no'}`} aria-describedby={why ? whyId : undefined}>
            {t(AUTO_LABEL[lock.perche] ?? 'si')}
          </span>
        ) : (
          <span className="seg-row parte-scelta" role="radiogroup" aria-labelledby={`${parteId(p)}-label`} aria-describedby={described}>
            {([true, false] as const).map((x) => (
              <label key={String(x)} className={answered && si === x ? 'on' : undefined}>
                <input type="radio" name={parteId(p)} id={x ? parteId(p) : undefined} value={x ? 'si' : 'no'} checked={answered && si === x} onChange={() => answer(p, x)} />
                {t(x ? 'si' : 'no')}
              </label>
            ))}
          </span>
        )}
        {!answered && e !== 'attesa' ? <span className="parte-da">{t('da')}</span> : null}
        {doc && !si ? <span className="parte-doc">{t('doc_no')}</span> : null}
        {doc && si ? <span className="parte-contro" id={controId}>{t('contro_doc')}</span> : null}
        {why ? <span className="parte-perche" id={whyId}>{why}</span> : null}
      </li>
    );
  };
  return (
    <fieldset className="parti-sino" aria-labelledby="parti-sino-title">
      <legend><ConAiuto aiuto={solo ? null : testoAiuto(AIUTO, 'parti')} nome={t('parti_title')}><span id="parti-sino-title">{t('parti_title')}</span></ConAiuto></legend>
      <p className="note">{solo ? t('parti_lead_solo') : t('parti_lead')}</p>
      {rifacimento ? (
        <div className="rif-preset">
          <button type="button" className={`btn btn-sm${rifacimento.on ? ' on' : ''}`} aria-pressed={rifacimento.on} onClick={() => rifacimento.set(!rifacimento.on)}>{t('rif_preset')}</button>
          <ConAiuto aiuto={testoAiuto(AIUTO, 'rifacimento')} nome={t('rif_preset')} />
          {rifacimento.on ? <span className="note">{t('rif_on')}</span> : null}
        </div>
      ) : null}
      <ul className="parti-list">{partiDi(tipo).flatMap((p) => (p === dopo && domanda ? [row(p), domanda] : [row(p)]))}</ul>
      {solo ? null : <AltreParti parti={facoltativeDi(tipo, chosen)} chosen={chosen} answer={answer} />}
    </fieldset>
  );
}
