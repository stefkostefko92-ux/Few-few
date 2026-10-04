'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { resetPasswordAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useLinkToken } from './useLinkToken';

// The link of the e-mail opens this form; on success the server sends the person to the sign-in with a notice.
export default function ResetPasswordForm() {
  const t = useTranslations('reset'), te = useTranslations('errors'), locale = useLocale();
  const token = useLinkToken();
  const [state, action, pending] = useActionState(resetPasswordAction, initialFormState);
  if (token === null) return null;
  if (token === '') return <p className="alert alert-warn" role="alert">{t('noLink')} <Link href="/forgot-password">{t('again')}</Link></p>;
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p className="alert alert-bad" role="alert">
          {te(state.error, { min: PASSWORD_MIN_LENGTH })}
          {state.error === 'invalidLink' ? <> <Link href="/forgot-password">{t('again')}</Link></> : null}
        </p>
      ) : null}
      <label className="field">
        <span>{t('next')}</span>
        <input className="input" type="password" name="next" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={200} required />
      </label>
      <label className="field">
        <span>{t('confirm')}</span>
        <input className="input" type="password" name="confirm" autoComplete="new-password" maxLength={200} required />
      </label>
      <p className="note">{t('rule', { min: PASSWORD_MIN_LENGTH })}</p>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('submitting') : t('submit')}</button></div>
    </form>
  );
}
