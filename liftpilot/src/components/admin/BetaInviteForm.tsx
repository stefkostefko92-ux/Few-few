'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createBetaInviteAction, resendBetaInviteAction } from '@/server/beta-invite-actions';
import { initialFormState, type FormState } from '@/server/form';
import SecretOnce from '../SecretOnce';
import { useErrorFocus } from '../useErrorFocus';

/** The link of an invitation, shown once after it was made or sent again; `pending`: no e-mail went (mail off). */
function LinkOnce({ state }: { state: FormState }) {
  const t = useTranslations('admin');
  if (!state.ok || !state.secret) return null;
  return <SecretOnce secret={state.secret} label={t('betaLink', { email: state.message ?? '' })} note={state.pending ? t('betaLinkNoMail') : t('betaLinkNote')} />;
}

// The platform administrator invites a tester to the beta: the address and the administrator's own note (never shown to
// the tester); the link goes by e-mail and appears here once.
export default function BetaInviteForm() {
  const t = useTranslations('admin'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(createBetaInviteAction, initialFormState);
  const { form, alert } = useErrorFocus(state);
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  return (
    <form ref={form} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p id="beta-error" ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      <LinkOnce state={state} />
      <div className="form-grid">
        <label className="field">
          <span>{t('betaEmail')} *</span>
          <input className="input" type="email" name="email" maxLength={254} required autoComplete="off" aria-invalid={bad('email')}
            aria-describedby={bad('email') ? 'beta-error' : undefined} />
        </label>
        <label className="field">
          <span>{t('betaNote')}</span>
          <input className="input" name="note" maxLength={200} aria-invalid={bad('note')} aria-describedby="beta-note-hint" />
          <small id="beta-note-hint" className="note">{t('betaNoteHint')}</small>
        </label>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('betaInvite')}</button></div>
    </form>
  );
}

/** «Invia di nuovo» of one invitation: a new link and a new month; the link shows once under the button. */
export function BetaInviteResend({ id, email }: { id: string; email: string }) {
  const t = useTranslations('admin'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(resendBetaInviteAction, initialFormState);
  return (
    <form action={action} className="cell-stack">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-sm" disabled={pending} aria-label={`${t('betaResend')} · ${email}`}>{t('betaResend')}</button>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      <LinkOnce state={state} />
    </form>
  );
}
