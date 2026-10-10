'use client';

// A saved installation, read only: derived again from the form as it was entered (the same code as the server's),
// what the software worked out, the 3D simulation and every check with its replay.
import { useMemo, useRef, useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { deriveLift, type LiftInputs } from '@/lib/lift';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import { asCalcDict } from '../calc/dict';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';
import LiftSimulator, { type SimApi } from './LiftSimulator';
import PanevBom from '../shaft/PanevBom';

/** `prices`: the company's [cents by key] for whoever may see them; null: none shown. `pitches`: the bracket pitches of
 *  the installation's data, which the list and the 3D count with (as sheet 1). */
export default function LiftView({ inputs, prices, checks = true, pitches }: {
  inputs: LiftInputs; prices: Readonly<Record<string, number>> | null; checks?: boolean; pitches?: BracketPitches;
}) {
  const locale = useLocale(), messages = useMessages();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  // the page's data arrive as a new object on every server render (e.g. after an action on the page): the same content
  // keeps the same design, so nothing is derived again and the 3D world is not rebuilt
  const key = JSON.stringify([inputs, pitches ?? null]);
  const [held, setHeld] = useState({ key, inputs, pitches });
  if (held.key !== key) setHeld({ key, inputs, pitches });
  const derived = useMemo(() => {
    const d = deriveLift(held.inputs);
    return { ...d, layout: withPitches(d.layout, held.pitches) };
  }, [held]);
  const sim = useRef<SimApi>(null);
  return (
    <div className="lift-view">
      <LiftFacts derived={derived} X={X} fmt={P.fmt} />
      <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />
      {checks ? <LiftChecks derived={derived} X={X} fmt={P.fmt} onSimulate={(req) => sim.current?.play(req)} /> : null}
      <PanevBom L={derived.layout} prices={prices} C={derived.collaudo} />
    </div>
  );
}
