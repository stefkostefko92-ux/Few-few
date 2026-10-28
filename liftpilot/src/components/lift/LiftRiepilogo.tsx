'use client';

// A saved lift design on its own page (round 53): what the software worked out in one strip and every check, the problems
// first, derived again from the form as entered; a check's «Simula» opens the Simulazione of this design on that check. The
// 3D is the Simulazione's page, the bill and the documents «Tavole e documenti».
import { useMemo } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { deriveLift, type LiftInputs } from '@/lib/lift';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import { asCalcDict } from '../calc/dict';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';

export default function LiftRiepilogo({ inputs, pitches, projectId, designId }: { inputs: LiftInputs; pitches?: BracketPitches; projectId: string; designId: string }) {
  const locale = useLocale(), messages = useMessages();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const derived = useMemo(() => {
    const d = deriveLift(inputs);
    return { ...d, layout: withPitches(d.layout, pitches) };
  }, [inputs, pitches]);
  return (
    <div className="lift-view">
      <LiftFacts derived={derived} X={X} fmt={P.fmt} />
      <LiftChecks derived={derived} X={X} fmt={P.fmt} simulaHref={(id) => `/app/projects/${projectId}/simulazione?design=${designId}&verifica=${id}`} />
    </div>
  );
}
