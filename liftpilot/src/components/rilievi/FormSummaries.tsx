'use client';

// What the sheet's form shows over itself after an answer of the server (rilievi form.ejs, commit 988f3cf37): the summary
// of the errors, each line linking to its field (a cell of the measurements, a field of a supplier's module, the choices
// for the print included), and the data the sheet and the modules say differently, to confirm before the save. Each takes
// the focus when it answers (SchedaForm.tsx).
import type { FieldErrors } from '@/lib/rilievi/field-parsers';
import { errorAnchorOf, errorLabelOf, errorTextOf, type ModuloLookup } from '@/lib/rilievi/form-help';
import type { RilieviT } from '@/lib/rilievi/t';
import { DiffItem, type DiffLine } from './DiffItem';

export function ErrorSummary({ errors, lookup, t }: { errors: FieldErrors; lookup: ModuloLookup; t: RilieviT }) {
  const keysOf = Object.keys(errors);
  if (keysOf.length === 0) return null;
  return (
    <div className="rv-errors" role="alert" id="error-summary" tabIndex={-1}>
      <h2>{t('scheda.errorSummary', { n: keysOf.length })}</h2>
      <ul>
        {keysOf.map((key) => {
          const code = errors[key];
          return code ? <li key={key}><a href={errorAnchorOf(key)}>{errorLabelOf(key, t, lookup)}: {errorTextOf(key, code, t, lookup)}</a></li> : null;
        })}
      </ul>
    </div>
  );
}

/** The data the sheet and the modules say differently, to confirm before the save (rilievi #confirm-summary). */
export function ConfirmSummary({ list, t }: { list: readonly DiffLine[]; t: RilieviT }) {
  return (
    <div className="rv-diffnote rv-answer" role="alert" id="confirm-summary" tabIndex={-1}>
      <h2>{t('collegati.conferma.title', { n: list.length })}</h2>
      <p>{t('collegati.conferma.text')}</p>
      <ul>{list.map((d) => <DiffItem key={d.key} d={d} t={t} />)}</ul>
    </div>
  );
}
