'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { registerAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { TOKEN_TTL_MS } from '@/lib/token-shape';
import { TERMS_VERSION, legalValues } from '@/lib/legal';
import { CONSENTS, type Consent } from '@/lib/consents';

type Text = 'company' | 'vatNumber' | 'city' | 'name' | 'email';

// The typed values are kept by React (controlled), so an error does not empty the form; the passwords are typed again.
// The owner gives the four confirmations of src/lib/consents.ts for the company; `date` is the terms' day as the server
// writes it, `trialDays` the free trial when the subscription is on (null: no billing on this server, the free beta).
export default function RegisterForm({ date, trialDays }: { date: string; trialDays: number | null }) {
  const t = useTranslations('register'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(registerAction, initialFormState);
  const [v, setV] = useState<Record<Text, string>>({ company: '', vatNumber: '', city: '', name: '', email: '' });
  const [agreed, setAgreed] = useState<Record<Consent, boolean>>({ accept: false, business: false, drafts: false, clauses: false });
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  // a field with an error says so in words under it, not only with the red border, and points to the message on top
  const said = (f: string): string | undefined => (bad(f) ? `err-${f}${state.error ? ' register-error' : ''}` : undefined);
  const mark = (f: string) => (bad(f) ? <small id={`err-${f}`} className="field-error">{t('fieldError')}</small> : null);
  const values = { ...legalValues(), version: TERMS_VERSION, date };
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
        aria-describedby={said(name)} value={v[name]} onChange={(e) => setV({ ...v, [name]: e.target.value })} />
      {mark(name)}
    </label>
  );
  return (
    <form action={action} className="panel register-form" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p id="register-error" className="alert alert-bad" role="alert">{te(state.error, { min: PASSWORD_MIN_LENGTH })}</p> : null}
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
          <input className="input" type="password" name="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={200} required aria-invalid={bad('password')}
            aria-describedby={said('password')} />
          {mark('password')}
        </label>
        <label className="field">
          <span>{t('confirm')}</span>
          <input className="input" type="password" name="confirm" autoComplete="new-password" maxLength={200} required aria-invalid={bad('confirm')}
            aria-describedby={said('confirm')} />
          {mark('confirm')}
        </label>
        <p className="note">{t('rule', { min: PASSWORD_MIN_LENGTH })}</p>
      </fieldset>
      <p className="note">{trialDays !== null ? t('trial', { days: trialDays }) : t('beta', values)}</p>
      <p className="note">{t.rich('privacyNote', { link: (chunks) => <Link href="/privacy" target="_blank">{chunks}</Link> })}</p>
      {CONSENTS.map((k) => (
        <label key={k} className="check consent">
          <input type="checkbox" name={k} checked={agreed[k]} onChange={(e) => setAgreed({ ...agreed, [k]: e.target.checked })} aria-invalid={bad(k)}
            aria-describedby={said(k)} />
          <span>{k === 'accept'
            ? t.rich('accept', { ...values, link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> })
            : t(k, values)}{mark(k)}</span>
        </label>
      ))}
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('submitting') : t('submit')}</button></div>
      <p className="note">{t('haveAccount')} <Link href="/login">{t('login')}</Link></p>
    </form>
  );
}
