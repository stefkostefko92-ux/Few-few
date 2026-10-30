'use client';

// One field of the sheet by its kind (rilievi _field.ejs, fields.ts, commit 988f3cf37): the inputs are uncontrolled (their
// values are the browser's until the form is sent, as in rilievi), their attributes those of rilievi — a date in
// 1950–2099, digits as text with a numeric keyboard, a whole number with a sign as type=number, decimals as text («6,5»),
// the unit inside the field; Sì/No with words and an order of its own when the field has them («Accessi: 1 / 2»); ticks
// with one choice (`single` — «Tipo impianto», «Tipo porte») as radios a second click clears, the first of an old sheet's
// two choices ticked. A field filled from a module that still follows its source carries `data-auto` (the linked data,
// collegati-client.ts). A field with a condition (`when`, `not` too) sits in a wrapper the form hides while the condition
// does not hold. Each field has its «?» by its key (messages/aiuto/rilievi.json; round 52): next to the label, or inside
// the legend of a choice with the group named by its label alone (legenda.tsx).
import type { ReactNode } from 'react';
import { testoAiuto } from '@/lib/aiuto';
import type { FieldErrorCode } from '@/lib/rilievi/field-parsers';
import type { Condition } from '@/lib/rilievi/field-types';
import { isOptionsField, type FieldDef } from '@/lib/rilievi/fields';
import { errorTextOf, unitTextOf } from '@/lib/rilievi/form-help';
import type { RilieviT } from '@/lib/rilievi/t';
import AIUTO from '../../../messages/aiuto/rilievi.json';
import Etichetta from '../aiuto/Etichetta';
import { legenda } from './legenda';
import { whenAttrs, type WhenAttrs } from './when';

/** A wrapper for what shows only under a condition (fields.ts `when`, the measurements): `off` is how it opens; the form
 *  shows and hides it afterwards as the answers change (form-dom.ts syncConditions). */
export function Cond({ when, off, children }: { when?: Condition; off: boolean; children: ReactNode }) {
  if (!when) return <>{children}</>;
  return <div className="rv-cond" {...whenAttrs(when, off)}>{children}</div>;
}

/** Sì/No and single choices can be cleared: a click on the ticked box unticks it (the form's behaviour, data-clearable).
 *  `auto`: ticked by the linked data and still following (data-auto="si"); `predefinito`: the blank module's own answer;
 *  `scritto`: a survey tick the person unticked in a module already filled in — the survey never ticks it again; `cond`:
 *  the tick's own condition (a section's tick among those to print hides with the section). */
export function Tick({ type, name, value, checked, label, id, small, clearable, prefill, scritto, auto, predefinito, cond }: {
  type: 'checkbox' | 'radio'; name: string; value: string; checked: boolean; label: string; id?: string; small?: boolean; clearable?: boolean;
  prefill?: string; scritto?: boolean; auto?: boolean; predefinito?: boolean; cond?: WhenAttrs;
}) {
  return (
    <label className={small ? 'rv-tick sm' : 'rv-tick'} {...cond}>
      <input type={type} id={id} name={name} value={value} defaultChecked={checked} data-clearable={clearable ? '' : undefined} data-prefill={prefill}
        data-scritto={scritto ? '' : undefined} data-auto={auto && checked ? 'si' : undefined} data-predefinito={predefinito ? '' : undefined} />
      <span className="rv-box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export default function FieldInput({ field, value, error, auto, t }: {
  field: FieldDef; value: string | string[] | undefined; error: FieldErrorCode | undefined;
  /** filled from a module and still following it (the server's `auto`) */
  auto: boolean;
  t: RilieviT;
}) {
  const id = `f-${field.key}`, errId = `err-${field.key}`, unitId = `u-${field.key}`;
  const label = t(field.question ? `scheda.question.${field.key}` : `scheda.field.${field.key}`);
  const aiuto = testoAiuto(AIUTO, field.key);
  const errText = error ? errorTextOf(field.key, error, t) : null;
  const unit = unitTextOf(field.key, t);
  const list = Array.isArray(value) ? value : typeof value === 'string' && field.kind === 'checks' ? [value] : [];
  const text = typeof value === 'string' ? value : '';
  // one choice of the ticks: a radio, the first of an old sheet's two ticked
  const single = isOptionsField(field) && field.single === true;
  const picked = single ? (list[0] ?? '') : text;
  const errLine = errText ? <p className="rv-error" id={errId}>{errText}</p> : null;

  if (field.kind === 'checks' || field.kind === 'choice' || field.kind === 'yesno') {
    // Sì/No with words and an order of its own (`risposte`, «Accessi: 1 / 2»), otherwise Sì, No
    const risposte = 'risposte' in field ? field.risposte : undefined;
    const options: readonly string[] = isOptionsField(field) ? field.options : risposte ?? ['si', 'no'];
    // (format.ts rispostaLabel — not imported: it would bring the modules' maps into the browser)
    const optionLabel = (o: string): string =>
      field.kind === 'yesno' && !risposte ? t(o === 'si' ? 'common.yes' : 'common.no') : t(`scheda.option.${field.key}.${o}`);
    const cls = `rv-choice${field.kind === 'yesno' ? ' compact' : ''}${field.wide ? ' rv-wide' : ''}`;
    const nome = legenda(`nm-${field.key}`, label, aiuto);
    return (
      <fieldset className={cls} id={id} data-campo={field.key} aria-labelledby={nome.labelledBy} aria-describedby={errText ? errId : undefined}>
        <legend>{nome.testo}</legend>
        <div className="rv-opts">
          {options.map((o) => (field.kind === 'checks' && !single
            ? <Tick key={o} type="checkbox" name={field.key} value={o} checked={list.includes(o)} label={optionLabel(o)} auto={auto} />
            : <Tick key={o} type="radio" name={field.key} value={o} checked={picked === o} label={optionLabel(o)} clearable auto={auto} />))}
        </div>
        {errLine}
      </fieldset>
    );
  }

  const describedBy = [unit ? unitId : null, errText ? errId : null].filter(Boolean).join(' ') || undefined;
  const common = { id, name: field.key, defaultValue: text, 'aria-describedby': describedBy, 'aria-invalid': errText ? true : undefined } as const;
  // rilievi marks the one-line fields a module filled (digits, whole numbers without a sign, decimals, text)
  const follows = auto && text ? text : undefined;
  let input: ReactNode;
  if (field.kind === 'textarea') input = <textarea className="input" rows={4} maxLength={field.maxLength} {...common} />;
  else if (field.kind === 'date') input = <input className="input" type="date" required min="1950-01-01" max="2099-12-31" {...common} />;
  else if (field.kind === 'digits') input = <input className="input num" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={field.maxLength} autoComplete="off" data-auto={follows} {...common} />;
  else if (field.kind === 'int' && field.min < 0) input = <input className="input" type="number" step={1} min={field.min} max={field.max} autoComplete="off" {...common} />;
  else if (field.kind === 'int') input = <input className="input num" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={9} autoComplete="off" data-auto={follows} {...common} />;
  else if (field.kind === 'decimal') input = <input className="input num" type="text" inputMode="decimal" maxLength={10} autoComplete="off" data-auto={follows} {...common} />;
  else input = <input className="input" type="text" maxLength={field.kind === 'text' ? field.maxLength : undefined} autoComplete="off" data-auto={follows} {...common} />;

  return (
    <div className={field.wide ? 'rv-field rv-wide' : 'rv-field'} data-campo={field.key}>
      <Etichetta htmlFor={id} className="rv-label" aiuto={aiuto} nome={label}>{label}</Etichetta>
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
