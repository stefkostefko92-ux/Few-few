'use client';

// One field of a component of the RT after the owner's model (lib/rt2/types.ts CampoRt2): a number with its unit, a
// choice, a text or a yes/no, labelled as the model labels it with its «?», the software's proposal shown under an empty
// field, a value out of range marked; «esperto» rows hidden in «Semplice» (never when required and empty, or invalid).
import { useId } from 'react';
import Etichetta from '../aiuto/Etichetta';
import { fmt } from '@/lib/rt2/campi';
import type { CampoRt2 as Spec, ValoreRt2 } from '@/lib/rt2/types';
import { aiutoRt2 } from './aiuto';

export interface CampoProps {
  spec: Exclude<Spec, { t: 'gruppo' }>;
  chiave: string;
  value: ValoreRt2 | undefined;
  proposta: ValoreRt2 | undefined;
  set: (v: ValoreRt2 | undefined) => void;
  need: boolean;
  bad: boolean;
  readOnly: boolean;
}

const numero = (s: string): number | undefined => {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

function proposta(spec: CampoProps['spec'], v: ValoreRt2 | undefined): string | null {
  if (v === undefined) return null;
  if (spec.t === 'scelta') return spec.opzioni.find((o) => o.v === v)?.t ?? null;
  if (spec.t === 'si_no') return v ? 'si' : 'no';
  if (typeof v === 'number') return fmt(v, String(spec.t === 'num' ? spec.step : 1).split('.')[1]?.length ?? 0);
  return String(v);
}

export default function CampoRt2({ spec, chiave, value, proposta: prop, set, need, bad, readOnly }: CampoProps) {
  const id = useId(), hint = `${id}-h`, unit = spec.t === 'num' && spec.unit ? ` [${spec.unit}]` : '';
  const cls = ['field', need ? 'need' : '', spec.esperto ? 'esperto' : ''].filter(Boolean).join(' ');
  const shown = proposta(spec, prop), nota = value === undefined && shown !== null ? `Proposto: ${shown}` : null;
  const label = <Etichetta htmlFor={id} aiuto={aiutoRt2(chiave)} nome={spec.label}>{spec.label}{unit}</Etichetta>;
  const common = { id, disabled: readOnly, 'aria-invalid': bad || undefined, 'aria-describedby': nota || bad ? hint : undefined };
  let control;
  if (spec.t === 'num') {
    control = <input {...common} className="input num" type="number" inputMode="decimal" step={spec.step} min={spec.min} max={spec.max}
      value={typeof value === 'number' ? value : ''} placeholder={shown ?? undefined} onChange={(e) => set(numero(e.target.value))} />;
  } else if (spec.t === 'scelta') {
    control = (
      <select {...common} className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value || undefined)}>
        <option value="">{shown ? `— ${shown} —` : 'Scegli…'}</option>
        {spec.opzioni.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    );
  } else if (spec.t === 'si_no') {
    control = (
      <select {...common} className="input" value={value === true ? 'si' : value === false ? 'no' : ''} onChange={(e) => set(e.target.value === 'si' ? true : e.target.value === 'no' ? false : undefined)}>
        <option value="">{shown ? `— ${shown} —` : 'Scegli…'}</option><option value="si">si</option><option value="no">no</option>
      </select>
    );
  } else {
    control = <input {...common} className="input" type="text" maxLength={spec.max} value={typeof value === 'string' ? value : ''} placeholder={shown ?? undefined}
      onChange={(e) => set(e.target.value || undefined)} />;
  }
  return (
    <div className={cls}>
      {label}
      {control}
      {nota || bad ? <span id={hint} className={bad ? 'field-hint rt-bad' : 'field-hint'}>{bad ? 'Valore fuori dai limiti ammessi.' : nota}</span> : null}
    </div>
  );
}
