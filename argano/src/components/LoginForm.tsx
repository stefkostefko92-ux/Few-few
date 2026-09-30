'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { loginAction } from '@/server/auth-actions';
import { initialFormState } from '@/server/form';

export default function LoginForm() {
  const t = useTranslations('auth'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      <label className="field">
        <span>{t('email')}</span>
        <input className="input" type="email" name="email" autoComplete="username" required maxLength={254} />
      </label>
      <label className="field">
        <span>{t('password')}</span>
        <input className="input" type="password" name="password" autoComplete="current-password" required maxLength={200} />
      </label>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('signingIn') : t('signIn')}</button></div>
      <p className="note">{t('noAccount')}</p>
    </form>
  );
}
