'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { forgotPasswordAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { TOKEN_TTL_MS } from '@/lib/token-shape';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/accesso.json';
import Etichetta from './aiuto/Etichetta';

// The same answer whether the address has an account or not: the e-mail tells its owner.
export default function ForgotPasswordForm() {
  const t = useTranslations('forgot'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(forgotPasswordAction, initialFormState);
  const [email, setEmail] = useState('');
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {state.ok ? <p className="alert alert-ok" role="status">{t('sentText', { email: state.message ?? '', hours: TOKEN_TTL_MS.RESET_PASSWORD / 3600_000 })}</p> : null}
      <div className="field">
        <Etichetta htmlFor="forgot-email" aiuto={testoAiuto(AIUTO, 'forgot.email')} nome={t('email')}>{t('email')}</Etichetta>
        <input id="forgot-email" className="input" type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('submitting') : t('submit')}</button></div>
      <p className="note"><Link href="/login">{t('back')}</Link></p>
    </form>
  );
}
