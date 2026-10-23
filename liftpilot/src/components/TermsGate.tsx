'use client';

import { useActionState, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { acceptTermsAction } from '@/server/terms-actions';
import { initialFormState } from '@/server/form';
import { TERMS_VERSION, legalValues, type TermsState } from '@/lib/legal';
import { CONSENTS, type Consent } from '@/lib/consents';
import Icon from './Icon';
import { useErrorFocus } from './useErrorFocus';
import '@/app/account.css';

// The terms' page of the owner: the version in force to read, the four confirmations — the specific approval of the
// clauses signed with the current password, not a bare tick (src/server/terms-actions.ts) —, and
// what the company can do without accepting — before a new version binds it (`pending`, `binding` its day when
// announced) it works as before and may cancel at no cost; once it binds (`changed`) it works read-only, cancels and
// downloads its data; an owner who never accepted any version writes to us instead.
export default function TermsGate({ date, state: terms, binding }: { date: string; state: Exclude<TermsState, 'ok'>; binding: string | null }) {
  const t = useTranslations('legal'), tr = useTranslations('register'), te = useTranslations('errors'), locale = useLocale(), router = useRouter();
  const [state, action, pending] = useActionState(acceptTermsAction, initialFormState);
  // the ticks are uncontrolled, their default following them: React 19 resets the form after the action, and the reset
  // brings each one back to what the owner ticked (src/components/RegisterForm.tsx)
  const [agreed, setAgreed] = useState<Record<Consent, boolean>>({ accept: false, business: false, drafts: false, clauses: false });
  const { form, alert } = useErrorFocus(state);
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  useEffect(() => { if (state.ok) router.replace('/app'); }, [state.ok, router]);
  const values = { ...legalValues(), version: TERMS_VERSION, date, binding: binding ?? '' };
  const changed = terms !== 'never';
  const lead = terms === 'never' ? t('gateLeadNew', values) : terms === 'changed' ? t('gateLead', values)
    : binding ? t('gateLeadPending', values) : t('gateLeadAnnounced', values);
  return (
    <main className="page page-narrow terms-gate">
      <form ref={form} action={action} className="panel" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <div className="gate-head">
          <span className="icon-tile lg"><Icon name="file-check" size={26} /></span>
          <h1>{changed ? t('gateTitle') : t('gateTitleNew')}</h1>
        </div>
        <p className="lead">{lead}</p>
        <p><Link href="/privacy" target="_blank" className="btn btn-sm gate-read"><Icon name="file-text" size={18} />{t('gateRead')}</Link></p>
        {state.error ? <p id="terms-error" ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
        <p className="note">{tr.rich('privacyNote', { link: (chunks) => <Link href="/privacy" target="_blank">{chunks}</Link> })}</p>
        {CONSENTS.map((k) => (
          <label key={k} className="check consent">
            <input type="checkbox" name={k} defaultChecked={agreed[k]} onChange={(e) => setAgreed({ ...agreed, [k]: e.target.checked })} aria-invalid={bad(k)}
              aria-describedby={bad(k) ? 'terms-error' : undefined} />
            <span>{k === 'accept'
              ? tr.rich('accept', { ...values, link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> })
              // the owner acts for a company that exists already: the same declaration, not «registering»
              : k === 'business' ? t('gateBusiness') : tr(k, values)}</span>
          </label>
        ))}
        <label className="field">
          <span>{t('gatePassword')}</span>
          <input className="input" type="password" name="password" autoComplete="current-password" maxLength={200} required aria-invalid={bad('password')}
            aria-describedby={bad('password') ? 'terms-error gate-password-note' : 'gate-password-note'} />
          <small id="gate-password-note" className="note">{t('gatePasswordNote')}</small>
        </label>
        <div className="gate-actions"><button type="submit" className="btn btn-primary" disabled={pending}>{t('gateSubmit')}</button></div>
        {changed ? (
          <p className="note">
            {terms === 'pending' ? t('gateDeclinePending', values) : t('gateDecline')}{' '}
            <Link href="/app/billing">{t('gateBilling')}</Link> · <Link href="/app/company">{t('gateData')}</Link>
          </p>
        ) : <p className="note">{t('gateDeclineNew')}</p>}
      </form>
    </main>
  );
}
