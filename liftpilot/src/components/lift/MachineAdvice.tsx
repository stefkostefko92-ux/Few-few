'use client';

// The advice live, under the one form and the replacement's calculator: once the inputs settle, every model of the
// advice's makers is verified a few at a time (each is a whole calculation: all at once would hold the screen), the
// last advice staying on screen, dimmed, until the new one is complete; direct pull finding no machine, the models are
// verified again with the diverting pulley in the machine room. The state lives here: the form does not render again.
import { useEffect, useState } from 'react';
import { ADVICE_MODELS, adviceOf, type AdviceModel, type MachineAdvice as Advice, type MachineCandidate } from '@/lib/lift/advice';
import AdviceView, { type AdviceViewProps } from './AdviceView';

export type Evaluate = (m: AdviceModel) => MachineCandidate | null;

interface Props extends Omit<AdviceViewProps, 'advice' | 'alt' | 'running'> {
  /** one model verified with the inputs as they stand: a new function when they change */
  evaluate: Evaluate;
  /** the same with the diverting pulley, and the sheave direct pull needs [mm]; null when the layout is not direct pull */
  alternative: { evaluate: Evaluate; sheave: number } | null;
}

/** How long the inputs stay still before the models are verified, and the longest slice of work between frames [ms]. */
const SETTLE_MS = 150, SLICE_MS = 12;

interface State {
  advice: Advice | null;
  alt: AdviceViewProps['alt'];
  running: { done: number; total: number } | null;
}

export default function MachineAdvice({ evaluate, alternative, ...view }: Props) {
  const total = ADVICE_MODELS.length;
  const [s, setS] = useState<State>({ advice: null, alt: null, running: { done: 0, total } });
  useEffect(() => {
    let live = true, timer = 0;
    // one pass over the models, a slice at a time; `then` gets the advice
    const pass = (ev: Evaluate, then: (a: Advice) => void): void => {
      const found: MachineCandidate[] = [];
      let k = 0;
      const step = (): void => {
        if (!live) return;
        const t0 = performance.now();
        while (k < total && performance.now() - t0 < SLICE_MS) {
          const m = ADVICE_MODELS[k++], c = m ? ev(m) : null;
          if (c) found.push(c);
        }
        if (k >= total) { then(adviceOf(found)); return; }
        const done = k;
        setS((p) => ({ ...p, running: { done, total } }));
        timer = window.setTimeout(step, 0);
      };
      step();
    };
    timer = window.setTimeout(() => {
      setS((p) => ({ ...p, running: { done: 0, total } }));
      pass(evaluate, (advice) => {
        if (advice.candidates.length || !alternative) { setS({ advice, alt: null, running: null }); return; }
        pass(alternative.evaluate, (a) => setS({ advice, alt: { advice: a, sheave: alternative.sheave }, running: null }));
      });
    }, SETTLE_MS);
    return () => { live = false; window.clearTimeout(timer); };
  }, [evaluate, alternative, total]);
  return <AdviceView advice={s.advice} alt={s.alt} running={s.running} {...view} />;
}
