'use client';

// The old push-button panels' measurements (rilievi _misure.ejs, _misura.ejs): with «Sì», a frame per stop with its six
// cells (`mb-<stop>-<column>`), as many as «Fermate». While «Fermate» is typed, the missing rows are added and the ones
// above the number hidden — never removed, so a slip on the number loses nothing (the server reads only 1..fermate).
// Without any stop yet, a hint says to give the stops first.
import { misureFormRows, type MisuraFormRow } from '@/lib/rilievi/misure';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { errorTextOf } from '@/lib/rilievi/form-help';
import type { RilieviT } from '@/lib/rilievi/t';
import { Tick } from './FieldInput';

function Row({ row, hidden, t }: { row: MisuraFormRow; hidden: boolean; t: RilieviT }) {
  return (
    <fieldset className="rv-misura" data-misura={row.n} hidden={hidden}>
      <legend>{t('scheda.misure.row', { n: row.n })}</legend>
      <div className="rv-misura-grid">
        {row.cells.map((cell) => {
          const col = cell.column, id = `f-${cell.name}`, errId = `err-${cell.name}`, unitId = `u-${cell.name}`;
          const label = t(`scheda.misure.col.${col.key}`);
          const errText = cell.error ? errorTextOf(cell.name, cell.error, t) : null;
          const errLine = errText ? <p className="rv-error" id={errId}>{errText}</p> : null;
          if (col.kind === 'yesno') {
            return (
              <fieldset key={col.key} className="rv-choice compact" id={id} aria-describedby={errText ? errId : undefined}>
                <legend>{label}</legend>
                <div className="rv-opts">
                  {(['si', 'no'] as const).map((o) => (
                    <Tick key={o} type="radio" name={cell.name} value={o} checked={cell.value === o} label={t(o === 'si' ? 'common.yes' : 'common.no')} clearable />
                  ))}
                </div>
                {errLine}
              </fieldset>
            );
          }
          const unit = 'unit' in col ? t(`scheda.unit.${col.unit}`, { n: 2 }) : null;
          const describedBy = [unit ? unitId : null, errText ? errId : null].filter(Boolean).join(' ') || undefined;
          const input = col.kind === 'decimal'
            ? <input className="input num" id={id} name={cell.name} type="text" inputMode="decimal" maxLength={10} autoComplete="off" defaultValue={cell.value}
                aria-describedby={describedBy} aria-invalid={errText ? true : undefined} />
            : <input className="input" id={id} name={cell.name} type="text" maxLength={col.maxLength} autoComplete="off" defaultValue={cell.value}
                aria-describedby={describedBy} aria-invalid={errText ? true : undefined} />;
          return (
            <div key={col.key} className="rv-field">
              <label className="rv-label" htmlFor={id}>{label}</label>
              {unit ? <div className="rv-unit">{input}<span className="rv-unit-text" id={unitId}>{unit}</span></div> : input}
              {errLine}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** `made`: the rows made so far (never fewer than at the opening); `wanted`: the stops typed now (0 = none valid). */
export default function MisureBlock({ values, errors, made, wanted, t }: {
  values: FormValues; errors: FieldErrors; made: number; wanted: number; t: RilieviT;
}) {
  const rows = misureFormRows({ ...values, fermate: String(made) }, errors);
  return (
    <div className="rv-misure rv-wide" id="f-misure" data-misure="">
      <p className="rv-hint" hidden={wanted > 0}>{t('scheda.misure.needFermate')}</p>
      <div className="rv-misure-rows">
        {rows.map((row) => <Row key={row.n} row={row} hidden={Number(row.n) > wanted} t={t} />)}
      </div>
    </div>
  );
}
