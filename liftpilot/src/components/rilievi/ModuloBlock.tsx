'use client';

// A supplier's module inside the sheet (rilievi _modulo.ejs, src/lib/rilievi/ordini/, commit 988f3cf37): the same fields in
// the same order as on the paper, so that it comes out in the supplier's own PDF. The labels are the paper's, verbatim
// (Italian, never translated). It opens with its make (and model — Mastech) and «Sì» on the question above it — a wrapper
// with a condition each: the panel has four modules (Pelazza, MoviLift, Mastech NG120 and QI Touch) under one question; a
// module without a make (the argano sheet, 2SG) opens with any make. `data-prefill` names what the survey fills in
// (prefill-client.ts); `data-scritto` marks a survey field the person emptied in a module already filled in — it stays
// empty; `data-auto` marks a field filled from the survey, from the sheet, from the other module or with the blank
// module's own value, which follows its source until the person types in it (collegati-client.ts); `data-predefinito`
// the blank module's own answer of a radio group. The hidden `<prefix>-_` mark is always sent: it tells the server the
// module was shown, so it is never prefilled again over what the person typed. A row with the paper's heading («Norme di
// riferimento») is a group for screen readers, the heading on its own line over the ticks it names. Under each group, the
// linked data that say something else elsewhere (in a live region always on the page: one shown only with its first
// difference is not read out by every screen reader). A row with the paper's arrow keeps what follows the arrow together
// behind it: on a narrow screen it wraps as one piece. The «?» (round 52): one next to the module's title (what the
// module is), one in each group's legend (what the group holds, what fills itself) — the paper's labels stay as they are.
import { testoAiuto } from '@/lib/aiuto';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { errorTextOf, type ModuloLookup } from '@/lib/rilievi/form-help';
import type { ModuloFieldSpec, ModuloSpec } from '@/lib/rilievi/ordini/form';
import type { RilieviT } from '@/lib/rilievi/t';
import AIUTO from '../../../messages/aiuto/rilievi.json';
import Aiuto from '../aiuto/Aiuto';
import { DiffItem, type DiffLine } from './DiffItem';
import { Tick } from './FieldInput';
import { legenda } from './legenda';

/** What a supplier's module is, next to its title (the same for every module). */
const AIUTO_MODULO = testoAiuto(AIUTO, 'modulo');

interface FieldProps {
  f: ModuloFieldSpec; spec: ModuloSpec; values: FormValues; errors: FieldErrors; auto: ReadonlySet<string>; scritti: ReadonlySet<string>; t: RilieviT;
}

function Field({ f, spec, values, errors, auto, scritti, t }: FieldProps) {
  const id = `f-${f.name}`, errId = `err-${f.name}`, value = values[f.name];
  const text = typeof value === 'string' ? value : '';
  const follows = auto.has(f.name);
  const prefill = f.prefill ?? undefined;
  // a survey field the person emptied: the survey does not fill it again
  const scritto = prefill !== undefined && scritti.has(f.name);
  if (f.kind === 'check') {
    return <Tick type="checkbox" id={id} name={f.name} value="si" checked={value === 'si'} label={f.label} small prefill={prefill} scritto={scritto} auto={follows} />;
  }
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
    id, name: f.name, defaultValue: text, 'data-prefill': prefill, 'data-scritto': scritto ? '' : undefined, 'data-auto': follows ? text : undefined,
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

export default function ModuloBlock({ spec, values, errors, auto, scritti, marcaOn, modelloOn, on, diffs, t }: {
  spec: ModuloSpec; values: FormValues; errors: FieldErrors;
  /** the names still following their source (the server's `auto`) */
  auto: ReadonlySet<string>;
  /** the survey's fields the person emptied (the server's `scritti`) */
  scritti: ReadonlySet<string>;
  /** how it opens: its make chosen (always, without a make), its model chosen (always, without one) and its question
   *  shown with «Sì» */
  marcaOn: boolean; modelloOn: boolean; on: boolean;
  /** the differences now (the page's, or the server's until the page has worked them out) */
  diffs: readonly DiffLine[];
  t: RilieviT;
}) {
  const box = (
    <div className="rv-modulo" id={`f-${spec.prefix}`} data-when={spec.question} data-when-values="si" data-off={on ? undefined : ''} data-modulo={spec.prefix}>
      <input type="hidden" name={spec.shownName} value="1" />
      <div className="rv-modulo-head">
        <div className="lbl">
          <p className="rv-modulo-title"><strong>{spec.titolo}</strong>{spec.fornitore ? ` · ${spec.fornitore}` : null}</p>
          {AIUTO_MODULO ? <Aiuto testo={AIUTO_MODULO} nome={spec.nome} /> : null}
        </div>
        <p className="rv-hint">{t('ordini.hint')}</p>
      </div>
      {spec.gruppi.map((g, gi) => {
        const lines = g.diff.map((key) => diffs.find((d) => d.key === key)).filter((d): d is DiffLine => d !== undefined);
        const nome = legenda(`nm-${spec.prefix}-${gi}`, g.titolo, testoAiuto(AIUTO, `gruppo.${spec.prefix}.${g.titolo}`));
        return (
          <fieldset key={gi} className="rv-mgroup" aria-labelledby={nome.labelledBy}>
            <legend>{nome.testo}</legend>
            {g.righe.map((r, ri) => {
              const field = (f: ModuloFieldSpec) => <Field key={f.name} f={f} spec={spec} values={values} errors={errors} auto={auto} scritti={scritti} t={t} />;
              const after = r.freccia ? r.campi.slice(r.freccia) : [];
              // the row's heading names its ticks: a group for screen readers (its id by the group's and the row's place)
              const rowId = `r-${spec.prefix}-${gi}-${ri}`;
              return (
                <div key={ri} className="rv-mrow" role={r.titolo ? 'group' : undefined} aria-labelledby={r.titolo ? rowId : undefined}>
                  {r.titolo ? <span className="rv-mrowtitle" id={rowId}>{r.titolo}</span> : null}
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
            {/* the live region is always there (empty, it takes no room), so that a list appearing in it is read out */}
            {g.diff.length ? (
              <div className="rv-mlive" aria-live="polite">
                {lines.length ? (
                  <div className="rv-mdiff">
                    <p className="rv-mdiff-title">{t('collegati.diversi')}</p>
                    <ul>{lines.map((d) => <DiffItem key={d.key} d={d} t={t} />)}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
  // the wrappers of the make and then of the model (Mastech): a module without a make is open with every make
  return (
    <div className="rv-mwrap rv-wide" data-when={spec.marca?.field} data-when-values={spec.marca?.value} data-off={spec.marca && !marcaOn ? '' : undefined}>
      {spec.modello ? (
        <div className="rv-mwrap-mod" data-when={spec.modello.field} data-when-values={spec.modello.value} data-off={modelloOn ? undefined : ''}>{box}</div>
      ) : box}
    </div>
  );
}
