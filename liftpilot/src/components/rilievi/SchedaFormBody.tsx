'use client';

// The sheet's form itself (rilievi form.ejs, commit 988f3cf37), drawn again by SchedaForm.tsx after each answer of the
// server: the sections in the company's order (section 1 «Impianto» first, laid out as the sheet's head and plate); a
// section with a condition («Argano» and «Limitatore» not with a hydraulic lift, «Centralina» only with it) hidden while it
// does not hold, the numbers counted by the CSS over the visible ones (rilievi-form.css), so a hidden one leaves no gap;
// each field by its kind, the conditional fields shown only while their condition holds, the measurements per stop under
// their «Sì», the suppliers' modules after their question and the fields that depend on it, before the section's notes
// (`moduliDopo`); at the end what goes into the print and the PDF (StampaScelta.tsx) and the save bar. How it opens is
// React's (the server's values); afterwards the page shows and hides (form-dom.ts), never React.
import { Fragment, memo, useCallback, useMemo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { CONFERMA_KEY, SCHEDA_KEY, type RilievoFormBack } from '@/lib/rilievi/action-state';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { activeParts, IDENTIFIERS_ERROR_KEY, SECTIONS, type Condition, type SectionDef, type SectionKey } from '@/lib/rilievi/fields';
import { colonneDi } from '@/lib/rilievi/form-help';
import { MAX_MISURE } from '@/lib/rilievi/misure';
import { AUTO_KEY } from '@/lib/rilievi/ordini/auto-key';
import type { CollegatiDati } from '@/lib/rilievi/ordini/collegati-browser';
import { moduliDopo } from '@/lib/rilievi/ordini/dopo';
import type { ModuloSpec } from '@/lib/rilievi/ordini/form';
import { misureRowsFor } from '@/lib/rilievi/prefill-client';
import type { RilieviT } from '@/lib/rilievi/t';
import type { DiffLine } from './DiffItem';
import FieldInputPlain, { Cond } from './FieldInput';
import MisureBlockPlain from './MisureBlock';
import ModuloBlockPlain from './ModuloBlock';
import StampaScelta from './StampaScelta';
import { useSchedaForm } from './use-scheda-form';
import { whenAttrs } from './when';

// the heavy parts are drawn again only when their own values change, not at every key typed elsewhere
const FieldInput = memo(FieldInputPlain);
const MisureBlock = memo(MisureBlockPlain);
const ModuloBlock = memo(ModuloBlockPlain);

/** The section of fields.ts by its key (the form's sections in the company's order). */
export const sectionOf = (key: SectionKey): SectionDef | undefined => (SECTIONS as readonly SectionDef[]).find((s) => s.key === key);

/** The measurements per stop open with «Sì» on their question. */
const misureWhen = (key: string): Condition => ({ field: key, values: ['si'] });

export interface BodyProps {
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

export default function FormBody({ specs, order, collegati, action, back, errors, edit, impronta, unsaved, cancelHref, pending, onSent }: BodyProps) {
  const t = useTranslations('rilievi'), locale = useLocale();
  const rt = t as unknown as RilieviT;
  const form = useRef<HTMLFormElement>(null);
  const etichetta = useCallback((campo: string, valore: string) => rt(`scheda.option.${campo}.${valore}`), [rt]);
  const { values } = back;
  const { snap, made, dirty, found } = useSchedaForm(form, values, onSent, collegati, etichetta, unsaved);
  // how the form opens; afterwards the page shows and hides (form-dom.ts), never React
  const parts = useMemo(() => activeParts((k) => values[k]), [values]);
  const active = parts.fields;
  const auto = useMemo(() => new Set(back.auto), [back.auto]);
  const scritti = useMemo(() => new Set(back.scritti), [back.scritti]);
  const colonne = useMemo(() => colonneDi(specs), [specs]);
  const diffs: readonly DiffLine[] = found ?? back.discrepanze;
  const on = (question: string): boolean => active.has(question) && values[question] === 'si';
  const wanted = misureRowsFor(typeof snap.fermate === 'string' ? snap.fermate : '', MAX_MISURE);
  const sections = order.map(sectionOf).filter((s) => s !== undefined);
  const modulo = (spec: ModuloSpec) => (
    <ModuloBlock key={spec.prefix} spec={spec} values={values} errors={errors} auto={auto} scritti={scritti} diffs={diffs} t={rt}
      marcaOn={!spec.marca || values[spec.marca.field] === spec.marca.value} modelloOn={!spec.modello || values[spec.modello.field] === spec.modello.value}
      on={on(spec.question)} />
  );
  return (
    <form ref={form} action={action} className="rv-form" noValidate data-scheda-form="">
      <input type="hidden" name="locale" value={locale} />
      {edit ? <input type="hidden" name={SCHEDA_KEY} value={edit.id} /> : null}
      {edit ? <input type="hidden" name="base" value={edit.base} /> : null}
      {/* the names still following, written on submit (use-scheda-form.ts); no value of React's, so that drawing the form
          again never resets it */}
      <input type="hidden" name={AUTO_KEY} />
      {sections.map((section) => {
        // the modules after their question and the fields that depend on it, in the registry's order
        const dopo = moduliDopo(section.fields);
        return (
          <fieldset key={section.key} className="rv-section" id={`s-${section.key}`} {...whenAttrs(section.when, !parts.sections.has(section.key))}>
            {/* the number: counted by the CSS over the visible sections */}
            <legend><span className="rv-secnum" aria-hidden="true" />{t(`scheda.section.${section.key}`)}</legend>
            {section.key === 'impianto'
              ? <p className={errors[IDENTIFIERS_ERROR_KEY] ? 'rv-hint bad' : 'rv-hint'} id="identifiers-hint">{t('scheda.identifiersHint')}</p>
              : null}
            {/* «Impianto» is laid out as the sheet's head and plate (rilievi .grid--testa) */}
            <div className={section.key === 'impianto' ? 'rv-grid testa' : 'rv-grid'}>
              {section.fields.map((field) => (
                <Fragment key={field.key}>
                  <Cond when={field.when} off={!active.has(field.key)}>
                    <FieldInput field={field} value={values[field.key]} error={errors[field.key]} auto={auto.has(field.key)} t={rt} />
                  </Cond>
                  {field.misure ? (
                    <Cond when={misureWhen(field.key)} off={!on(field.key)}>
                      <MisureBlock values={values} errors={errors} made={made} wanted={wanted} t={rt} />
                    </Cond>
                  ) : null}
                  {specs.filter((s) => dopo.get(field.key)?.includes(s.column)).map(modulo)}
                </Fragment>
              ))}
            </div>
          </fieldset>
        );
      })}
      <StampaScelta sections={sections} shown={parts.sections} colonne={colonne} values={values} errors={errors} t={rt} />
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
