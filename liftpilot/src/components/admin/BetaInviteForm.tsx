'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createBetaInviteAction, resendBetaInviteAction, revokeBetaInviteAction } from '@/server/beta-invite-actions';
import { initialFormState, type FormState } from '@/server/form';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/admin.json';
import Etichetta from '../aiuto/Etichetta';
import SecretOnce from '../SecretOnce';
import { useErrorFocus } from '../useErrorFocus';

/** The link of an invitation, shown once after it was made or sent again (`resent`: the earlier link no longer works);
 *  `pending`: no e-mail went (mail off). */
function LinkOnce({ state, resent = false }: { state: FormState; resent?: boolean }) {
  const t = useTranslations('admin');
  if (!state.ok || !state.secret) return null;
  const note = `${state.pending ? t('betaLinkNoMail') : t('betaLinkNote')}${resent ? ` ${t('betaLinkResent')}` : ''}`;
  return <SecretOnce secret={state.secret} label={t('betaLink', { email: state.message ?? '' })} note={note} />;
}

// The platform administrator invites a tester to the beta — only whoever asked for it —: the address and the
// administrator's own note on the request (visible to the administrators only; personal data the tester may ask for);
// the link goes by e-mail and appears here once. Each field has its «?» next to its label (round 52), outside the label.
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
        <div className="field">
          <Etichetta htmlFor="beta-email" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.betaEmail')} nome={t('betaEmail')}>{t('betaEmail')} *</Etichetta>
          <input id="beta-email" className="input" type="email" name="email" maxLength={254} required autoComplete="off" aria-invalid={bad('email')}
            aria-describedby={bad('email') ? 'beta-error' : undefined} />
        </div>
        <div className="field">
          <Etichetta htmlFor="beta-note" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.betaNota')} nome={t('betaNote')}>{t('betaNote')}</Etichetta>
          <input id="beta-note" className="input" name="note" maxLength={200} aria-invalid={bad('note')} aria-describedby="beta-note-hint" />
          <small id="beta-note-hint" className="note">{t('betaNoteHint')}</small>
        </div>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('betaInvite')}</button></div>
    </form>
  );
}

/** «Revoca» of one invitation, in two steps on the page: the first click asks, the second revokes (the page then says
 *  «Invito revocato», src/components/admin/BetaInvites.tsx); «Annulla» goes back. */
export function BetaInviteRevoke({ id, email }: { id: string; email: string }) {
  const t = useTranslations('admin'), locale = useLocale();
  const [asking, setAsking] = useState(false);
  const confirm = useRef<HTMLButtonElement | null>(null), first = useRef<HTMLButtonElement | null>(null), asked = useRef(false);
  // the focus follows the step: on the confirmation when it appears, back on «Revoca» after «Annulla»
  useEffect(() => {
    if (asking) confirm.current?.focus();
    else if (asked.current) first.current?.focus();
    asked.current = asking;
  }, [asking]);
  if (!asking) {
    return <button ref={first} type="button" className="btn btn-sm btn-danger" onClick={() => setAsking(true)} aria-label={`${t('betaRevoke')} · ${email}`}>{t('betaRevoke')}</button>;
  }
  return (
    <form action={revokeBetaInviteAction} className="cell-stack beta-revoke">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <span className="note">{t('betaRevokeAsk')}</span>
      <div className="flex flex-wrap gap-2">
        <button ref={confirm} type="submit" className="btn btn-sm btn-danger" aria-label={`${t('betaRevokeConfirm')} · ${email}`}>{t('betaRevokeConfirm')}</button>
        <button type="button" className="btn btn-sm" onClick={() => setAsking(false)}>{t('betaRevokeCancel')}</button>
      </div>
    </form>
  );
}

/** «Invia di nuovo» of one invitation: a new link and a new month; the link shows once under the button. */
export function BetaInviteResend({ id, email }: { id: string; email: string }) {
  const t = useTranslations('admin'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(resendBetaInviteAction, initialFormState);
  return (
    <form action={action} className="cell-stack beta-resend">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-sm" disabled={pending} aria-label={`${t('betaResend')} · ${email}`}>{t('betaResend')}</button>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      <LinkOnce state={state} resent />
    </form>
  );
}
