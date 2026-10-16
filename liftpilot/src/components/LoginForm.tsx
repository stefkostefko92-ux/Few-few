'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { loginAction } from '@/server/auth-actions';
import { initialFormState } from '@/server/form';
import { useErrorFocus } from './useErrorFocus';

/** `reset`: the person comes from choosing a new password through the e-mail link. After a refusal the focus goes to the
 *  message, so it is read at once and the page does not stay scrolled elsewhere. */
export default function LoginForm({ reset = false }: { reset?: boolean }) {
  const t = useTranslations('auth'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  const [email, setEmail] = useState('');
  const { form, alert } = useErrorFocus(state);
  return (
    <form ref={form} action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error)}</p> : reset ? <p className="alert alert-ok" role="status">{t('resetDone')}</p> : null}
      <label className="field">
        <span>{t('email')}</span>
        <input className="input" type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('password')}</span>
        <input className="input" type="password" name="password" autoComplete="current-password" required maxLength={200} />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('signingIn') : t('signIn')}</button>
        <Link href="/forgot-password">{t('forgotLink')}</Link>
      </div>
      <p className="note">{t('noAccount')} <Link href="/register">{t('registerLink')}</Link></p>
    </form>
  );
}
