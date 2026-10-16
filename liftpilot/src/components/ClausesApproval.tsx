'use client';

import { useActionState, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { approveClausesAction } from '@/server/terms-actions';
import { initialFormState } from '@/server/form';
import { legalValues } from '@/lib/legal';
import Icon from './Icon';
import { useErrorFocus } from './useErrorFocus';
import '@/app/account.css';

// The owner who accepted the version in force with a bare tick (before round 48) approves its clauses once more, alone:
// the tick and the current password, the simple electronic signature of the approval (src/server/terms-actions.ts
// approveClausesAction). Nothing is blocked meanwhile; the banner leads here. The tick is uncontrolled with its default
// following it, so the form's reset after an error shows it as the owner left it; the focus goes to what must be fixed.
export default function ClausesApproval() {
  const t = useTranslations('legal'), tv = useTranslations('verify'), tr = useTranslations('register'), te = useTranslations('errors');
  const locale = useLocale(), router = useRouter();
  const [state, action, pending] = useActionState(approveClausesAction, initialFormState);
  const [approved, setApproved] = useState(false);
  const { form, alert } = useErrorFocus(state);
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  useEffect(() => { if (state.ok) router.replace('/app'); }, [state.ok, router]);
  return (
    <main className="page page-narrow terms-gate">
      <form ref={form} action={action} className="panel" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <div className="gate-head">
          <span className="icon-tile lg"><Icon name="file-check" size={26} /></span>
          <h1>{tv('clausesTitle')}</h1>
        </div>
        <p className="lead">{t.rich('clausesAgainLead', { link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> })}</p>
        {state.error ? <p id="clauses-error" ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
        <label className="check consent">
          <input type="checkbox" name="clauses" defaultChecked={approved} onChange={(e) => setApproved(e.target.checked)} aria-invalid={bad('clauses')}
            aria-describedby={bad('clauses') ? 'clauses-error' : undefined} />
          <span>{tr('clauses', legalValues())}</span>
        </label>
        <label className="field">
          <span>{t('gatePassword')}</span>
          <input className="input" type="password" name="password" autoComplete="current-password" maxLength={200} required aria-invalid={bad('password')}
            aria-describedby={bad('password') ? 'clauses-error clauses-password-note' : 'clauses-password-note'} />
          <small id="clauses-password-note" className="note">{t('gatePasswordNote')}</small>
        </label>
        <div className="gate-actions"><button type="submit" className="btn btn-primary" disabled={pending}>{t('clausesAgainSubmit')}</button></div>
        <p className="note">{t('clausesAgainLater')} <Link href="/app">{t('clausesAgainBack')}</Link></p>
      </form>
    </main>
  );
}
