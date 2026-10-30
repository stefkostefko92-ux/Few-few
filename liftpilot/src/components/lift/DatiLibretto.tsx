'use client';

// What the logbook (libretto) or a later verbale documents of the existing lift — the reference rated speed, under UNI
// 10411-1 the speed after the passage of the mains to 50 Hz, the travel at the first acceptance test (under -11 the
// documented one) — against the calculation's (round 46): a change past the rule brings the speed or the travel among
// the parts of the test (src/lib/lift/modifica.ts variazioneVelocita, variazioneCorsa), the line says it live, against
// the speed each change is measured from (an increase the reference, a decrease the logbook's speed). Typed as
// text; each value stored once it is a valid number (none: nothing stored), as CarichiDocumentati. The linked survey's
// value only as a reference beside the field («nel rilievo: …»), never filled in. Round 47: the live sentences are
// frasi-libretto.ts's, said again beside a «No» from the documents. Round 52: each with its «?» (messages/aiuto/
// calcolo.json: the rule of the speed and of the travel), a label of its own (shaft/Campo).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { testoAiuto } from '@/lib/aiuto';
import type { Collaudo } from '@/lib/lift';
import { corsaOf, velocitaOf, type Libretto } from '@/lib/lift/modifica';
import type { Pres } from '@/lib/present/tr';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { useValoreRilievo } from '../collega/origine';
import Campo from '../shaft/Campo';
import { fraseCorsa, fraseVelocita } from './frasi-libretto';

type LibKey = keyof Libretto;
/** The write schema's ranges (lift-input.ts libretto): speeds 0.1–10 m/s, travel 1–300 m. */
const RANGE: Readonly<Record<LibKey, [number, number]>> = { v: [0.1, 10], v50: [0.1, 10], H: [1, 300] };
const text = (l: Libretto | undefined): Record<LibKey, string> => ({ v: l?.v ? String(l.v) : '', v50: l?.v50 ? String(l.v50) : '', H: l?.H ? String(l.H) : '' });

interface Props {
  P: Pres;
  /** the test in force (its part of UNI 10411 and the logbook's values) */
  value: Collaudo;
  /** the calculation's values the design's speed and travel come from */
  calc?: FormValues;
  set(libretto: Libretto | undefined): void;
}

export default function DatiLibretto({ P, value, calc, set }: Props) {
  const t = useTranslations('lift');
  const [lib, setLib] = useState<Record<LibKey, string>>(() => text(value.libretto));
  const uno = value.norma === '10411-1', keys: readonly LibKey[] = uno ? ['v', 'v50', 'H'] : ['v', 'H'];
  const rilievo: Partial<Record<LibKey, string | undefined>> = { v: useValoreRilievo('v'), H: useValoreRilievo('H') };
  const aiuto: Readonly<Record<LibKey, string | null>> = { v: testoAiuto(AIUTO, 'lib_v'), v50: testoAiuto(AIUTO, 'lib_v50'), H: testoAiuto(AIUTO, 'lib_H') };
  const type = (k: LibKey, s: string): void => {
    const next = { ...lib, [k]: s };
    setLib(next);
    const out: Libretto = {};
    for (const x of keys) {
      const n = Number(next[x].replace(',', '.')), [lo, hi] = RANGE[x];
      if (next[x].trim() !== '' && Number.isFinite(n) && n >= lo && n <= hi) out[x] = n;
    }
    set(Object.keys(out).length ? out : undefined);
  };
  const norma = uno ? '10411-1' : value.norma === '10411-11' ? '10411-11' : null, L = value.libretto;
  const v = calc && norma && L ? velocitaOf(calc) : null, H = calc && norma && L?.H ? corsaOf(calc) : null;
  // the live sentences (frasi-libretto.ts, the same words beside a «No» from the documents in «Calcolo argano»)
  const fv = norma ? fraseVelocita(norma, L, v, P.fmt) : null, fh = norma ? fraseCorsa(norma, L, H, P.fmt) : null;
  return (
    <fieldset className="parti libretto" id="libretto">
      <legend>{t('lib_title')}</legend>
      <div className="form-grid">
        {keys.map((k) => (
          <Campo key={k} id={`lib-${k}`} nome={t(k === 'H' && !uno ? 'lib_H11' : `lib_${k}`)} aiuto={aiuto[k]}>
            {/* the survey's value, once part of the wrapping label's name, now its description */}
            <input id={`lib-${k}`} className="input num" type="number" inputMode="decimal" min={RANGE[k][0]} max={RANGE[k][1]} step="any" value={lib[k]} data-lib={k}
              aria-describedby={rilievo[k] ? `lib-${k}-rilievo` : undefined} onChange={(e) => type(k, e.target.value)} />
            {rilievo[k] ? <span className="note" id={`lib-${k}-rilievo`}>{t('lib_rilievo', { valore: `${rilievo[k]} ${k === 'H' ? 'm' : 'm/s'}` })}</span> : null}
          </Campo>
        ))}
      </div>
      {fv ? <p className={`note${fv.variata ? ' bad' : ''}`} role="status" data-var="velocita">{t(fv.key, fv.values)}</p> : null}
      {fh ? (
        <p className={`note${fh.variata ? ' bad' : ''}`} role="status" data-var="corsa">
          {t(fh.key, fh.values)}
          {fh.oltre8 ? <> {t('lib_H_8m')}</> : null}
        </p>
      ) : null}
      <p className="note">{t('lib_hint')}</p>
    </fieldset>
  );
}
