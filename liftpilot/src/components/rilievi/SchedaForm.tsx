'use client';

// The survey sheet's form, new or edited (rilievi form.ejs, commit ae6329cb6): the sections in the company's order (section
// 1 «Impianto» first, laid out as the sheet's head and plate), each field by its kind, the conditional fields shown only
// while their condition holds, the measurements per stop under their «Sì», the suppliers' modules at the end of their
// question's section, the tick that puts the modules in the print; above it the refusal, the conflict (someone saved
// meanwhile: the input stays, the next «Salva» overwrites knowingly), the summary of the errors and the data the sheet
// and the modules say differently, to confirm («Salva comunque» comes after «Salva»: Enter in a field never confirms).
// Whichever of them answers gets the focus, which brings it into view wherever the person pressed «Salva» (rilievi
// answered with a new page, read from the top). The server decides (src/server/rilievi/actions.ts); after each answer
// the form is drawn again from the values it sent back (or, after a refusal, from what was sent), as rilievi drew the
// page again after a POST. The modules come as plain specs from the page (moduloSpec on the server), the links between
// the sheet and the modules as plain data (collegatiData): the maps with the PDFs' coordinates stay off the browser.
import { Fragment, memo, useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { CONFERMA_KEY, initialRilievoFormState, SCHEDA_KEY, type RilievoFormBack, type RilievoFormState } from '@/lib/rilievi/action-state';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { activeFields, IDENTIFIERS_ERROR_KEY, SECTIONS, type FieldDef, type SectionKey } from '@/lib/rilievi/fields';
import { errorAnchorOf, errorLabelOf, errorTextOf, RIEPILOGO_KEY, specLookup, type ModuloLookup } from '@/lib/rilievi/form-help';
import { MAX_MISURE } from '@/lib/rilievi/misure';
import { AUTO_KEY } from '@/lib/rilievi/ordini/auto-key';
import type { CollegatiDati } from '@/lib/rilievi/ordini/collegati-browser';
import type { ModuloSpec } from '@/lib/rilievi/ordini/form';
import { misureRowsFor } from '@/lib/rilievi/prefill-client';
import type { RilieviT } from '@/lib/rilievi/t';
import { createRilievoAction, updateRilievoAction } from '@/server/rilievi/actions';
import { useSetEditLead } from './EditLead';
import FieldInputPlain, { Cond } from './FieldInput';
import MisureBlockPlain from './MisureBlock';
import { DiffItem, type DiffLine } from './DiffItem';
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
  order: readonly SectionKey[];
  collegati: CollegatiDati;
  action: (fd: FormData) => void;
  back: RilievoFormBack;
  errors: FieldErrors;
  edit: { id: string; base: string } | null;
  /** the fingerprint of the differences to confirm («Salva comunque»), or null */
  impronta: string | null;
  /** the form came back without saving (a refusal, a conflict, the differences to confirm): it opens dirty */
  unsaved: boolean;
  cancelHref: string;
  pending: boolean;
  onSent: (values: FormValues) => void;
}

function FormBody({ specs, order, collegati, action, back, errors, edit, impronta, unsaved, cancelHref, pending, onSent }: BodyProps) {
  const t = useTranslations('rilievi'), locale = useLocale();
  const rt = t as unknown as RilieviT;
  const form = useRef<HTMLFormElement>(null);
  const etichetta = useCallback((campo: string, valore: string) => rt(`scheda.option.${campo}.${valore}`), [rt]);
  const { values } = back;
  const { snap, made, dirty, found } = useSchedaForm(form, values, onSent, collegati, etichetta, unsaved);
  // how the form opens; afterwards the page shows and hides (form-dom.ts), never React
  const active = useMemo(() => activeFields((k) => values[k]), [values]);
  const auto = useMemo(() => new Set(back.auto), [back.auto]);
  const diffs: readonly DiffLine[] = found ?? back.discrepanze;
  const on = (question: string): boolean => active.has(question) && values[question] === 'si';
  const wanted = misureRowsFor(typeof snap.fermate === 'string' ? snap.fermate : '', MAX_MISURE);
  const sections = order.map((key) => SECTIONS.find((s) => s.key === key)).filter((s) => s !== undefined);
  return (
    <form ref={form} action={action} className="rv-form" noValidate data-scheda-form="">
      <input type="hidden" name="locale" value={locale} />
      {edit ? <input type="hidden" name={SCHEDA_KEY} value={edit.id} /> : null}
      {edit ? <input type="hidden" name="base" value={edit.base} /> : null}
      {/* the names still following, written on submit (use-scheda-form.ts); no value of React's, so that drawing the form
          again never resets it */}
      <input type="hidden" name={AUTO_KEY} />
      {sections.map((section, index) => {
        const fields = section.fields as readonly FieldDef[];
        return (
          <fieldset key={section.key} className="rv-section" id={`s-${section.key}`}>
            <legend><span className="rv-secnum" aria-hidden="true">{index + 1}</span>{t(`scheda.section.${section.key}`)}</legend>
            {section.key === 'impianto'
              ? <p className={errors[IDENTIFIERS_ERROR_KEY] ? 'rv-hint bad' : 'rv-hint'} id="identifiers-hint">{t('scheda.identifiersHint')}</p>
              : null}
            {/* «Impianto» is laid out as the sheet's head and plate (rilievi .grid--testa) */}
            <div className={section.key === 'impianto' ? 'rv-grid testa' : 'rv-grid'}>
              {fields.map((field) => (
                <Fragment key={field.key}>
                  <Cond when={field.when?.field} values={field.when?.values} off={!active.has(field.key)}>
                    <FieldInput field={field} value={values[field.key]} error={errors[field.key]} auto={auto.has(field.key)} t={rt} />
                  </Cond>
                  {field.misure ? (
                    <Cond when={field.key} values={['si']} off={!on(field.key)}>
                      <MisureBlock values={values} errors={errors} made={made} wanted={wanted} t={rt} />
                    </Cond>
                  ) : null}
                </Fragment>
              ))}
              {/* the suppliers' modules at the end of their section, after their question's fields (the suspensions'
                  number) */}
              {fields.flatMap((field) => specs.filter((s) => s.column === field.modulo)).map((spec) => (
                <ModuloBlock key={spec.prefix} spec={spec} values={values} errors={errors} auto={auto} diffs={diffs} t={rt}
                  marcaOn={!spec.marca || values[spec.marca.field] === spec.marca.value} on={on(spec.question)} />
              ))}
            </div>
          </fieldset>
        );
      })}
      <fieldset className="rv-section" id="s-riepilogo">
        <legend>{t('riepilogo.title')}</legend>
        <div className="rv-grid">
          <div className="rv-field rv-wide">
            <label className="rv-tick">
              <input type="checkbox" id={`f-${RIEPILOGO_KEY}`} name={RIEPILOGO_KEY} value="1" aria-describedby="riepilogo-hint" defaultChecked={values[RIEPILOGO_KEY] === '1'} />
              <span className="rv-box" aria-hidden="true" />
              <span>{t('riepilogo.label')}</span>
            </label>
            <p className="rv-hint" id="riepilogo-hint">{t('riepilogo.hint')}</p>
          </div>
        </div>
      </fieldset>
      <div className="savebar">
        <div className="inner">
          <button type="submit" className="btn btn-primary" disabled={pending}>{t(edit ? 'schede.edit.submit' : 'schede.create.submit')}</button>
          {/* after «Salva»: Enter in a field presses the form's first button — never the confirmation */}
          {impronta ? <button type="submit" className="btn rv-confirm-btn" name={CONFERMA_KEY} value={impronta} disabled={pending}>{t('collegati.conferma.submit')}</button> : null}
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

/** The data the sheet and the modules say differently, to confirm before the save (rilievi #confirm-summary). */
function ConfirmSummary({ list, t }: { list: readonly DiffLine[]; t: RilieviT }) {
  return (
    <div className="rv-diffnote rv-answer" role="alert" id="confirm-summary" tabIndex={-1}>
      <h2>{t('collegati.conferma.title', { n: list.length })}</h2>
      <p>{t('collegati.conferma.text')}</p>
      <ul>{list.map((d) => <DiffItem key={d.key} d={d} t={t} />)}</ul>
    </div>
  );
}

export default function SchedaForm({ initial, edit, cancelHref, specs, order, collegati }: {
  /** the form at the opening (newForm / editForm on the server): its values, the names still following, the differences */
  initial: RilievoFormBack;
  /** the sheet edited and the version it was opened on (its updatedAt), or null for a new sheet */
  edit: { id: string; base: string } | null;
  cancelHref: string;
  /** the suppliers' modules as the form renders them (moduloSpecs() on the server) */
  specs: readonly ModuloSpec[];
  /** the sections in the company's order (formSections on the server) */
  order: readonly SectionKey[];
  /** the links between the sheet and the modules, and who writes (collegatiData on the server) */
  collegati: CollegatiDati;
}) {
  const t = useTranslations('rilievi');
  const rt = t as unknown as RilieviT;
  const [state, action, pending] = useActionState<RilievoFormState, FormData>(edit ? updateRilievoAction : createRilievoAction, initialRilievoFormState);
  // what was sent last: after a refusal (too many, too large…) the form comes back with it, not empty
  const [sent, setSent] = useState<FormValues | null>(null);
  const onSent = useCallback((v: FormValues) => setSent(v), []);
  const back = useMemo((): RilievoFormBack => {
    if (state.status === 'invalid' || state.status === 'conflict' || state.status === 'confirm') return state;
    if (state.status === 'error' && sent) {
      const claimed = sent[AUTO_KEY];
      return { values: sent, auto: typeof claimed === 'string' ? claimed.split(' ').filter(Boolean) : [], discrepanze: [] };
    }
    return initial;
  }, [state, sent, initial]);
  const errors: FieldErrors = state.status === 'invalid' ? state.errors : {};
  const base = state.status === 'invalid' || state.status === 'conflict' || state.status === 'confirm' ? state.base : edit?.base ?? '';
  const lookup = useMemo(() => specLookup(specs), [specs]);
  const notice = useRef<HTMLDivElement>(null), refusal = useRef<HTMLParagraphElement>(null);
  const setLead = useSetEditLead();
  // the answer gets the focus (and so comes into view); a conflict also names the version that caused it in the head
  useEffect(() => {
    if (state.status === 'invalid') document.getElementById('error-summary')?.focus();
    else if (state.status === 'confirm') document.getElementById('confirm-summary')?.focus();
    else if (state.status === 'conflict') {
      setLead(state.updated);
      notice.current?.focus();
    } else if (state.status === 'error') refusal.current?.focus();
  }, [state, setLead]);
  const titles = order.map((key) => ({ key, title: t(`scheda.section.${key}`) }));
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
      {state.status === 'confirm' && state.discrepanze.length ? <ConfirmSummary list={state.discrepanze} t={rt} /> : null}
      <div className="rv-with-index rv-form-layout">
        <SectionIndex label={t('scheda.index')} titles={titles} />
        <FormBody key={keyOf(state)} specs={specs} order={order} collegati={collegati} action={action} back={back} errors={errors}
          edit={edit ? { id: edit.id, base } : null} impronta={state.status === 'confirm' && state.discrepanze.length ? state.impronta : null}
          unsaved={state.status !== 'idle'} cancelHref={cancelHref} pending={pending} onSent={onSent} />
      </div>
    </>
  );
}
