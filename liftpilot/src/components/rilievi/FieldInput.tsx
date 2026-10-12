'use client';

// One field of the sheet by its kind (rilievi _field.ejs, fields.ts): the inputs are uncontrolled (their values are the
// browser's until the form is sent, as in rilievi), their attributes those of rilievi — a date in 1950–2099, digits as
// text with a numeric keyboard, a whole number with a sign as type=number, decimals as text («6,5»), the unit inside the
// field. A field with a condition (`when`) sits in a wrapper the form hides while the condition does not hold.
import type { ReactNode } from 'react';
import type { FieldErrorCode } from '@/lib/rilievi/field-parsers';
import type { FieldDef } from '@/lib/rilievi/fields';
import { errorTextOf, unitTextOf } from '@/lib/rilievi/form-help';
import type { RilieviT } from '@/lib/rilievi/t';

/** A wrapper for what shows only under a condition (fields.ts `when`, the measurements, a module). */
export function Cond({ when, values, off, children }: { when?: string; values?: readonly string[]; off: boolean; children: ReactNode }) {
  if (!when) return <>{children}</>;
  return <div className="rv-cond" data-when={when} data-when-values={values?.join(' ')} data-off={off ? '' : undefined}>{children}</div>;
}

/** Sì/No and single choices can be cleared: a click on the ticked box unticks it (the form's behaviour, data-clearable). */
export function Tick({ type, name, value, checked, label, id, small, clearable, prefill }: {
  type: 'checkbox' | 'radio'; name: string; value: string; checked: boolean; label: string; id?: string; small?: boolean; clearable?: boolean; prefill?: string;
}) {
  return (
    <label className={small ? 'rv-tick sm' : 'rv-tick'}>
      <input type={type} id={id} name={name} value={value} defaultChecked={checked} data-clearable={clearable ? '' : undefined} data-prefill={prefill} />
      <span className="rv-box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export default function FieldInput({ field, value, error, t }: {
  field: FieldDef; value: string | string[] | undefined; error: FieldErrorCode | undefined; t: RilieviT;
}) {
  const id = `f-${field.key}`, errId = `err-${field.key}`, unitId = `u-${field.key}`;
  const label = t(field.question ? `scheda.question.${field.key}` : `scheda.field.${field.key}`);
  const errText = error ? errorTextOf(field.key, error, t) : null;
  const unit = unitTextOf(field.key, t);
  const list = Array.isArray(value) ? value : typeof value === 'string' && field.kind === 'checks' ? [value] : [];
  const text = typeof value === 'string' ? value : '';
  const errLine = errText ? <p className="rv-error" id={errId}>{errText}</p> : null;

  if (field.kind === 'checks' || field.kind === 'choice' || field.kind === 'yesno') {
    const options: readonly string[] = field.kind === 'checks' || field.kind === 'choice' ? field.options : ['si', 'no'];
    const optionLabel = (o: string): string => (field.kind === 'yesno' ? t(o === 'si' ? 'common.yes' : 'common.no') : t(`scheda.option.${field.key}.${o}`));
    const cls = `rv-choice${field.kind === 'yesno' ? ' compact' : ''}${field.wide ? ' rv-wide' : ''}`;
    return (
      <fieldset className={cls} id={id} aria-describedby={errText ? errId : undefined}>
        <legend>{label}</legend>
        <div className="rv-opts">
          {options.map((o) => (field.kind === 'checks'
            ? <Tick key={o} type="checkbox" name={field.key} value={o} checked={list.includes(o)} label={optionLabel(o)} />
            : <Tick key={o} type="radio" name={field.key} value={o} checked={text === o} label={optionLabel(o)} clearable />))}
        </div>
        {errLine}
      </fieldset>
    );
  }

  const describedBy = [unit ? unitId : null, errText ? errId : null].filter(Boolean).join(' ') || undefined;
  const common = { id, name: field.key, defaultValue: text, 'aria-describedby': describedBy, 'aria-invalid': errText ? true : undefined } as const;
  let input: ReactNode;
  if (field.kind === 'textarea') input = <textarea className="input" rows={4} maxLength={field.maxLength} {...common} />;
  else if (field.kind === 'date') input = <input className="input" type="date" required min="1950-01-01" max="2099-12-31" {...common} />;
  else if (field.kind === 'digits') input = <input className="input num" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={field.maxLength} autoComplete="off" {...common} />;
  else if (field.kind === 'int' && field.min < 0) input = <input className="input" type="number" step={1} min={field.min} max={field.max} autoComplete="off" {...common} />;
  else if (field.kind === 'int') input = <input className="input num" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={9} autoComplete="off" {...common} />;
  else if (field.kind === 'decimal') input = <input className="input num" type="text" inputMode="decimal" maxLength={10} autoComplete="off" {...common} />;
  else input = <input className="input" type="text" maxLength={field.kind === 'text' ? field.maxLength : undefined} autoComplete="off" {...common} />;

  return (
    <div className={field.wide ? 'rv-field rv-wide' : 'rv-field'}>
      <label className="rv-label" htmlFor={id}>{label}</label>
      {unit ? (
        <div className={unit.length > 3 ? 'rv-unit long' : 'rv-unit'}>
          {input}
          <span className="rv-unit-text" id={unitId}>{unit}</span>
        </div>
      ) : input}
      {errLine}
    </div>
  );
}
