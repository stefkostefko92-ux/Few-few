'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { loginAction } from '@/server/auth-actions';
import { initialFormState } from '@/server/form';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/accesso.json';
import Etichetta from './aiuto/Etichetta';
import { useErrorFocus } from './useErrorFocus';

/** `reset`: the person comes from choosing a new password through the e-mail link. After a refusal the focus goes to the
 *  message, so it is read at once and the page does not stay scrolled elsewhere. Each field has its «?» next to its
 *  label (round 52), outside the label: the field is a box, the label names the input by its id. */
export default function LoginForm({ reset = false }: { reset?: boolean }) {
  const t = useTranslations('auth'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  const [email, setEmail] = useState('');
  const { form, alert } = useErrorFocus(state);
  return (
    <form ref={form} action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error)}</p> : reset ? <p className="alert alert-ok" role="status">{t('resetDone')}</p> : null}
      <div className="field">
        <Etichetta htmlFor="login-email" aiuto={testoAiuto(AIUTO, 'login.email')} nome={t('email')}>{t('email')}</Etichetta>
        <input id="login-email" className="input" type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <Etichetta htmlFor="login-password" aiuto={testoAiuto(AIUTO, 'login.password')} nome={t('password')}>{t('password')}</Etichetta>
        <input id="login-password" className="input" type="password" name="password" autoComplete="current-password" required maxLength={200} />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('signingIn') : t('signIn')}</button>
        <Link href="/forgot-password">{t('forgotLink')}</Link>
      </div>
      <p className="note">{t('noAccount')} <Link href="/register">{t('registerLink')}</Link></p>
    </form>
  );
}
