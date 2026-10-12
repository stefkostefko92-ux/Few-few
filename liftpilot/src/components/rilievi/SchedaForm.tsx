'use client';

// The survey sheet's form, new or edited (rilievi form.ejs): the sections of the paper form in their order, each field
// by its kind, the conditional fields shown only while their condition holds, the measurements per stop under their
// «Sì», the suppliers' modules under theirs; above it the refusal, the conflict (someone saved meanwhile: the input
// stays, the next «Salva» overwrites knowingly) and the summary of the errors. Whichever of them answers gets the focus,
// which brings it into view wherever the person pressed «Salva» (rilievi answered with a new page, read from the top).
// The server decides (src/server/rilievi/actions.ts); after each answer the form is drawn again from the values it
// sent back (or, after a refusal, from what was sent), as rilievi drew the page again after a POST. The modules come as
// plain specs from the page (moduloSpec on the server): their maps stay off the browser.
import { Fragment, memo, useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { initialRilievoFormState, type RilievoFormState } from '@/lib/rilievi/action-state';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { activeFields, IDENTIFIERS_ERROR_KEY, SECTIONS, type FieldDef } from '@/lib/rilievi/fields';
import { errorAnchorOf, errorLabelOf, errorTextOf, specLookup, type ModuloLookup } from '@/lib/rilievi/form-help';
import { MAX_MISURE } from '@/lib/rilievi/misure';
import type { ModuloSpec } from '@/lib/rilievi/ordini/form';
import { misureRowsFor } from '@/lib/rilievi/prefill-client';
import type { RilieviT } from '@/lib/rilievi/t';
import { createRilievoAction, updateRilievoAction } from '@/server/rilievi/actions';
import { useSetEditLead } from './EditLead';
import FieldInputPlain, { Cond } from './FieldInput';
import MisureBlockPlain from './MisureBlock';
import ModuloBlockPlain from './ModuloBlock';
import SectionIndex from './SectionIndex';
import { useSchedaForm } from './use-scheda-form';

// the heavy parts are drawn again only when their own values change, not at every key typed elsewhere
const FieldInput = memo(FieldInputPlain);
const MisureBlock = memo(MisureBlockPlain);
const ModuloBlock = memo(ModuloBlockPlain);

/** A new key for each answer of the server: the form is drawn anew with the values that answer carries. */
const keys = new WeakMap<object, number>();
let seq = 0;
function keyOf(state: object): number {
  let k = keys.get(state);
  if (k === undefined) {
    k = ++seq;
    keys.set(state, k);
  }
  return k;
}

interface BodyProps {
  specs: readonly ModuloSpec[];
  action: (fd: FormData) => void;
  values: FormValues;
  errors: FieldErrors;
  edit: { id: string; base: string } | null;
  cancelHref: string;
  pending: boolean;
  onSent: (values: FormValues) => void;
}

function FormBody({ specs, action, values, errors, edit, cancelHref, pending, onSent }: BodyProps) {
  const t = useTranslations('rilievi'), locale = useLocale();
  const rt = t as unknown as RilieviT;
  const form = useRef<HTMLFormElement>(null);
  const { snap, made, dirty } = useSchedaForm(form, values, onSent);
  const active = activeFields((k) => snap[k]);
  const on = (question: string): boolean => active.has(question) && snap[question] === 'si';
  const wanted = misureRowsFor(typeof snap.fermate === 'string' ? snap.fermate : '', MAX_MISURE);
  return (
    <form ref={form} action={action} className="rv-form" noValidate data-scheda-form="">
      <input type="hidden" name="locale" value={locale} />
      {edit ? <input type="hidden" name="id" value={edit.id} /> : null}
      {edit ? <input type="hidden" name="base" value={edit.base} /> : null}
      {SECTIONS.map((section, index) => (
        <fieldset key={section.key} className="rv-section" id={`s-${section.key}`}>
          <legend><span className="rv-secnum" aria-hidden="true">{index + 1}</span>{t(`scheda.section.${section.key}`)}</legend>
          {section.key === 'impianto'
            ? <p className={errors[IDENTIFIERS_ERROR_KEY] ? 'rv-hint bad' : 'rv-hint'} id="identifiers-hint">{t('scheda.identifiersHint')}</p>
            : null}
          <div className="rv-grid">
            {(section.fields as readonly FieldDef[]).map((field) => {
              const spec = field.modulo ? specs.find((s) => s.column === field.modulo) : undefined;
              return (
                <Fragment key={field.key}>
                  <Cond when={field.when?.field} values={field.when?.values} off={!active.has(field.key)}>
                    <FieldInput field={field} value={values[field.key]} error={errors[field.key]} t={rt} />
                  </Cond>
                  {field.misure ? (
                    <Cond when={field.key} values={['si']} off={!on(field.key)}>
                      <MisureBlock values={values} errors={errors} made={made} wanted={wanted} t={rt} />
                    </Cond>
                  ) : null}
                  {spec ? (
                    <Cond when={spec.question} values={['si']} off={!on(spec.question)}>
                      <ModuloBlock spec={spec} values={values} errors={errors} t={rt} />
                    </Cond>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="savebar">
        <div className="inner">
          <button type="submit" className="btn btn-primary" disabled={pending}>{t(edit ? 'schede.edit.submit' : 'schede.create.submit')}</button>
          <Link className="btn" href={cancelHref}>{t('common.cancel')}</Link>
          <span className="rv-dirty" hidden={!dirty}>{t('schede.unsaved')}</span>
        </div>
      </div>
    </form>
  );
}

function ErrorSummary({ errors, lookup, t }: { errors: FieldErrors; lookup: ModuloLookup; t: RilieviT }) {
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

export default function SchedaForm({ initial, edit, cancelHref, specs }: {
  /** the form's values at the opening (newFormValues / editFormValues on the server) */
  initial: FormValues;
  /** the sheet edited and the version it was opened on (its updatedAt), or null for a new sheet */
  edit: { id: string; base: string } | null;
  cancelHref: string;
  /** the suppliers' modules as the form renders them (moduloSpecs() on the server) */
  specs: readonly ModuloSpec[];
}) {
  const t = useTranslations('rilievi');
  const rt = t as unknown as RilieviT;
  const [state, action, pending] = useActionState<RilievoFormState, FormData>(edit ? updateRilievoAction : createRilievoAction, initialRilievoFormState);
  // what was sent last: after a refusal (too many, too large…) the form comes back with it, not empty
  const [sent, setSent] = useState<FormValues | null>(null);
  const onSent = useCallback((v: FormValues) => setSent(v), []);
  const answered = state.status === 'invalid' || state.status === 'conflict';
  const values = answered ? state.values : state.status === 'error' ? sent ?? initial : initial;
  const errors: FieldErrors = state.status === 'invalid' ? state.errors : {};
  const base = answered ? state.base : edit?.base ?? '';
  const lookup = useMemo(() => specLookup(specs), [specs]);
  const notice = useRef<HTMLDivElement>(null), refusal = useRef<HTMLParagraphElement>(null);
  const setLead = useSetEditLead();
  // the answer gets the focus (and so comes into view); a conflict also names the version that caused it in the head
  useEffect(() => {
    if (state.status === 'invalid') document.getElementById('error-summary')?.focus();
    else if (state.status === 'conflict') {
      setLead(state.updated);
      notice.current?.focus();
    } else if (state.status === 'error') refusal.current?.focus();
  }, [state, setLead]);
  const titles = SECTIONS.map((s) => ({ key: s.key, title: t(`scheda.section.${s.key}`) }));
  return (
    <>
      {state.status === 'error' ? <p className="alert alert-bad rv-answer" role="alert" tabIndex={-1} ref={refusal}>{t(`error.${state.error}`)}</p> : null}
      {state.status === 'conflict' && edit ? (
        <div className="alert alert-warn rv-conflict rv-answer" role="alert" tabIndex={-1} ref={notice}>
          <p><strong>{t('schede.conflict.title')}</strong></p>
          <p>{t('schede.conflict.text')}</p>
          <p className="mt-2"><Link className="btn btn-sm" href={`/app/rilievi/${edit.id}`} target="_blank" rel="noopener">{t('schede.conflict.open')}</Link></p>
        </div>
      ) : null}
      <ErrorSummary errors={errors} lookup={lookup} t={rt} />
      <div className="rv-with-index rv-form-layout">
        <SectionIndex label={t('scheda.index')} titles={titles} />
        <FormBody key={keyOf(state)} specs={specs} action={action} values={values} errors={errors} edit={edit ? { id: edit.id, base } : null}
          cancelHref={cancelHref} pending={pending} onSent={onSent} />
      </div>
    </>
  );
}
