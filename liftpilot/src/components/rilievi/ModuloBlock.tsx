'use client';

// A supplier's module inside the sheet (rilievi _modulo.ejs, src/lib/rilievi/ordini/): the same fields in the same order
// as on the paper, so that it comes out in the supplier's own PDF. The labels are the paper's, verbatim (Italian, never
// translated). It opens under its «Sì»; `data-prefill` names what the survey fills in when it opens (the form's
// behaviour, the same rules as the server's prefill). The hidden `<prefix>-_` mark is always sent: it tells the server
// the module was shown, so it is never prefilled again over what the person typed. A row with the paper's arrow keeps
// what follows the arrow together behind it: on a narrow screen it wraps as one piece, still inside its row.
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { errorTextOf, type ModuloLookup } from '@/lib/rilievi/form-help';
import type { ModuloFieldSpec, ModuloSpec } from '@/lib/rilievi/ordini/form';
import type { RilieviT } from '@/lib/rilievi/t';
import { Tick } from './FieldInput';

interface FieldProps { f: ModuloFieldSpec; spec: ModuloSpec; values: FormValues; errors: FieldErrors; t: RilieviT }

function Field({ f, spec, values, errors, t }: FieldProps) {
  const id = `f-${f.name}`, errId = `err-${f.name}`, value = values[f.name];
  if (f.kind === 'check') return <Tick type="checkbox" id={id} name={f.name} value="si" checked={value === 'si'} label={f.label} small prefill={f.prefill ?? undefined} />;
  const error = errors[f.name];
  const lookup: ModuloLookup = () => ({ label: f.label, fornitore: spec.fornitore ?? spec.titolo, maxLength: f.maxLength });
  const errText = error ? errorTextOf(f.name, error, t, lookup) : null;
  const common = {
    id, name: f.name, maxLength: f.maxLength ?? undefined, defaultValue: typeof value === 'string' ? value : '', 'data-prefill': f.prefill ?? undefined,
    'aria-invalid': errText ? true : undefined, 'aria-describedby': errText ? errId : undefined,
  } as const;
  return (
    <div className={f.kind === 'textarea' ? 'rv-mtext wide' : 'rv-mtext'}>
      <label className={f.labelHidden ? 'rv-label sr-only' : 'rv-label'} htmlFor={id}>{f.label}</label>
      {f.kind === 'textarea' ? <textarea className="input" rows={3} {...common} /> : <input className="input" type="text" autoComplete="off" {...common} />}
      {errText ? <p className="rv-error" id={errId}>{errText}</p> : null}
    </div>
  );
}

export default function ModuloBlock({ spec, values, errors, t }: { spec: ModuloSpec; values: FormValues; errors: FieldErrors; t: RilieviT }) {
  return (
    <div className="rv-modulo rv-wide" id={`f-${spec.prefix}`} data-modulo={spec.question}>
      <input type="hidden" name={spec.shownName} value="1" />
      <div className="rv-modulo-head">
        <p className="rv-modulo-title"><strong>{spec.titolo}</strong>{spec.fornitore ? ` · ${spec.fornitore}` : null}</p>
        <p className="rv-hint">{t('ordini.hint')}</p>
      </div>
      {spec.gruppi.map((g, gi) => (
        <fieldset key={gi} className="rv-mgroup">
          <legend>{g.titolo}</legend>
          {g.righe.map((r, ri) => {
            const field = (f: ModuloFieldSpec) => <Field key={f.name} f={f} spec={spec} values={values} errors={errors} t={t} />;
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
        </fieldset>
      ))}
    </div>
  );
}
