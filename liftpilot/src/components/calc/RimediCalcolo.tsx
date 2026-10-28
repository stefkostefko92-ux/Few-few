'use client';

// The remedies of «Calcolo argano» (round 54): under the verdict, each check it counts — compute()'s and the extra ones of
// a changed ratio of the loads and of the rope sheet — with «Rimedi»: the values of the car, the counterweight, the new
// machine and its ropes that make it pass, tried on the whole calculation (lib/rimedi/calcolo.ts), and «Applica» as if
// typed in the form. The catalogue's machines are the advice's (named under the remedies when it is shown).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift';
import type { CalcKey, Pres } from '@/lib/present/tr';
import type { Texts } from '@/lib/present/texts';
import { CAMBIA_CARICHI, decimaliCalcolo, esitoCalc, rimediCalcolo } from '@/lib/rimedi/calcolo';
import RimediVerifica, { type FonteRimedi } from '../rimedi/RimediVerifica';
import { LAYOUT, MACHINE, PLANT, ROPES } from './fields';
import { Pill } from './ui';

const GOLE: Readonly<Record<string, CalcKey>> = { U: 'gr_U', UU: 'gr_UU', VH: 'gr_VH', VN: 'gr_VN' };
const UNITA: ReadonlyMap<string, string> = new Map([...PLANT, ...LAYOUT, ...MACHINE('n_'), ...ROPES('n_')].flatMap((f) => (f.kind === 'num' ? [[f.id, f.unit] as const] : [])));

export default function RimediCalcolo({ P, X, values, collaudo, resta, edit, fieldLabel, consiglio }: {
  P: Pres; X: Texts; values: FormValues; collaudo: Collaudo | null; resta: boolean;
  edit(patch: FormValues): void; fieldLabel(id: string): string; consiglio: boolean;
}) {
  const t = useTranslations('rimedi'), ts = useTranslations('shaft');
  const [aperto, setAperto] = useState<string | null>(null);
  // the form's callbacks change each render: the search starts again only when the values do
  const act = useRef({ edit, fieldLabel });
  useEffect(() => { act.current = { edit, fieldLabel }; });
  const esito = useMemo(() => esitoCalc(values, collaudo), [values, collaudo]), problemi = [...esito.esito.problemi];
  const fonte = useMemo((): FonteRimedi<FormValues> => {
    const c = { values, collaudo, resta };
    return {
      dove: () => 'qui',
      cerca: (id, o) => rimediCalcolo(c, id, (g) => (GOLE[g] ? P.t(GOLE[g]) : g), o),
      applica: (r) => act.current.edit({ [r.key]: r.inputs[r.key] ?? '' }),
      leva: (key) => act.current.fieldLabel(key),
      unita: (key) => UNITA.get(key) ?? '',
      decimali: decimaliCalcolo,
      nota: consiglio ? t('consiglio') : null,
      notaLeva: (r) => (CAMBIA_CARICHI.has(r.key) ? t('notaCarichi') : null),
    };
  }, [values, collaudo, resta, consiglio, P, t]);
  if (!problemi.length) return null;
  // compute()'s by their names, the extra ones by the shaft's (messages shaft c_<id>)
  const nome = (id: string): string => {
    const c = esito.checks.find((x) => x.id === id);
    return c ? X.checkLabel(c.id) : ts(`c_${id}`);
  };
  return (
    <section className="rimedi-calc" aria-labelledby="rimedi-calc-title">
      <h3 id="rimedi-calc-title" className="eyebrow">{t('calcTitolo')}</h3>
      <ul className="rimedi-calc-list">
        {problemi.map(([id, stato]) => (
          <li key={id} data-check={id}>
            <div className="rimedi-calc-riga">
              <Pill status={stato}>{X.st(stato)}</Pill>
              <span className="rimedi-calc-nome">{nome(id)}</span>
              <button type="button" className="btn btn-sm" aria-expanded={aperto === id} aria-controls={`rimedi-${id}`} onClick={() => setAperto(aperto === id ? null : id)}>{t('apri')}</button>
            </div>
            {aperto === id ? <div id={`rimedi-${id}`}><RimediVerifica id={id} fonte={fonte} nome={nome} fmt={P.fmt} onApplied={() => setAperto(null)} /></div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
