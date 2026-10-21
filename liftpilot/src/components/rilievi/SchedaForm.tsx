'use client';

// The survey sheet's form, new or edited (rilievi form.ejs, commit 988f3cf37): the form itself (SchedaFormBody.tsx — the
// sections in the company's order, a section with a condition hidden while it does not hold, the suppliers' modules after
// their question, the choices for the print and the PDF) with the index of its sections beside it (a hidden section
// hides there too); above it the refusal, the conflict (someone saved meanwhile: the input stays, the next «Salva»
// overwrites knowingly), the summary of the errors and the data the sheet and the modules say differently, to confirm
// («Salva comunque» comes after «Salva»: Enter in a field never confirms). Whichever of them answers gets the focus, which
// brings it into view wherever the person pressed «Salva» (rilievi answered with a new page, read from the top). The
// server decides (src/server/rilievi/actions.ts); after each answer the form is drawn again from the values it sent back
// (or, after a refusal, from what was sent), as rilievi drew the page again after a POST. A save that gets no answer (no
// signal in the shaft, keep-on-failure.ts) or meets an expired session is such a refusal too: the form stays with every
// value — the survey's fields the person emptied in the modules stay empty (`scrittiInviati`, as the server's `scritti`)
// —, «Modifiche non salvate» and the question before leaving stay on, and the next «Salva» sends it all again — with the
// same write key (one per form, made at its first «Salva»): if the first had reached the server and only its answer was
// lost, the server answers with the sheet that save made (or the version it wrote), never a second sheet or somebody
// else's change. The modules come as plain specs from the page (moduloSpec on the server), the links between the sheet and
// the modules as plain data (collegatiData): the maps with the PDFs' coordinates stay off the browser.
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { initialRilievoFormState, WRITE_KEY, type RilievoFormBack, type RilievoFormState } from '@/lib/rilievi/action-state';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { activeParts, type SectionKey } from '@/lib/rilievi/fields';
import { specLookup } from '@/lib/rilievi/form-help';
import { AUTO_KEY } from '@/lib/rilievi/ordini/auto-key';
import type { CollegatiDati } from '@/lib/rilievi/ordini/collegati-browser';
import type { ModuloSpec } from '@/lib/rilievi/ordini/form';
import { scrittiInviati, type SurveyContext } from '@/lib/rilievi/prefill-client';
import type { RilieviT } from '@/lib/rilievi/t';
import { createRilievoAction, updateRilievoAction } from '@/server/rilievi/actions';
import { useSetEditLead } from './EditLead';
import { ConfirmSummary, ErrorSummary } from './FormSummaries';
import RefusalText from './RefusalText';
import FormBody, { sectionOf } from './SchedaFormBody';
import SectionIndex from './SectionIndex';
import { newWriteKey, useGuardedAction, type NoAnswer } from '../keep-on-failure';

/** A refusal keeps the version the form stood on (`base`), so that the next «Salva» is not taken for a conflict. */
function keepBase(out: RilievoFormState, prev: RilievoFormState): RilievoFormState {
  return out.status === 'error' && out.base === undefined && 'base' in prev && prev.base !== undefined ? { ...out, base: prev.base } : out;
}

/** The save that got no answer: a refusal of the browser's own, the form as it was sent. */
const noAnswer = (why: NoAnswer): RilievoFormState => ({ status: 'error', error: why });

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
  // the survey's side of the modules (who writes, the words of the sheet's ticks) — for the form brought back after a refusal
  const survey = useMemo((): SurveyContext => ({ contesto: collegati.contesto, etichetta: (campo, valore) => rt(`scheda.option.${campo}.${valore}`) }), [collegati, rt]);
  // the form's write key: made at the first «Salva», then the same for every attempt while the form lives (a save that
  // goes through moves on to the sheet; every other answer of the server wrote nothing with it)
  const writeKey = useRef<string | null>(null);
  const stamp = useCallback((fd: FormData) => {
    writeKey.current ??= newWriteKey();
    fd.set(WRITE_KEY, writeKey.current);
  }, []);
  // the server action itself until hydration (the form works without JavaScript too), then the one kept from failing
  const save = useGuardedAction<RilievoFormState>(edit ? updateRilievoAction : createRilievoAction, noAnswer, keepBase, stamp);
  const [state, action, pending] = useActionState<RilievoFormState, FormData>(save, initialRilievoFormState);
  // what was sent last: after a refusal (too many, too large…) the form comes back with it, not empty
  const [sent, setSent] = useState<FormValues | null>(null);
  const onSent = useCallback((v: FormValues) => setSent(v), []);
  const back = useMemo((): RilievoFormBack => {
    if (state.status === 'invalid' || state.status === 'conflict' || state.status === 'confirm') return state;
    if (state.status === 'error' && sent) {
      const claimed = sent[AUTO_KEY];
      return { values: sent, auto: typeof claimed === 'string' ? claimed.split(' ').filter(Boolean) : [], scritti: scrittiInviati(specs, sent, survey), discrepanze: [] };
    }
    return initial;
  }, [state, sent, initial, specs, survey]);
  const errors: FieldErrors = state.status === 'invalid' ? state.errors : {};
  const base = state.status === 'invalid' || state.status === 'conflict' || state.status === 'confirm' ? state.base
    : state.status === 'error' && state.base !== undefined ? state.base : edit?.base ?? '';
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
  // the index: a section with a condition hides there too (form-dom.ts syncConditions resyncs it at every new form)
  const shown = useMemo(() => activeParts((k) => back.values[k]).sections, [back.values]);
  const titles = order.map((key) => ({ key, title: t(`scheda.section.${key}`), when: sectionOf(key)?.when, off: !shown.has(key) }));
  return (
    <>
      {state.status === 'error' ? <p className="alert alert-bad rv-answer" role="alert" tabIndex={-1} ref={refusal}><RefusalText code={state.error} form /></p> : null}
      {state.status === 'conflict' && edit ? (
        <div className="alert alert-warn rv-conflict rv-answer" role="alert" tabIndex={-1} ref={notice}>
          <p><strong>{t('schede.conflict.title')}</strong></p>
          <p>{t('schede.conflict.text')}</p>
          <p className="mt-2"><Link className="btn btn-sm" href={`/app/rilievi/${edit.id}`} target="_blank" rel="noopener">{t('schede.conflict.open')}</Link></p>
        </div>
      ) : null}
      <ErrorSummary errors={errors} lookup={lookup} t={rt} />
      {state.status === 'confirm' && state.discrepanze.length ? <ConfirmSummary list={state.discrepanze} t={rt} /> : null}
      {/* data-scheda-layout: where the form's conditions are (form-dom.ts) — the index is outside the form */}
      <div className="rv-with-index rv-form-layout" data-scheda-layout="">
        <SectionIndex label={t('scheda.index')} titles={titles} />
        <FormBody key={keyOf(state)} specs={specs} order={order} collegati={collegati} action={action} back={back} errors={errors}
          edit={edit ? { id: edit.id, base } : null} impronta={state.status === 'confirm' && state.discrepanze.length ? state.impronta : null}
          unsaved={state.status !== 'idle'} cancelHref={cancelHref} pending={pending} onSent={onSent} />
      </div>
    </>
  );
}
