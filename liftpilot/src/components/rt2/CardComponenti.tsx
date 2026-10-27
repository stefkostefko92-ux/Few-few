'use client';

// Step 3 of the RT after the owner's model, «Componenti»: the model's component buttons as a list — the ones the
// modification brings (the parts replaced in «Calcolo argano», the changes of the loads and of the speed) ticked and
// locked with their reasons, the others to add when the engineer verifies them too. Each one ticked has its card below.
import { useId } from 'react';
import Aiuto from '../aiuto/Aiuto';
import { COMPONENTI_RT2, type ComponenteRt2 } from '@/lib/rt2/types';
import type { MotivoRt2 } from '@/lib/rt2/generale';
import { TITOLI_RT2 } from '@/lib/rt2/titoli';
import { aiutoRt2 } from './aiuto';

export default function CardComponenti({ n, richiesti, aggiunti, disponibili, set, readOnly }: {
  n: number; richiesti: ReadonlyMap<ComponenteRt2, readonly MotivoRt2[]>; aggiunti: readonly ComponenteRt2[]; disponibili: ReadonlySet<ComponenteRt2>;
  set: (c: ComponenteRt2, on: boolean) => void; readOnly: boolean;
}) {
  const id = useId();
  return (
    <section className="panel rt-card" id="rt2-componenti" aria-labelledby="rt2-componenti-h">
      <h2 id="rt2-componenti-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">{n}</span>Componenti
        <Aiuto testo={aiutoRt2('componenti') ?? ''} nome="Componenti" /></h2>
      <ul className="rt2-comp">
        {COMPONENTI_RT2.filter((c) => disponibili.has(c)).map((c) => {
          const motivi = richiesti.get(c), on = !!motivi || aggiunti.includes(c);
          return (
            <li key={c}>
              <label htmlFor={`${id}-${c}`}>
                <input id={`${id}-${c}`} type="checkbox" checked={on} disabled={readOnly || !!motivi} onChange={(e) => set(c, e.target.checked)} />
                {TITOLI_RT2[c]}
              </label>
              {motivi ? <p className="note">{motivi.map((m) => m.testo).join('; ')}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
