'use client';

// The acceptance test of the lift: its base standard, the standards added to it and, for a modification under UNI
// 10411, the parts the intervention replaces or changes. A new lift is tested to UNI EN 81-20/50 whatever was chosen;
// the checks of what stays as it is are marked "existing" in the list and stay out of the result; each standard added
// has its own result (src/lib/lift/collaudo.ts). DM 236/1989 is offered with a shaft: its checks are the shaft's, for
// the case chosen there (ticking it sets the usual case when none was chosen).
import { useTranslations } from 'next-intl';
import { NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI, adeguamentiDovuti, type Collaudo, type NormaAggiuntiva, type NormaCollaudo, type Parte } from '@/lib/lift';
import type { Access } from '@/shaft';
import type { Pres } from '@/lib/present/tr';

interface Props {
  P: Pres;
  /** the lift is new: tested to EN 81-20/50, nothing to choose */
  isNew: boolean;
  /** what was chosen (absent: the software's default) */
  chosen: Collaudo | undefined;
  /** the standard in force for the one form (collaudoOf) */
  value: Collaudo;
  set(c: Collaudo): void;
  /** the DM 236 case of the shaft (absent: no shaft, as in the replacement alone) */
  access?: { value: Access; set(a: Access): void };
}

const KEY: Readonly<Record<NormaCollaudo, string>> = { en81: 'norma_en81', '10411-1': 'norma_10411_1', '10411-11': 'norma_10411_11' };
const ADAPT = ['a_brake', 'a_timer', 'a_overspeed', 'a_stop', 'a_power'] as const;

export default function CollaudoOptions({ P, isNew, chosen, value, set, access }: Props) {
  const t = useTranslations('lift');
  const added = value.aggiuntive ?? [], keep = (a: readonly NormaAggiuntiva[]) => (a.length ? { aggiuntive: a } : {});
  // the parts ticked under UNI 10411 are kept with EN 81 too, so going to EN 81 and back loses nothing
  const setNorma = (norma: NormaCollaudo): void => set({ norma, parti: chosen?.parti ?? ['machine'], ...keep(chosen?.aggiuntive ?? []) });
  const toggle = (p: Parte, on: boolean): void => set({ norma: value.norma, parti: PARTI.filter((x) => (x === p ? on : value.parti.includes(x))), ...keep(added) });
  const toggleAdded = (n: NormaAggiuntiva, on: boolean): void => {
    set({ norma: value.norma, parti: value.parti, ...keep(NORME_AGGIUNTIVE.filter((x) => (x === n ? on : added.includes(x)))) });
    if (n === 'dm236' && on && access?.value === 'none') access.set(isNew ? 'dm236_residential' : 'dm236_existing');
  };
  // EN 81-20/50 is added only on top of another base; DM 236 needs a shaft
  const offer = NORME_AGGIUNTIVE.filter((n) => !(n === 'en81' && value.norma === 'en81') && (n !== 'dm236' || access));
  const uni = value.norma !== 'en81';
  return (
    <div className="collaudo">
      <label className="field">
        <span>{t('norma_title')}</span>
        <select className="input" value={value.norma} disabled={isNew} onChange={(e) => {
          const n = NORME_COLLAUDO.find((x) => x === e.target.value);
          if (n) setNorma(n);
        }}>
          {NORME_COLLAUDO.map((n) => <option key={n} value={n}>{t(KEY[n])}</option>)}
        </select>
      </label>
      <p className="note">{isNew ? t('norma_new_hint') : uni ? t('norma_which') : t('norma_en81_hint')}</p>
      {uni ? (
        <fieldset className="parti">
          <legend>{t('parti_title')}</legend>
          <div className="parti-grid">
            {PARTI.map((p) => (
              <label key={p}>
                <input type="checkbox" checked={value.parti.includes(p)} onChange={(e) => toggle(p, e.target.checked)} />
                <span>{t(`parte_${p}`)}</span>
              </label>
            ))}
          </div>
          <p className="note">{t('parti_hint')}</p>
        </fieldset>
      ) : null}
      {offer.length ? (
        <fieldset className="parti">
          <legend>{t('aggiuntive_title')}</legend>
          <div className="parti-grid wide">
            {offer.map((n) => (
              <label key={n}>
                <input type="checkbox" checked={added.includes(n)} onChange={(e) => toggleAdded(n, e.target.checked)} />
                <span>{t(`aggiunta_${n}`)}</span>
              </label>
            ))}
          </div>
          <p className="note">{t('aggiuntive_hint')}</p>
          {added.includes('dm236') && access?.value === 'none' ? <p className="note bad">{t('aggiunta_dm236_case')}</p> : null}
        </fieldset>
      ) : null}
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
