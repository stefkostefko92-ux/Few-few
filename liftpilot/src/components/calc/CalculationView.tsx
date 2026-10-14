'use client';

// A saved calculation, shown with the same components as the calculator (read only): the browser recomputes
// the stored values with the same engine; the server has already checked that the stored hash is reproduced. One made
// from a shaft design (`design`) proposes on a direct pull only the sheave its plan hangs the falls from, as its
// relazione (lift/direct.ts).
import { useMemo, useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift';
import type { TipoIntervento } from '@/lib/lift/intervento';
import { analyse } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { asCalcDict } from './dict';
import Diagram from './Diagram';
import Verdict from './Verdict';
import Results from './Results';
import LegalNotice from './LegalNotice';

/** `id`: the anchor of its checks — the verdict that names those not passed and those with a warning (the result pill's
 *  panel leads there). `tipo`: the type declared with it (round 45), named by the copied summary; `resta`: a
 *  modernisation keeping the existing machine — verified as it is, with no proposal (as the calculator shows it). */
export default function CalculationView({ id, values, brand, collaudo, design = false, tipo = null, resta = false }: {
  id?: string; values: FormValues; brand: string; collaudo: Collaudo; design?: boolean; tipo?: TipoIntervento | null; resta?: boolean;
}) {
  const locale = useLocale(), messages = useMessages();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const a = useMemo(() => analyse(values, design), [values, design]);
  const [mode, setMode] = useState<'simple' | 'expert'>('simple');
  const { t } = P;
  return (
    <div className={`calc${mode === 'simple' ? ' simple' : ''}`}>
      <div className="flex justify-end">
        <div className="seg" role="radiogroup" aria-label={t('aria_mode')}>
          <input type="radio" name="mode" id="v-simple" checked={mode === 'simple'} onChange={() => setMode('simple')} />
          <label htmlFor="v-simple">{t('mode_simple')}</label>
          <input type="radio" name="mode" id="v-expert" checked={mode === 'expert'} onChange={() => setMode('expert')} />
          <label htmlFor="v-expert">{t('mode_expert')}</label>
        </div>
      </div>
      <LegalNotice P={P} />
      <div className="layout readonly">
        <section className="summary">
          <Diagram P={P} I={a.ctx.I} N={a.ctx.N} res={a.res} />
          <Verdict id={id} P={P} X={X} a={a} badCount={0} />
        </section>
        {resta ? null : <Results P={P} X={X} a={a} mode={mode} badCount={0} brand={brand} collaudo={collaudo} tipo={tipo} />}
      </div>
    </div>
  );
}
