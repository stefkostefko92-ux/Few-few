'use client';

// A saved calculation, shown with the same components as the calculator (read only): the browser recomputes
// the stored values with the same engine; the server has already checked that the stored hash is reproduced. One made
// from a shaft design (`design`) proposes on a direct pull only the sheave its plan hangs the falls from, as its
// relazione (lift/direct.ts). Round 52: its results open in the workspace's mode, as the calculator's (ModoCalc.tsx).
import { useMemo } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift';
import { calcExtra } from '@/lib/lift/calc-verdict';
import type { TipoIntervento } from '@/lib/lift/intervento';
import { analyse } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { asCalcDict } from './dict';
import Diagram from './Diagram';
import Verdict from './Verdict';
import Results from './Results';
import LegalNotice from './LegalNotice';
import { ModoSwitch, useModo } from './ModoCalc';

/** `id`: the anchor of its checks — the verdict that names those not passed and those with a warning (the result pill's
 *  panel leads there). `tipo`: the type declared with it (round 45), named by the copied summary; `resta`: a
 *  modernisation keeping the existing machine — verified as it is, with no proposal (as the calculator shows it). */
export default function CalculationView({ id, values, brand, collaudo, design = false, tipo = null, resta = false }: {
  id?: string; values: FormValues; brand: string; collaudo: Collaudo; design?: boolean; tipo?: TipoIntervento | null; resta?: boolean;
}) {
  const locale = useLocale(), messages = useMessages(), ti = useTranslations('calculations.intervento');
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const a = useMemo(() => analyse(values, design), [values, design]);
  // D.1 and D.2 with the ratio of the loads changed, counted in its result as its save counted them (calc-verdict.ts)
  const extra = useMemo(() => calcExtra(collaudo, values), [collaudo, values]);
  const [mode, setMode] = useModo();
  return (
    <div className={`calc${mode === 'simple' ? ' simple' : ''}`}>
      <div className="calc-top flex justify-end">
        <ModoSwitch P={P} mode={mode} setMode={setMode} id="v" />
      </div>
      <LegalNotice P={P} />
      <div className="layout readonly">
        <section className="summary">
          <Diagram P={P} I={a.ctx.I} N={a.ctx.N} res={a.res} />
          <Verdict id={id} P={P} X={X} a={a} badCount={0} resta={resta ? ti('argano_resta') : undefined} extra={extra} />
        </section>
        {resta ? null : <Results P={P} X={X} a={a} mode={mode} badCount={0} brand={brand} collaudo={collaudo} tipo={tipo} extra={extra} />}
      </div>
    </div>
  );
}
