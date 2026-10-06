// One row of the calculator's form (prototype v12): a number with its unit, a choice or a check box, with its hint.
// Shared by the calculator and by the one form of an installation, which can show a row read-only with the value
// the software filled in and a badge saying so. A value still to enter shows nothing and is marked as needed (an expert
// row among them shows in the simple mode too); a standard value of the software carries a badge saying so.
import type { FormValues } from '@/calc/types';
import type { CalcKey, Pres } from '@/lib/present/tr';
import { shown, type Field } from './fields';

/** The words of an empty choice and of the standard values' badge. */
export interface BlankTexts {
  choose: string;
  std: string;
  stdTitle: string;
  /** the note of the simple mode on the expert rows still at their standard value */
  stdInUse?: (list: string) => string;
}

interface Props {
  P: Pres;
  f: Field;
  V: FormValues;
  bad: ReadonlySet<string>;
  set: (id: string, value: string | boolean) => void;
  /** a value filled in by the software: shown, not editable */
  auto?: { value: string; badge: string } | null;
  /** next to the label: e.g. the switch between automatic and entered */
  extra?: React.ReactNode;
  /** still to enter */
  need?: boolean;
  /** the software's standard value, as it set it: its badge */
  std?: boolean;
  texts?: BlankTexts;
}

export default function FieldRow({ P, f, V, bad, set, auto = null, extra = null, need = false, std = false, texts }: Props) {
  const { t } = P;
  const label = t((f.key ?? f.id) as CalcKey);
  const hidden = !shown(f.id, V), adv = f.adv && !need ? ' adv' : '', needCls = need ? ' need' : '';
  const badge = std && texts ? <span className="badge std" title={texts.stdTitle}>{texts.std}</span> : null;
  const hint = f.hint ? <div className={`hint${adv}`} hidden={hidden}>{t(f.hint)}</div> : null;
  if (f.kind === 'check') {
    return (
      <>
        <div className="row check" hidden={hidden}>
          <input type="checkbox" id={f.id} checked={!!V[f.id]} onChange={(e) => set(f.id, e.target.checked)} />
          <label htmlFor={f.id}>{label}{badge}</label>
        </div>
        {hint}
      </>
    );
  }
  if (f.kind === 'select') {
    const value = String(V[f.id] ?? '');
    return (
      <>
        <div className={`row${f.wide ? ' wide' : ''}${adv}${needCls}`} hidden={hidden}>
          <label htmlFor={f.id}>{label}{extra}{badge}</label>
          <select id={f.id} value={value} onChange={(e) => set(f.id, e.target.value)} disabled={!!auto} aria-required={need || undefined}>
            {value === '' ? <option value="" disabled>{texts?.choose ?? '—'}</option> : null}
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.literal ? o.label : t(o.label as CalcKey)}</option>)}
          </select>
          {f.wide ? null : <span />}
        </div>
        {hint}
      </>
    );
  }
  return (
    <>
      <div className={`row${adv}${auto ? ' auto' : ''}${needCls}`} hidden={hidden}>
        <label htmlFor={f.id}>{label}{extra}{badge}</label>
        {auto ? (
          <output id={f.id} className="num auto-value">{auto.value} <span className="badge">{auto.badge}</span></output>
        ) : (
          <input type="number" inputMode="decimal" id={f.id} step={f.step} value={String(V[f.id] ?? '')}
            onChange={(e) => set(f.id, e.target.value)} aria-invalid={bad.has(f.id) || undefined} aria-required={need || undefined} />
        )}
        <span className="unit">{f.unit}</span>
      </div>
      {hint}
    </>
  );
}
