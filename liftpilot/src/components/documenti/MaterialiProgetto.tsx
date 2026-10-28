'use client';

// The Panev bill of a saved lift design (round 53: on «Tavole e documenti», out of the Progetto and the overview), derived
// again in the browser from its form as entered, the brackets counted with the installation's pitches as sheet 1 does.
import { useMemo } from 'react';
import { deriveLift, type LiftInputs } from '@/lib/lift';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import PanevBom from '../shaft/PanevBom';

export default function MaterialiProgetto({ inputs, pitches, prices }: {
  inputs: LiftInputs; pitches?: BracketPitches; prices: Readonly<Record<string, number>> | null;
}) {
  const derived = useMemo(() => {
    const d = deriveLift(inputs);
    return { ...d, layout: withPitches(d.layout, pitches) };
  }, [inputs, pitches]);
  return <PanevBom L={derived.layout} prices={prices} C={derived.collaudo} framed={false} />;
}
