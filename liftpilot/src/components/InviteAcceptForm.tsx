'use client';

import { useActionState, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { acceptInviteAction, inviteInfoAction } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useLinkToken } from './useLinkToken';

type Info = Awaited<ReturnType<typeof inviteInfoAction>>;

// The link of an invitation opens this form: which company invites, with which address and role (the e-mail names no
// company), and the password the colleague chooses; on success the server signs the colleague in.
export default function InviteAcceptForm() {
  const t = useTranslations('invite'), tr = useTranslations('register'), troles = useTranslations('roles'), te = useTranslations('errors'), locale = useLocale();
  const token = useLinkToken();
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [state, action, pending] = useActionState(acceptInviteAction, initialFormState);
  useEffect(() => {
    if (!token) return;
    let live = true;
    inviteInfoAction(token).then((i) => { if (live) setInfo(i); }, () => { if (live) setInfo(null); });
    return () => { live = false; };
  }, [token]);
  if (token === null || (token && info === undefined)) return null;
  if (token === '' || info === null) return <p className="alert alert-warn" role="alert">{t('noLink')}</p>;
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <p>{t('who', { company: info?.company ?? '', email: info?.email ?? '', role: info ? troles(info.role as 'ENGINEER' | 'SALES' | 'TECHNICIAN') : '' })}</p>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error, { min: PASSWORD_MIN_LENGTH })}</p> : null}
      <label className="field">
        <span>{t('next')}</span>
        <input className="input" type="password" name="next" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={200} required />
      </label>
      <label className="field">
        <span>{t('confirm')}</span>
        <input className="input" type="password" name="confirm" autoComplete="new-password" maxLength={200} required />
      </label>
      <p className="note">{t('rule', { min: PASSWORD_MIN_LENGTH })}</p>
      <p className="note">{tr.rich('privacyNote', { link: (chunks) => <Link href="/privacy" target="_blank">{chunks}</Link> })}</p>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('submitting') : t('submit')}</button></div>
    </form>
  );
}
