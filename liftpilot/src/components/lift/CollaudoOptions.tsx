'use client';

// The acceptance test of the lift: its base standard, the standards added to it and, for a modification under UNI
// 10411, the parts the intervention replaces or changes. A new lift is tested to UNI EN 81-20/50 whatever was chosen;
// the checks of what stays as it is are marked "existing" in the list and stay out of the result; each standard added
// has its own result (src/lib/lift/collaudo.ts). Under UNI 10411 the answer about the lift's CE marking picks its part,
// the loads the last report documents, against the design's, can bring the checks of the load, and the logbook's speed
// and travel those of the speed and of the travel (round 46, DatiLibretto; src/lib/lift/modifica.ts). In «Calcolo argano» (round 45, `mode`) the type of intervention decides the base: a «Solo
// argano» or a modernisation under UNI 10411-1 or -11, the transformation under EN 81-20/50 (locked); the parts are
// answered in the type's card (src/components/calc/PartiSiNo.tsx), and DM 236 is ticked here with its case chosen in the
// Progetto. On the one form (no `mode`, until /progetto stops choosing the intervention) the parts are ticked here and DM
// 236 is offered with a shaft, its case set when it is ticked; the renovation that keeps the existing sling
// (src/lib/lift/intervento.ts) is a modification under UNI 10411 only: the sling stays out of the parts replaced.
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI, adeguamentiDovuti, ammessa, withAggiunta, type Collaudo, type NormaAggiuntiva, type NormaCollaudo,
  type Parte } from '@/lib/lift';
import { choiceOf, documentiOf, esistenteOf } from '@/lib/lift/collaudo';
import { MARCATURE, isServiceDay } from '@/lib/lift/modifica';
import type { Access } from '@/shaft';
import { ADAPT } from '@/lib/present/adapt';
import type { Pres } from '@/lib/present/tr';
import CarichiDocumentati from './CarichiDocumentati';
import DatiLibretto from './DatiLibretto';
import NormeAggiunte from './NormeAggiunte';

/** The type of intervention of «Calcolo argano» the test follows. */
export type CollaudoMode = 'solo' | 'ammodernamento' | 'trasformazione';

interface Props {
  P: Pres;
  /** «Calcolo argano»: the type chosen; absent — the one form, which ticks the parts here */
  mode?: CollaudoMode;
  /** the one form: the lift is new, tested to EN 81-20/50, nothing to choose */
  isNew?: boolean;
  /** what was chosen (absent: the software's default) */
  chosen: Collaudo | undefined;
  /** the standard in force (collaudoOf) */
  value: Collaudo;
  set(c: Collaudo): void;
  /** the one form: the DM 236 case of the shaft (absent: no shaft) */
  access?: { value: Access; set(a: Access): void };
  /** the calculation's values the design's loads come from (the change from the documented ones) */
  calc?: FormValues;
}

const KEY: Readonly<Record<NormaCollaudo, string>> = { en81: 'norma_en81', '10411-1': 'norma_10411_1', '10411-11': 'norma_10411_11' };

export default function CollaudoOptions({ P, mode, isNew: isNewForm = false, chosen, value, set, access, calc }: Props) {
  const t = useTranslations('lift'), ti = useTranslations('calculations.intervento');
  const isNew = mode ? mode === 'trasformazione' : isNewForm;
  const added = value.aggiuntive ?? [], keep = (a: readonly NormaAggiuntiva[]) => (a.length ? { aggiuntive: a } : {});
  // the renovation stays one whatever else changes, and so does what is known of the existing lift
  const rif = value.rifacimento === true, mark = rif ? { rifacimento: true as const } : {}, known = esistenteOf(value);
  // the parts as answered: in «Calcolo argano» the user's answers (the card's), never what the rule adds for the
  // documents; on the one form, the test's parts but the load the documented loads count as changed
  const parti = mode ? chosen?.parti ?? [] : choiceOf(value, chosen), autoLoad = value.parti.includes('load') && !parti.includes('load');
  // the parts ticked under UNI 10411 are kept with EN 81 too, so going to EN 81 and back loses nothing; a part of UNI
  // 10411 chosen by hand drops the answer about the CE marking that would pick the other, never what the documents say
  const setNorma = (norma: NormaCollaudo): void =>
    set({ norma, parti: chosen?.parti ?? ['machine'], ...keep(chosen?.aggiuntive ?? []), ...mark, ...documentiOf(known) });
  const toggle = (p: Parte, on: boolean): void => set({ norma: value.norma, parti: PARTI.filter((x) => (x === p ? on : parti.includes(x))), ...keep(chosen?.aggiuntive ?? added), ...mark, ...known });
  const setKnown = (patch: Partial<Collaudo>): void => {
    const next = { ...known, ...patch };
    set({ norma: value.norma, parti, ...keep(chosen?.aggiuntive ?? added), ...mark, ...esistenteOf({ norma: value.norma, parti, ...next }) });
  };
  // under a new lift the modification chosen stays as it was (collaudo.ts); in «Calcolo argano» the test as chosen with
  // the standard added or taken off
  const toggleAdded = (n: NormaAggiuntiva, on: boolean): void => {
    if (mode && chosen) {
      const { aggiuntive: prev = [], ...rest } = chosen;
      set({ ...rest, ...keep(NORME_AGGIUNTIVE.filter((x) => (x === n ? on : prev.includes(x)))) });
      return;
    }
    set(withAggiunta(isNew, chosen, value, n, on));
    if (n === 'dm236' && on && access?.value === 'none') access.set(isNew ? 'dm236_residential' : 'dm236_existing');
  };
  // the standards that fit the base (EN 81-20/50 only on top of another one, the improvement of existing lifts only on a
  // modification…); DM 236 needs a shaft — none touched by the machine's replacement alone
  const fits = (n: NormaAggiuntiva): boolean => ammessa(n, value.norma) && (n !== 'dm236' || (mode ? mode !== 'solo' : access !== undefined));
  const offer = NORME_AGGIUNTIVE.filter(fits);
  const uni = value.norma !== 'en81';
  // the base EN 81-20/50 is the transformation's: never offered on a modification of «Calcolo argano», nor on a renovation
  const basi = NORME_COLLAUDO.filter((n) => n !== 'en81' || (!rif && !mode));
  const dm236Note = mode ? ti('dm236_progetto') : access?.value === 'none' ? t('aggiunta_dm236_case') : null;
  return (
    <div className="collaudo" id="collaudo">
      {mode === 'trasformazione' ? (
        <div className="field">
          <span>{t('norma_title')}</span>
          <p className="norma-fissa">{t(KEY.en81)}</p>
        </div>
      ) : (
        <label className="field">
          <span>{t('norma_title')}</span>
          <select className="input" value={value.norma} disabled={isNew} onChange={(e) => {
            const n = NORME_COLLAUDO.find((x) => x === e.target.value);
            if (n) setNorma(n);
          }}>
            {basi.map((n) => <option key={n} value={n}>{t(KEY[n])}</option>)}
          </select>
        </label>
      )}
      {rif ? <p className="note">{t('rif_hint')}</p> : null}
      <p className="note">{isNew ? t('norma_new_hint') : uni ? t('norma_which') : t('norma_en81_hint')}</p>
      {uni ? (
        <fieldset className="parti">
          <legend>{t('ce_title')}</legend>
          <div className="seg-row" role="radiogroup" aria-label={t('ce_title')}>
            {MARCATURE.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={value.marcatura === m} className={value.marcatura === m ? 'on' : undefined}
                onClick={() => setKnown({ marcatura: m })}>{t(`ce_${m}`)}</button>
            ))}
          </div>
          {value.marcatura === 'incerta' ? (
            <label className="field">
              <span>{t('servizio')}</span>
              {/* a day of the calendar up to today (isServiceDay); today's date may differ between the server and the browser */}
              <input type="date" className="input" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} suppressHydrationWarning value={value.servizio ?? ''}
                onChange={(e) => setKnown({ servizio: isServiceDay(e.target.value) ? e.target.value : undefined })} />
            </label>
          ) : null}
          <p className={`note${value.marcatura === 'incerta' ? ' bad' : ''}`}>{t(value.marcatura === 'incerta' ? 'ce_incerta_hint' : 'ce_hint')}</p>
        </fieldset>
      ) : null}
      {uni && !mode ? (
        <fieldset className="parti">
          <legend>{t('parti_title')}</legend>
          <div className="parti-grid">
            {PARTI.map((p) => {
              // the renovation's sling stays: never ticked; the load the documented loads count as changed: ticked
              const kept = rif && p === 'sling', auto = p === 'load' && autoLoad;
              return (
                <label key={p} data-part={p}>
                  <input type="checkbox" checked={!kept && value.parti.includes(p)} disabled={kept || auto} onChange={(e) => toggle(p, e.target.checked)} />
                  <span>{kept ? t('rif_sling') : auto ? `${t('parte_load')} — ${t('auto_load')}` : t(`parte_${p}`)}</span>
                </label>
              );
            })}
          </div>
          <p className="note">{t('parti_hint')}</p>
        </fieldset>
      ) : null}
      {uni ? <CarichiDocumentati P={P} value={value} calc={calc} set={(documentato) => setKnown({ documentato })} /> : null}
      {uni ? <DatiLibretto P={P} value={value} calc={calc} set={(libretto) => setKnown({ libretto })} /> : null}
      {offer.length ? <NormeAggiunte fits={fits} added={added} toggle={toggleAdded} dm236Note={dm236Note} /> : null}
      {adeguamentiDovuti(value) ? (
        <div className="adapt">
          <strong>{P.t('c_adapt')}</strong>
          <ul>{ADAPT.map((k) => <li key={k}>{P.t(k)}</li>)}</ul>
          <p className="note">{P.t('a_src')}</p>
        </div>
      ) : value.norma === '10411-11' && value.parti.includes('machine') ? <p className="note">{t('adapt_11')}</p> : null}
    </div>
  );
}
