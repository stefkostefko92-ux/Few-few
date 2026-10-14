'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { verifyEmailAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { useLinkToken } from './useLinkToken';

// The link of the registration e-mail opens this form: the password chosen at registration confirms the account.
export default function VerifyEmailForm() {
  const t = useTranslations('verify'), te = useTranslations('errors'), locale = useLocale();
  const token = useLinkToken();
  const [state, action, pending] = useActionState(verifyEmailAction, initialFormState);
  if (token === null) return null;
  if (token === '') return <p className="alert alert-warn" role="alert">{t('noLink')} <Link href="/login">{t('toLogin')}</Link></p>;
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      <label className="field">
        <span>{t('password')}</span>
        <input className="input" type="password" name="password" autoComplete="current-password" maxLength={200} required />
      </label>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('submitting') : t('submit')}</button></div>
    </form>
  );
}
