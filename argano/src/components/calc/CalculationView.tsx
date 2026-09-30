'use client';

// A saved calculation, shown with the same components as the calculator (read only): the browser recomputes
// the stored values with the same engine; the server has already checked that the stored hash is reproduced.
import { useMemo, useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { FormValues } from '@/calc/types';
import { analyse } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { asCalcDict } from './dict';
import Diagram from './Diagram';
import Verdict from './Verdict';
import Results from './Results';
import LegalNotice from './LegalNotice';

export default function CalculationView({ values, brand }: { values: FormValues; brand: string }) {
  const locale = useLocale(), messages = useMessages();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const a = useMemo(() => analyse(values), [values]);
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
          <Verdict P={P} X={X} a={a} badCount={0} />
        </section>
        <Results P={P} X={X} a={a} mode={mode} badCount={0} brand={brand} />
      </div>
    </div>
  );
}
