'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { createUserAction } from '@/server/user-actions';
import { initialFormState } from '@/server/form';
import SecretOnce from './SecretOnce';

export default function CreateUserForm({ roles }: { roles: Role[] }) {
  const t = useTranslations('team'), tr = useTranslations('roles'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(createUserAction, initialFormState);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <h2>{t('addTitle')}</h2>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {state.ok && state.secret ? <SecretOnce email={state.message} secret={state.secret} /> : null}
      <div className="form-grid">
        <label className="field"><span>{t('name')} *</span><input className="input" name="name" maxLength={120} required /></label>
        <label className="field"><span>{t('email')} *</span><input className="input" type="email" name="email" maxLength={254} required /></label>
        <label className="field"><span>{t('role')}</span>
          <select className="input" name="role" defaultValue="TECHNICIAN">{roles.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select>
        </label>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('add')}</button></div>
    </form>
  );
}
