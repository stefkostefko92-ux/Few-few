'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { acceptTermsAction } from '@/server/terms-actions';
import { initialFormState } from '@/server/form';

// The terms' page of an owner who accepted an older version (or none): what changed is on the legal page; the same three
// confirmations as at the registration; then on to the application.
export default function TermsGate({ date }: { date: string }) {
  const t = useTranslations('legal'), tr = useTranslations('register'), te = useTranslations('errors'), locale = useLocale(), router = useRouter();
  const [state, action, pending] = useActionState(acceptTermsAction, initialFormState);
  const [agreed, setAgreed] = useState({ privacy: false, terms: false, clauses: false });
  useEffect(() => { if (state.ok) router.replace('/app'); }, [state.ok, router]);
  const box = (k: keyof typeof agreed, label: ReactNode) => (
    <label className="check consent">
      <input type="checkbox" name={k} checked={agreed[k]} onChange={(e) => setAgreed({ ...agreed, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <main className="page">
      <form action={action} className="panel flex flex-col gap-3" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <h1>{t('gateTitle')}</h1>
        <p>{t('gateLead', { date })}</p>
        {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
        {box('privacy', tr.rich('privacy', { link: (chunks) => <Link href="/privacy" target="_blank">{chunks}</Link> }))}
        {box('terms', tr('terms'))}
        {box('clauses', tr('clauses'))}
        <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('gateSubmit')}</button></div>
      </form>
    </main>
  );
}
