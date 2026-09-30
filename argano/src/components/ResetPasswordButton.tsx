'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { resetUserPasswordAction } from '@/server/user-actions';
import { initialFormState } from '@/server/form';
import SecretOnce from './SecretOnce';

export default function ResetPasswordButton({ id }: { id: string }) {
  const t = useTranslations('team'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(resetUserPasswordAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-sm" disabled={pending}>{t('resetPassword')}</button>
      {state.error ? <span className="note bad">{te(state.error)}</span> : null}
      {state.ok && state.secret ? <SecretOnce email={state.message} secret={state.secret} /> : null}
    </form>
  );
}
