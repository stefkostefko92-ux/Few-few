'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { PROVIDER } from '@/lib/provider';
import { betaInviteInfoAction } from '@/server/account-actions';
import RegisterForm from './RegisterForm';
import { clearLinkToken, useLinkToken } from './useLinkToken';

type Mode = 'invite' | 'open';

// The registration page in the browser. The token of a beta invitation's link travels in the address's fragment
// (useLinkToken), so no request and no log ever carries it: the page asks the server for the invitation's address (null:
// unknown, used, past its end) and the form takes it, fixed, with the token in a hidden field — registerAction checks
// both again. REGISTRATION_MODE=invite without a good invitation: how to ask for one; open: the form for everyone, a good
// invitation still fixing the address. Until the browser has read the address, the beta shows nothing and the open
// registration its form. The token stays in the address bar while the form is on screen, so a reload (or the tab
// restored) opens the invitation again; it goes once the form was sent.
export default function RegisterEntry({ mode, date, trialDays }: { mode: Mode; date: string; trialDays: number | null }) {
  const token = useLinkToken({ keep: true });
  // a fragment was there when the page opened, even one too short or mangled to be a token: the link is said not good
  const [given] = useState(() => typeof window !== 'undefined' && window.location.hash.length > 1);
  const [asked, setAsked] = useState<{ token: string; email: string | null } | null>(null);
  useEffect(() => {
    if (!token) return;
    let live = true;
    betaInviteInfoAction(token).then((email) => { if (live) setAsked({ token, email }); }, () => { if (live) setAsked({ token, email: null }); });
    return () => { live = false; };
  }, [token]);
  const answer = token && asked?.token === token ? asked : null;
  // a fragment that opens no invitation (malformed, unknown, used, past its end) is not worth keeping in the address
  const worthless = token === '' || (answer !== null && !answer.email);
  useEffect(() => { if (worthless) clearLinkToken(); }, [worthless]);
  const form = (invite: { token: string; email: string } | null) => (
    <RegisterForm key={invite?.token ?? ''} date={date} trialDays={trialDays} invite={invite} onSent={clearLinkToken} />
  );
  if (token === null) return mode === 'open' ? form(null) : null;
  if (token && !answer) return null;
  if (token && answer?.email) return form({ token, email: answer.email });
  return mode === 'open' ? form(null) : <InviteOnly bad={given || token !== ''} />;
}

/** During the beta by invitation, the page without a good invitation: how to ask for one, and the sign-in. */
function InviteOnly({ bad }: { bad: boolean }) {
  const t = useTranslations('register');
  return (
    <div className="panel" role="status">
      <h2>{t('inviteOnlyTitle')}</h2>
      {bad ? <p className="alert alert-warn">{t('inviteOnlyBadLink')}</p> : null}
      <p>{t('inviteOnlyText')}</p>
      <p>{t('inviteOnlyReopen')}</p>
      <p>{t('inviteOnlyAsk', { email: PROVIDER.email })}</p>
      <p className="note">{t('haveAccount')} <Link href="/login">{t('login')}</Link></p>
    </div>
  );
}
