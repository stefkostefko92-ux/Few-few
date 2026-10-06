'use client';

import { useActionState, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { acceptTermsAction } from '@/server/terms-actions';
import { initialFormState } from '@/server/form';
import { TERMS_VERSION, legalValues, type TermsState } from '@/lib/legal';
import { CONSENTS, type Consent } from '@/lib/consents';

// The terms' page of the owner: the version in force to read, the same four confirmations as at the registration, and
// what the company can do without accepting — before a new version binds it (`pending`, `binding` its day when
// announced) it works as before and may cancel at no cost; once it binds (`changed`) it works read-only, cancels and
// downloads its data; an owner who never accepted any version writes to us instead.
export default function TermsGate({ date, state: terms, binding }: { date: string; state: Exclude<TermsState, 'ok'>; binding: string | null }) {
  const t = useTranslations('legal'), tr = useTranslations('register'), te = useTranslations('errors'), locale = useLocale(), router = useRouter();
  const [state, action, pending] = useActionState(acceptTermsAction, initialFormState);
  const [agreed, setAgreed] = useState<Record<Consent, boolean>>({ accept: false, business: false, drafts: false, clauses: false });
  useEffect(() => { if (state.ok) router.replace('/app'); }, [state.ok, router]);
  const values = { ...legalValues(), version: TERMS_VERSION, date, binding: binding ?? '' };
  const changed = terms !== 'never';
  const lead = terms === 'never' ? t('gateLeadNew', values) : terms === 'changed' ? t('gateLead', values)
    : binding ? t('gateLeadPending', values) : t('gateLeadAnnounced', values);
  return (
    <main className="page">
      <form action={action} className="panel flex flex-col gap-3" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <h1>{changed ? t('gateTitle') : t('gateTitleNew')}</h1>
        <p>{lead}</p>
        <p><Link href="/privacy" target="_blank">{t('gateRead')}</Link></p>
        {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
        <p className="note">{tr.rich('privacyNote', { link: (chunks) => <Link href="/privacy" target="_blank">{chunks}</Link> })}</p>
        {CONSENTS.map((k) => (
          <label key={k} className="check consent">
            <input type="checkbox" name={k} checked={agreed[k]} onChange={(e) => setAgreed({ ...agreed, [k]: e.target.checked })} />
            <span>{k === 'accept'
              ? tr.rich('accept', { ...values, link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> })
              : tr(k, values)}</span>
          </label>
        ))}
        <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('gateSubmit')}</button></div>
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
