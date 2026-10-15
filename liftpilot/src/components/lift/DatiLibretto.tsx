'use client';

// What the logbook (libretto) or a later verbale documents of the existing lift — the reference rated speed, under UNI
// 10411-1 the speed after the passage of the mains to 50 Hz, the travel at the first acceptance test (under -11 the
// documented one) — against the calculation's (round 46): a change past the rule brings the speed or the travel among
// the parts of the test (src/lib/lift/modifica.ts variazioneVelocita, variazioneCorsa), the line says it live. Typed as
// text; each value stored once it is a valid number (none: nothing stored), as CarichiDocumentati. The linked survey's
// value only as a reference beside the field («nel rilievo: …»), never filled in.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift';
import { corsaOf, variazioneCorsa, variazioneVelocita, velocitaOf, type Libretto } from '@/lib/lift/modifica';
import type { Pres } from '@/lib/present/tr';
import { useValoreRilievo } from '../collega/origine';

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
  const xv = norma && v !== null ? variazioneVelocita(norma, L, v) : null, xh = norma && H !== null ? variazioneCorsa(norma, L, H) : null;
  const pct = (x: number): string => `${x < 0 ? '−' : '+'}${P.fmt(Math.abs(x) * 100, 1)} %`, m = (x: number): string => `${x < 0 ? '−' : '+'}${P.fmt(Math.abs(x), 2)} m`;
  const clausolaV = !uno ? 'UNI 10411-11, 15' : xv?.aumento ? 'UNI 10411-1, 15.1' : 'UNI 10411-1, 15.16';
  return (
    <fieldset className="parti libretto" id="libretto">
      <legend>{t('lib_title')}</legend>
      <div className="form-grid">
        {keys.map((k) => (
          <label className="field" key={k}>
            <span>{t(k === 'H' && !uno ? 'lib_H11' : `lib_${k}`)}</span>
            <input className="input num" type="number" inputMode="decimal" min={RANGE[k][0]} max={RANGE[k][1]} step="any" value={lib[k]} data-lib={k}
              onChange={(e) => type(k, e.target.value)} />
            {rilievo[k] ? <span className="note">{t('lib_rilievo', { valore: `${rilievo[k]} ${k === 'H' ? 'm' : 'm/s'}` })}</span> : null}
          </label>
        ))}
      </div>
      {xv ? (
        <p className={`note${xv.variata ? ' bad' : ''}`} role="status" data-var="velocita">
          {xv.variata ? t('lib_v_variata', { dv: pct(xv.dv), rif: P.fmt(xv.rif, 2), clausola: clausolaV })
            : uno && Math.abs(xv.dv) > 0.0005 ? t('lib_v_entro', { dv: pct(xv.dv), rif: P.fmt(xv.rif, 2) }) : t('lib_v_uguale')}
        </p>
      ) : null}
      {xh && L?.H ? (
        <p className={`note${xh.variata ? ' bad' : ''}`} role="status" data-var="corsa">
          {xh.variata ? t('lib_H_variata', { dH: m(xh.dH), H: P.fmt(L.H, 2), clausola: uno ? 'UNI 10411-1, 16' : 'UNI 10411-11, 16' }) : t('lib_H_uguale')}
          {xh.oltre8 ? <> {t('lib_H_8m')}</> : null}
        </p>
      ) : null}
      <p className="note">{t('lib_hint')}</p>
    </fieldset>
  );
}
