'use client';

// The acceptance test of the lift: its base standard, the standards added to it and, for a modification under UNI
// 10411, the parts the intervention replaces or changes. A new lift is tested to UNI EN 81-20/50 whatever was chosen;
// the checks of what stays as it is are marked "existing" in the list and stay out of the result; each standard added
// has its own result (src/lib/lift/collaudo.ts). DM 236/1989 is offered with a shaft: its checks are the shaft's, for
// the case chosen there (ticking it sets the usual case when none was chosen). A renovation that keeps the existing sling
// (src/lib/lift/intervento.ts) is a modification under UNI 10411 only: the sling stays out of the parts replaced. Under
// UNI 10411 the answer about the lift's CE marking picks its part, and the loads the last report documents, against the
// design's, can bring the checks of the load (src/lib/lift/modifica.ts).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { KL, NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI, adeguamentiDovuti, ammessa, withAggiunta, type Collaudo, type NormaAggiuntiva, type NormaCollaudo,
  type Parte } from '@/lib/lift';
import { choiceOf, esistenteOf } from '@/lib/lift/collaudo';
import { MARCATURE, carichiOf, isServiceDay, variazioneCarico, type Carichi } from '@/lib/lift/modifica';
import type { Access } from '@/shaft';
import { ADAPT } from '@/lib/present/adapt';
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
  /** the calculation's values the design's loads come from (the change from the documented ones) */
  calc?: FormValues;
}

type DocKey = keyof Carichi;
const DOC_KEYS: readonly DocKey[] = ['Q', 'P', 'Mcw'];
const docText = (d: Carichi | undefined): Record<DocKey, string> => ({ Q: d ? String(d.Q) : '', P: d ? String(d.P) : '', Mcw: d ? String(d.Mcw) : '' });

const KEY: Readonly<Record<NormaCollaudo, string>> = { en81: 'norma_en81', '10411-1': 'norma_10411_1', '10411-11': 'norma_10411_11' };
/** The standards that can be added, grouped as the documents present them. */
const GROUPS: readonly { key: string; norme: readonly NormaAggiuntiva[] }[] = [
  { key: 'g_en81', norme: ['en81', 'en81-21', 'en81-28', 'en81-58', 'en81-70', 'en81-71', 'en81-72', 'en81-73', 'en81-76', 'en81-77'] },
  { key: 'g_esistenti', norme: ['en81-80', 'en81-82', 'en81-83'] },
  { key: 'g_nazionali', norme: ['dm236', 'antincendio', 'ntc2018'] },
];
const AVVISO: readonly NormaAggiuntiva[] = ['en81-71', 'en81-80', 'antincendio'];

export default function CollaudoOptions({ P, isNew, chosen, value, set, access, calc }: Props) {
  const t = useTranslations('lift');
  const added = value.aggiuntive ?? [], keep = (a: readonly NormaAggiuntiva[]) => (a.length ? { aggiuntive: a } : {});
  // the renovation stays one whatever else changes, and so does what is known of the existing lift
  const rif = value.rifacimento === true, mark = rif ? { rifacimento: true as const } : {}, known = esistenteOf(value);
  // the documented loads as typed: stored once all three are numbers
  const [doc, setDoc] = useState<Record<DocKey, string>>(() => docText(value.documentato));
  // the parts ticked under UNI 10411 are kept with EN 81 too, so going to EN 81 and back loses nothing; a part of UNI
  // 10411 chosen by hand drops the answer about the CE marking that would pick the other
  const setNorma = (norma: NormaCollaudo): void =>
    set({ norma, parti: chosen?.parti ?? ['machine'], ...keep(chosen?.aggiuntive ?? []), ...mark, ...(known.documentato ? { documentato: known.documentato } : {}) });
  const parti = choiceOf(value, chosen), autoLoad = value.parti.includes('load') && !parti.includes('load');
  const toggle = (p: Parte, on: boolean): void => set({ norma: value.norma, parti: PARTI.filter((x) => (x === p ? on : parti.includes(x))), ...keep(chosen?.aggiuntive ?? added), ...mark, ...known });
  const setKnown = (patch: Partial<Collaudo>): void => {
    const next = { ...known, ...patch };
    set({ norma: value.norma, parti, ...keep(chosen?.aggiuntive ?? added), ...mark, ...esistenteOf({ norma: value.norma, parti, ...next }) });
  };
  const typeDoc = (k: DocKey, text: string): void => {
    const d = { ...doc, [k]: text }, n = DOC_KEYS.map((x) => Number(d[x].replace(',', '.')));
    setDoc(d);
    const [Q, Pc, Mcw] = n;
    setKnown({ documentato: n.every((x) => Number.isFinite(x) && x >= 1 && x <= 100_000) ? { Q, P: Pc, Mcw } : undefined });
  };
  const ora = calc ? carichiOf(calc) : null, norma11 = value.norma === '10411-1' || value.norma === '10411-11' ? value.norma : null;
  const v = norma11 && value.documentato && ora ? variazioneCarico(norma11, value.documentato, ora) : null;
  const pct = (x: number): string => `${x < 0 ? '−' : '+'}${P.fmt(Math.abs(x) * 100, 1)} %`;
  // under a new lift the modification chosen stays as it was (collaudo.ts)
  const toggleAdded = (n: NormaAggiuntiva, on: boolean): void => {
    set(withAggiunta(isNew, chosen, value, n, on));
    if (n === 'dm236' && on && access?.value === 'none') access.set(isNew ? 'dm236_residential' : 'dm236_existing');
  };
  // the standards that fit the base (EN 81-20/50 only on top of another one, the improvement of existing lifts only on a
  // modification…); DM 236 needs a shaft
  const fits = (n: NormaAggiuntiva): boolean => ammessa(n, value.norma) && (n !== 'dm236' || access !== undefined);
  const offer = NORME_AGGIUNTIVE.filter(fits);
  const uni = value.norma !== 'en81';
  return (
    <div className="collaudo">
      <label className="field">
        <span>{t('norma_title')}</span>
        <select className="input" value={value.norma} disabled={isNew} onChange={(e) => {
          const n = NORME_COLLAUDO.find((x) => x === e.target.value);
          if (n) setNorma(n);
        }}>
          {NORME_COLLAUDO.filter((n) => !(rif && n === 'en81')).map((n) => <option key={n} value={n}>{t(KEY[n])}</option>)}
        </select>
      </label>
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
      {uni ? (
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
      {uni ? (
        <fieldset className="parti">
          <legend>{t('doc_title')}</legend>
          <div className="form-grid">
            {DOC_KEYS.map((k) => (
              <label className="field" key={k}>
                <span>{t(`doc_${k}`)}</span>
                <input className="input num" type="number" inputMode="numeric" min={1} max={100000} step={1} value={doc[k]} onChange={(e) => typeDoc(k, e.target.value)} />
              </label>
            ))}
          </div>
          {v ? (
            <p className={`note${v.p1 || v.p2 || v.calo ? ' bad' : ''}`} role="status">
              {t('var_line', { dQ: pct(v.dQ), dT: pct(v.dT), dTcp: pct(v.dTcp) })}{' '}
              {t(v.p1 || v.p2 ? 'var_over' : v.calo ? 'var_down' : 'var_within')}{v.strutture ? ` ${t('var_struct', { s: P.fmt(KL.loadStruct11 * 100, 0) })}` : ''}
            </p>
          ) : null}
          <p className="note">{t('doc_hint', { split: KL.loadSplitQ, q1: P.fmt(KL.loadIncQ[0] * 100, 0), t1: P.fmt(KL.loadIncT[0] * 100, 0), q2: P.fmt(KL.loadIncQ[1] * 100, 0),
            t2: P.fmt(KL.loadIncT[1] * 100, 0), c1: P.fmt(KL.loadIncTcp[0] * 100, 0), c2: P.fmt(KL.loadIncTcp[1] * 100, 0) })}</p>
        </fieldset>
      ) : null}
      {offer.length ? (
        <fieldset className="parti">
          <legend>{t('aggiuntive_title')}</legend>
          {GROUPS.map((g) => {
            const here = g.norme.filter(fits);
            return here.length ? (
              <div key={g.key} className="norm-group">
                <span className="norm-group-title">{t(g.key)}</span>
                <div className="parti-grid wide">
                  {here.map((n) => (
                    <label key={n}>
                      <input type="checkbox" checked={added.includes(n)} onChange={(e) => toggleAdded(n, e.target.checked)} />
                      <span>{t(`aggiunta_${n}`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null;
          })}
          {AVVISO.filter((n) => added.includes(n)).map((n) => <p key={n} className="note bad">{t(`avviso_${n}`)}</p>)}
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
