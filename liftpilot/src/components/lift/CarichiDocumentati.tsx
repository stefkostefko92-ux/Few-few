'use client';

// The loads the last report documents (Q, P, counterweight) against the design's: their change, under the part of UNI
// 10411 of the test, can bring the checks of the load (src/lib/lift/modifica.ts variazioneCarico). Typed as text; stored
// once all three are numbers. Round 52: each with its «?» (messages/aiuto/calcolo.json), a label of its own (shaft/Campo).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { testoAiuto } from '@/lib/aiuto';
import { KL, type Collaudo } from '@/lib/lift';
import { carichiOf, variazioneCarico, type Carichi } from '@/lib/lift/modifica';
import type { Pres } from '@/lib/present/tr';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import Campo from '../shaft/Campo';

type DocKey = keyof Carichi;
const DOC_KEYS: readonly DocKey[] = ['Q', 'P', 'Mcw'];
const docText = (d: Carichi | undefined): Record<DocKey, string> => ({ Q: d ? String(d.Q) : '', P: d ? String(d.P) : '', Mcw: d ? String(d.Mcw) : '' });

interface Props {
  P: Pres;
  /** the test in force (its part of UNI 10411 and the loads documented) */
  value: Collaudo;
  /** the calculation's values the design's loads come from */
  calc?: FormValues;
  set(documentato: Carichi | undefined): void;
}

export default function CarichiDocumentati({ P, value, calc, set }: Props) {
  const t = useTranslations('lift');
  const [doc, setDoc] = useState<Record<DocKey, string>>(() => docText(value.documentato));
  const type = (k: DocKey, text: string): void => {
    const d = { ...doc, [k]: text }, n = DOC_KEYS.map((x) => Number(d[x].replace(',', '.')));
    setDoc(d);
    const [Q, Pc, Mcw] = n;
    set(n.every((x) => Number.isFinite(x) && x >= 1 && x <= 100_000) ? { Q, P: Pc, Mcw } : undefined);
  };
  const ora = calc ? carichiOf(calc) : null, norma11 = value.norma === '10411-1' || value.norma === '10411-11' ? value.norma : null;
  const v = norma11 && value.documentato && ora ? variazioneCarico(norma11, value.documentato, ora) : null;
  const pct = (x: number): string => `${x < 0 ? '−' : '+'}${P.fmt(Math.abs(x) * 100, 1)} %`;
  const aiuto: Readonly<Record<DocKey, string | null>> = { Q: testoAiuto(AIUTO, 'doc_Q'), P: testoAiuto(AIUTO, 'doc_P'), Mcw: testoAiuto(AIUTO, 'doc_Mcw') };
  return (
    <fieldset className="parti">
      <legend>{t('doc_title')}</legend>
      <div className="form-grid">
        {DOC_KEYS.map((k) => (
          <Campo key={k} id={`doc-${k}`} nome={t(`doc_${k}`)} aiuto={aiuto[k]}>
            <input id={`doc-${k}`} className="input num" type="number" inputMode="numeric" min={1} max={100000} step={1} value={doc[k]} onChange={(e) => type(k, e.target.value)} />
          </Campo>
        ))}
      </div>
      {v ? (
        <p className={`note${v.p1 || v.p2 || v.calo || v.rapporto ? ' bad' : ''}`} role="status">
          {t('var_line', { dQ: pct(v.dQ), dT: pct(v.dT), dTcp: pct(v.dTcp) })}{' '}
          {t(v.p1 || v.p2 ? 'var_over' : v.calo ? 'var_down' : v.rapporto ? 'var_ratio' : 'var_within')}{v.strutture ? ` ${t('var_struct', { s: P.fmt(KL.loadStruct11 * 100, 0) })}` : ''}
        </p>
      ) : null}
      <p className="note">{t('doc_hint', { split: KL.loadSplitQ, q1: P.fmt(KL.loadIncQ[0] * 100, 0), t1: P.fmt(KL.loadIncT[0] * 100, 0), q2: P.fmt(KL.loadIncQ[1] * 100, 0),
        t2: P.fmt(KL.loadIncT[1] * 100, 0), c1: P.fmt(KL.loadIncTcp[0] * 100, 0), c2: P.fmt(KL.loadIncTcp[1] * 100, 0) })}</p>
    </fieldset>
  );
}
