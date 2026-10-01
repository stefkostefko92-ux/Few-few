'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { registerAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { TOKEN_TTL_MS } from '@/lib/token-shape';

type Text = 'company' | 'vatNumber' | 'city' | 'name' | 'email';

// The typed values are kept by React (controlled), so an error does not empty the form; the passwords are typed again.
export default function RegisterForm() {
  const t = useTranslations('register'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(registerAction, initialFormState);
  const [v, setV] = useState<Record<Text, string>>({ company: '', vatNumber: '', city: '', name: '', email: '' });
  const [agreed, setAgreed] = useState({ privacy: false, terms: false });
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  if (state.ok) {
    return (
      <div className="panel" role="status">
        <h2>{t('sentTitle')}</h2>
        <p>{t('sentText', { email: state.message ?? '', hours: TOKEN_TTL_MS.VERIFY_EMAIL / 3600_000 })}</p>
      </div>
    );
  }
  const text = (name: Text, type: 'text' | 'email', autoComplete: string, max: number, required = true) => (
    <label className="field">
      <span>{t(name)}</span>
      <input className="input" type={type} name={name} autoComplete={autoComplete} maxLength={max} required={required} aria-invalid={bad(name)}
        value={v[name]} onChange={(e) => setV({ ...v, [name]: e.target.value })} />
    </label>
  );
  return (
    <form action={action} className="panel register-form" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error, { min: PASSWORD_MIN_LENGTH })}</p> : null}
      <fieldset>
        <legend>{t('companySection')}</legend>
        {text('company', 'text', 'organization', 160)}
        <div className="form-grid">
          {text('vatNumber', 'text', 'off', 40, false)}
          {text('city', 'text', 'address-level2', 120, false)}
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('ownerSection')}</legend>
        {text('name', 'text', 'name', 120)}
        {text('email', 'email', 'email', 254)}
        <label className="field">
          <span>{t('password')}</span>
          <input className="input" type="password" name="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={200} required aria-invalid={bad('password')} />
        </label>
        <label className="field">
          <span>{t('confirm')}</span>
          <input className="input" type="password" name="confirm" autoComplete="new-password" maxLength={200} required aria-invalid={bad('confirm')} />
        </label>
        <p className="note">{t('rule', { min: PASSWORD_MIN_LENGTH })}</p>
      </fieldset>
      <label className="check consent">
        <input type="checkbox" name="privacy" checked={agreed.privacy} onChange={(e) => setAgreed({ ...agreed, privacy: e.target.checked })} aria-invalid={bad('privacy')} />
        <span>{t.rich('privacy', { link: (chunks) => <Link href="/privacy" target="_blank">{chunks}</Link> })}</span>
      </label>
      <label className="check consent">
        <input type="checkbox" name="terms" checked={agreed.terms} onChange={(e) => setAgreed({ ...agreed, terms: e.target.checked })} aria-invalid={bad('terms')} />
        <span>{t('terms')}</span>
      </label>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('submitting') : t('submit')}</button></div>
      <p className="note">{t('haveAccount')} <Link href="/login">{t('login')}</Link></p>
    </form>
  );
}
