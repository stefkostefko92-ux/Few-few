'use client';

// The Simulazione of an installation (round 53): the design derived again in the browser from its form (the saved one,
// or the Progetto's draft on its calculation — src/server/simulazione.ts), what the software worked out in one strip, the
// simulator over the page's width, and the checks it replays, each with its button. Opened from a check of the Progetto
// or of a saved design (?verifica=<check>), that check's run plays at once.
import { useEffect, useMemo, useRef } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { deriveLift, type LiftInputs } from '@/lib/lift';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import { mergeChecks } from '@/shaft';
import { asCalcDict } from '../calc/dict';
import LiftFacts from '../lift/LiftFacts';
import LiftChecks from '../lift/LiftChecks';
import LiftSimulator, { type SimApi } from '../lift/LiftSimulator';
import { scenarioForCheck } from '../lift/scenarios';

export default function SimulazioneVista({ inputs, pitches, verifica }: { inputs: LiftInputs; pitches?: BracketPitches; verifica: string | null }) {
  const locale = useLocale(), messages = useMessages();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const derived = useMemo(() => {
    const d = deriveLift(inputs);
    return { ...d, layout: withPitches(d.layout, pitches) };
  }, [inputs, pitches]);
  const sim = useRef<SimApi>(null), played = useRef(false);
  // the check this page was opened for: its run, once
  useEffect(() => {
    if (played.current || !verifica) return;
    played.current = true;
    // a check of this design by its id (an id the design does not have plays nothing)
    const ids = [...derived.analysis.res.checks, ...mergeChecks(derived.layout.checks, derived.supportChecks)].map((c) => c.id);
    const id = ids.find((x) => x === verifica), req = id ? scenarioForCheck(id, derived.analysis.res, derived.sim) : null;
    if (req) sim.current?.play(req);
  }, [verifica, derived]);
  return (
    <div className="lift-view sim-page">
      <LiftFacts derived={derived} X={X} fmt={P.fmt} />
      <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />
      <LiftChecks derived={derived} X={X} fmt={P.fmt} onSimulate={(req) => sim.current?.play(req)} solo="simulabili" />
    </div>
  );
}
