// A segmented choice of the shaft's form (radio buttons in a row); none chosen while the value is still to enter. With
// an explanation (round 52) the «?» follows the name in the legend; the group stays named by the name alone.
import { useId } from 'react';
import Aiuto from '../aiuto/Aiuto';

interface Props<T extends string> {
  name: string;
  /** null: still to choose */
  value: T | null;
  options: readonly { v: T; label: string }[];
  label: string;
  onChange(v: T): void;
  /** the first button's id (the missing list's link goes to it) */
  id?: string;
  need?: boolean;
  /** what the choice is for: the «?» beside its name */
  aiuto?: string | null;
}

export default function Seg<T extends string>({ name, value, options, label, onChange, id, need = false, aiuto = null }: Props<T>) {
  const nameId = useId();
  return (
    <fieldset className={`field${need ? ' need' : ''}`} aria-labelledby={aiuto ? nameId : undefined}>
      <legend>{aiuto ? <span className="lbl"><span id={nameId}>{label}</span><Aiuto testo={aiuto} nome={label} /></span> : label}</legend>
      <div className="seg-row" role="radiogroup" aria-label={label} aria-required={need || undefined}>
        {options.map((o, i) => (
          <label key={o.v} className={value === o.v ? 'on' : undefined}>
            <input id={i === 0 ? id : undefined} type="radio" name={name} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
