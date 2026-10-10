'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createCompanyAction } from '@/server/user-actions';
import { initialFormState } from '@/server/form';
import SecretOnce from './SecretOnce';

export default function CreateCompanyForm() {
  const t = useTranslations('admin'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(createCompanyAction, initialFormState);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <h2>{t('addTitle')}</h2>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {state.ok && state.secret ? <SecretOnce email={state.message} secret={state.secret} /> : null}
      <div className="form-grid">
        <label className="field span-2"><span>{t('company')} *</span><input className="input" name="name" maxLength={160} required /></label>
        <label className="field"><span>{t('vat')}</span><input className="input" name="vatNumber" maxLength={40} /></label>
        <label className="field"><span>{t('city')}</span><input className="input" name="city" maxLength={120} /></label>
        <label className="field"><span>{t('ownerName')} *</span><input className="input" name="ownerName" maxLength={120} required /></label>
        <label className="field"><span>{t('ownerEmail')} *</span><input className="input" type="email" name="ownerEmail" maxLength={254} required /></label>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('add')}</button></div>
    </form>
  );
}
