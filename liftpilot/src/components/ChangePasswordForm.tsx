'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { changePasswordAction } from '@/server/auth-actions';
import { initialFormState } from '@/server/form';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';

export default function ChangePasswordForm() {
  const t = useTranslations('account'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(changePasswordAction, initialFormState);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <h2>{t('passwordTitle')}</h2>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error, { min: PASSWORD_MIN_LENGTH })}</p> : null}
      {state.ok ? <p className="alert alert-ok" role="status">{t('passwordChanged')} <Link href="/app">{t('continue')}</Link></p> : null}
      <label className="field"><span>{t('current')}</span><input className="input" type="password" name="current" autoComplete="current-password" maxLength={200} required /></label>
      <label className="field"><span>{t('next')}</span><input className="input" type="password" name="next" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={200} required /></label>
      <label className="field"><span>{t('confirm')}</span><input className="input" type="password" name="confirm" autoComplete="new-password" maxLength={200} required /></label>
      <p className="note">{t('rule', { min: PASSWORD_MIN_LENGTH })}</p>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('change')}</button></div>
    </form>
  );
}
