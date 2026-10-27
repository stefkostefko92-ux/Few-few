'use client';

// «Segnala un problema»: the kind, the message, and — shown, not editable — the page it came from and the error's code
// (they travel as hidden fields and the server checks them again). The note on personal data sits above the button. A
// refusal (invalid, too many, an expired session) or a send that got no answer (no signal: keep-on-failure.ts) keeps
// what was typed and says why, with the focus on the message; once sent, the form gives way to the thanks, the way back
// to the page and «Invia un’altra segnalazione». The kind and the message have their «?» next to the label (round 52).
import { useActionState, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { FEEDBACK_KINDS, FEEDBACK_MAX, FEEDBACK_PER_HOUR, initialFeedbackState, type FeedbackState } from '@/lib/feedback';
import { sendFeedbackAction } from '@/server/feedback-actions';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/accesso.json';
import Etichetta from './aiuto/Etichetta';
import Icon from './Icon';
import { useGuardedAction, type NoAnswer } from './keep-on-failure';

/** A send that got no answer: what was typed stays (the form's fields, as sent). */
function noAnswer(why: NoAnswer, _prev: FeedbackState, fd: FormData): FeedbackState {
  const text = (k: string): string => { const v = fd.get(k); return typeof v === 'string' ? v : ''; };
  return { status: 'error', error: why, values: { kind: text('kind'), message: text('message') } };
}

/** A new key for each answer: the form is drawn anew with the values that answer carries (uncontrolled fields). */
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

export default function FeedbackForm({ page, digest, back }: {
  /** the page the report is about (path only, checked on the server), or null when opened from the menu */
  page: string | null;
  digest: string | null;
  /** the way back to that page, when it is one of the application's */
  back: string | null;
}) {
  const t = useTranslations('feedback'), locale = useLocale();
  const [answer, action, pending] = useActionState(useGuardedAction(sendFeedbackAction, noAnswer), initialFeedbackState);
  // «Invia un’altra segnalazione» puts the answer aside: the form comes back empty
  const [cleared, setCleared] = useState<FeedbackState | null>(null);
  const state = answer === cleared ? initialFeedbackState : answer;
  const alert = useRef<HTMLParagraphElement>(null), done = useRef<HTMLDivElement>(null), message = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.status === 'error') alert.current?.focus();
    else if (state.status === 'sent') done.current?.focus();
    else if (cleared) message.current?.focus();
  }, [state, cleared]);
  if (state.status === 'sent') {
    return (
      <div className="panel items-start" ref={done} tabIndex={-1} role="status">
        <h2 className="flex items-center gap-2"><Icon name="check-circle" size={20} />{t('sentTitle')}</h2>
        <p className="m-0">{t('sent')}</p>
        <p className="flex flex-wrap gap-3 m-0">
          {back ? <Link className="btn btn-primary" href={back}>{t('back')}</Link> : null}
          <button type="button" className="btn" onClick={() => setCleared(answer)}>{t('another')}</button>
        </p>
      </div>
    );
  }
  const err = state.status === 'error' ? state : null;
  const values = err?.values;
  const bad = (f: string): true | undefined => (err?.fields?.includes(f) ? true : undefined);
  const errorText = !err ? null
    : err.error === 'sessionExpired' ? t.rich('error.sessionExpired', { login: (c) => <a href={`/${locale}/login`} target="_blank" rel="noopener">{c}</a> })
    : err.error === 'rateLimited' ? t('error.rateLimited', { n: FEEDBACK_PER_HOUR })
    : err.error === 'invalid' && bad('message') ? t('error.message', { max: FEEDBACK_MAX })
    : err.error === 'invalid' && bad('kind') ? t('error.kind')
    : err.error === 'invalid' && bad('page') ? t('error.page')
    : t(`error.${err.error}`);
  return (
    <form key={keyOf(state)} action={action} className="panel flex flex-col gap-4" noValidate>
      {errorText ? <p className="alert alert-bad" role="alert" tabIndex={-1} ref={alert} id="feedback-error">{errorText}</p> : null}
      <input type="hidden" name="page" value={page ?? '/app/segnala'} />
      <input type="hidden" name="digest" value={digest ?? ''} />
      <dl className="feedback-meta">
        <div><dt>{t('page')}</dt><dd className="mono">{page ?? t('pageMenu')}</dd></div>
        {digest ? <div><dt>{t('code')}</dt><dd className="mono">{digest}</dd></div> : null}
      </dl>
      <div className="field">
        <Etichetta htmlFor="feedback-kind" aiuto={testoAiuto(AIUTO, 'feedback.kind')} nome={t('kind')}>{t('kind')} *</Etichetta>
        <select id="feedback-kind" className="input" name="kind" required
          defaultValue={values?.kind && (FEEDBACK_KINDS as readonly string[]).includes(values.kind) ? values.kind : 'BUG'} aria-invalid={bad('kind')}>
          {FEEDBACK_KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
        </select>
      </div>
      <div className="field">
        <Etichetta htmlFor="feedback-message" aiuto={testoAiuto(AIUTO, 'feedback.message')} nome={t('message')}>{t('message')} *</Etichetta>
        <textarea id="feedback-message" ref={message} className="input" name="message" rows={8} required maxLength={FEEDBACK_MAX} defaultValue={values?.message ?? ''}
          aria-invalid={bad('message')} aria-describedby={bad('message') ? 'feedback-error feedback-hint' : 'feedback-hint'} />
        <small className="hint" id="feedback-hint">{t('messageHint', { max: FEEDBACK_MAX })}</small>
      </div>
      <p className="note long m-0 flex items-start gap-2"><Icon name="shield-check" size={18} />{t('privacy')}</p>
      <div><button type="submit" className="btn btn-primary" disabled={pending}><Icon name="send" size={18} />{t('submit')}</button></div>
    </form>
  );
}
