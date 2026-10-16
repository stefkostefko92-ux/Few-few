'use client';

import { useActionState, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { verifyEmailAction, verifyInfoAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { legalValues } from '@/lib/legal';
import { useErrorFocus } from './useErrorFocus';
import { useLinkToken } from './useLinkToken';

type Info = Awaited<ReturnType<typeof verifyInfoAction>>;

// The link of the confirmation e-mail opens this form. The server says first what the link is: a waiting registration
// asks the specific approval of the clauses (arts. 1341–1342 c.c., the text of register.clauses) with the password
// chosen at the registration — the link proves the address, the password the person: together they sign it —; an
// account's link asks the password only. The tick is uncontrolled with its default following it, so the form's reset
// after an error shows it as the person left it; the focus goes to what must be fixed.
export default function VerifyEmailForm() {
  const t = useTranslations('verify'), tr = useTranslations('register'), te = useTranslations('errors'), locale = useLocale();
  const token = useLinkToken();
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [approved, setApproved] = useState(false);
  const [state, action, pending] = useActionState(verifyEmailAction, initialFormState);
  const { form, alert } = useErrorFocus(state);
  useEffect(() => {
    if (!token) return;
    let live = true;
    verifyInfoAction(token).then((i) => { if (live) setInfo(i); }, () => { if (live) setInfo('invalid'); });
    return () => { live = false; };
  }, [token]);
  if (token === null || (token && info === undefined)) return null;
  if (token === '') return <p className="alert alert-warn" role="alert">{t('noLink')} <Link href="/login">{t('toLogin')}</Link></p>;
  if (info === 'invalid' || info === 'limited') {
    return <p className="alert alert-bad" role="alert">{te(info === 'limited' ? 'rateLimited' : 'invalidLink')} <Link href="/login">{t('toLogin')}</Link></p>;
  }
  const registration = info === 'registration';
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  return (
    <form ref={form} action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {state.error ? <p id="verify-error" ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {registration ? (
        <>
          <h2>{t('clausesTitle')}</h2>
          <p className="note long">{t.rich('clausesLead', { link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> })}</p>
          <label className="check consent">
            <input type="checkbox" name="clauses" required defaultChecked={approved} onChange={(e) => setApproved(e.target.checked)} aria-invalid={bad('clauses')}
              aria-describedby={bad('clauses') ? 'verify-error' : undefined} />
            <span>{tr('clauses', legalValues())}</span>
          </label>
        </>
      ) : null}
      <label className="field">
        <span>{t('password')}</span>
        <input className="input" type="password" name="password" autoComplete="current-password" maxLength={200} required />
      </label>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? t('submitting') : registration ? t('submitClauses') : t('submit')}
        </button>
      </div>
    </form>
  );
}
