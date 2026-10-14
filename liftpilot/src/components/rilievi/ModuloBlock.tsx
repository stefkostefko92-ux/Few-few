'use client';

// A supplier's module inside the sheet (rilievi _modulo.ejs, src/lib/rilievi/ordini/, commit ae6329cb6): the same fields in
// the same order as on the paper, so that it comes out in the supplier's own PDF. The labels are the paper's, verbatim
// (Italian, never translated). It opens with its make and «Sì» on the question above it — two wrappers with a condition
// each: the panel has two modules (Pelazza, MoviLift) under one question; a module without a make (the argano sheet, 2SG)
// opens with any make. `data-prefill` names what the survey fills in (prefill-client.ts); `data-auto` marks a field
// filled from the survey, from the sheet, from the other module or with the blank module's own value, which follows its
// source until the person types in it (collegati-client.ts); `data-predefinito` the blank module's own answer of a
// radio group. The hidden `<prefix>-_` mark is always sent: it tells the server the module was shown, so it is never
// prefilled again over what the person typed. Under each group, the linked data that say something else elsewhere. A
// row with the paper's arrow keeps what follows the arrow together behind it: on a narrow screen it wraps as one piece.
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { errorTextOf, type ModuloLookup } from '@/lib/rilievi/form-help';
import type { ModuloFieldSpec, ModuloSpec } from '@/lib/rilievi/ordini/form';
import type { RilieviT } from '@/lib/rilievi/t';
import { DiffItem, type DiffLine } from './DiffItem';
import { Tick } from './FieldInput';

interface FieldProps { f: ModuloFieldSpec; spec: ModuloSpec; values: FormValues; errors: FieldErrors; auto: ReadonlySet<string>; t: RilieviT }

function Field({ f, spec, values, errors, auto, t }: FieldProps) {
  const id = `f-${f.name}`, errId = `err-${f.name}`, value = values[f.name];
  const text = typeof value === 'string' ? value : '';
  const follows = auto.has(f.name);
  const prefill = f.prefill ?? undefined;
  if (f.kind === 'check') return <Tick type="checkbox" id={id} name={f.name} value="si" checked={value === 'si'} label={f.label} small prefill={prefill} auto={follows} />;
  const error = errors[f.name];
  const lookup: ModuloLookup = () => ({ label: f.label, fornitore: spec.fornitore ?? spec.titolo, maxLength: f.maxLength });
  const errText = error ? errorTextOf(f.name, error, t, lookup) : null;
  const errLine = errText ? <p className="rv-error" id={errId}>{errText}</p> : null;
  if (f.kind === 'radio') {
    return (
      <fieldset className="rv-mradio" id={id} aria-describedby={errText ? errId : undefined}>
        <legend className={f.labelHidden ? 'sr-only' : 'rv-label'}>{f.label}</legend>
        <div className="rv-mopts">
          {(f.opzioni ?? []).map((o) => (
            <Tick key={o.valore} type="radio" name={f.name} value={o.valore} checked={text === o.valore} label={o.label} small clearable auto={follows}
              predefinito={f.predefinito === o.valore} />
          ))}
        </div>
        {errLine}
      </fieldset>
    );
  }
  const common = {
    id, name: f.name, defaultValue: text, 'data-prefill': prefill, 'data-auto': follows ? text : undefined,
    'aria-invalid': errText ? true : undefined, 'aria-describedby': errText ? errId : undefined,
  } as const;
  const short = f.kind === 'text' && f.maxLength !== null && f.maxLength <= 3;
  return (
    <div className={f.kind === 'textarea' ? 'rv-mtext wide' : short ? 'rv-mtext short' : 'rv-mtext'}>
      <label className={f.labelHidden ? 'rv-label sr-only' : 'rv-label'} htmlFor={id}>{f.label}</label>
      {f.kind === 'textarea' ? <textarea className="input" rows={3} maxLength={f.maxLength ?? undefined} {...common} />
        : f.kind === 'select' ? (
          <select className="input" {...common}>
            <option value="">—</option>
            {(f.opzioni ?? []).map((o) => <option key={o.valore} value={o.valore}>{o.label}</option>)}
          </select>
        ) : <input className="input" type="text" autoComplete="off" maxLength={f.maxLength ?? undefined} {...common} />}
      {errLine}
    </div>
  );
}

export default function ModuloBlock({ spec, values, errors, auto, marcaOn, on, diffs, t }: {
  spec: ModuloSpec; values: FormValues; errors: FieldErrors;
  /** the names still following their source (the server's `auto`) */
  auto: ReadonlySet<string>;
  /** how it opens: its make chosen (always, without a make) and its question shown with «Sì» */
  marcaOn: boolean; on: boolean;
  /** the differences now (the page's, or the server's until the page has worked them out) */
  diffs: readonly DiffLine[];
  t: RilieviT;
}) {
  const box = (
    <div className="rv-modulo" id={`f-${spec.prefix}`} data-when={spec.question} data-when-values="si" data-off={on ? undefined : ''} data-modulo={spec.prefix}>
      <input type="hidden" name={spec.shownName} value="1" />
      <div className="rv-modulo-head">
        <p className="rv-modulo-title"><strong>{spec.titolo}</strong>{spec.fornitore ? ` · ${spec.fornitore}` : null}</p>
        <p className="rv-hint">{t('ordini.hint')}</p>
      </div>
      {spec.gruppi.map((g, gi) => {
        const lines = g.diff.map((key) => diffs.find((d) => d.key === key)).filter((d): d is DiffLine => d !== undefined);
        return (
          <fieldset key={gi} className="rv-mgroup">
            <legend>{g.titolo}</legend>
            {g.righe.map((r, ri) => {
              const field = (f: ModuloFieldSpec) => <Field key={f.name} f={f} spec={spec} values={values} errors={errors} auto={auto} t={t} />;
              const after = r.freccia ? r.campi.slice(r.freccia) : [];
              return (
                <div key={ri} className="rv-mrow">
                  {(r.freccia ? r.campi.slice(0, r.freccia) : r.campi).map(field)}
                  {after.length ? (
                    <div className="rv-mfollow">
                      <span className="rv-arrow" aria-hidden="true">→</span>
                      <div className="rv-mfollow-items">{after.map(field)}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {g.diff.length ? (
              <div className="rv-mdiff" aria-live="polite" hidden={lines.length === 0}>
                <p className="rv-mdiff-title">{t('collegati.diversi')}</p>
                <ul>{lines.map((d) => <DiffItem key={d.key} d={d} t={t} />)}</ul>
              </div>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
  // the wrapper of the make: a module without one is open with every make
  return (
    <div className="rv-mwrap rv-wide" data-when={spec.marca?.field} data-when-values={spec.marca?.value} data-off={spec.marca && !marcaOn ? '' : undefined}>
      {box}
    </div>
  );
}
