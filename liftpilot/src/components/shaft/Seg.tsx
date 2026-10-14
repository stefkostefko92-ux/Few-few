// A segmented choice of the shaft's form (radio buttons in a row); none chosen while the value is still to enter.
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
}

export default function Seg<T extends string>({ name, value, options, label, onChange, id, need = false }: Props<T>) {
  return (
    <fieldset className={`field${need ? ' need' : ''}`}>
      <legend>{label}</legend>
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
