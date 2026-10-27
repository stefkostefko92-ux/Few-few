'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { verifyEmailAction, verifyInfoAction, type VerifyInfo } from '@/server/account-actions';
import { initialFormState } from '@/server/form';
import { TERMS_VERSION, legalValues } from '@/lib/legal';
import { PROVIDER } from '@/lib/provider';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/accesso.json';
import Aiuto from './aiuto/Aiuto';
import Etichetta from './aiuto/Etichetta';
import { useErrorFocus } from './useErrorFocus';
import { useLinkToken } from './useLinkToken';

// the boxes' «?» (round 52): a short name, the box's own text being the whole declaration
const AIUTO_SPUNTE = {
  accept: { testo: testoAiuto(AIUTO, 'consenso.accept'), nome: testoAiuto(AIUTO, 'nome.accept') ?? '' },
  clauses: { testo: testoAiuto(AIUTO, 'consenso.clauses'), nome: testoAiuto(AIUTO, 'nome.clauses') ?? '' },
} as const;

// The link of the confirmation e-mail opens this form. The server says first what the link is: a waiting registration
// asks the specific approval of the clauses (arts. 1341–1342 c.c., the text of register.clauses) with the password
// chosen at the registration — the link proves the address, the password the person: together they sign it —; one made
// under an earlier version of the terms asks to accept the version in force too (`date` its day as the server writes
// it), so that the clauses approved and the terms accepted are the same text; one made before the beta by invitation
// says it can no longer make a company; an account's link asks the password only. The ticks are uncontrolled with their
// default following them, so the form's reset after an error shows them as the person left them; the focus goes to
// what must be fixed — an empty password is a field to fill, only a bad link is said to be one. Each box and the password
// have their «?» (round 52), beside the box and next to the label, never inside a label.
export default function VerifyEmailForm({ date }: { date: string }) {
  const t = useTranslations('verify'), tr = useTranslations('register'), te = useTranslations('errors'), locale = useLocale();
  const token = useLinkToken();
  const [info, setInfo] = useState<VerifyInfo | undefined>(undefined);
  const [approved, setApproved] = useState({ accept: false, clauses: false });
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
  if (info === 'inviteOnly') return <p className="alert alert-warn" role="alert">{te('registrationInviteOnly', { email: PROVIDER.email })}</p>;
  const registration = info === 'registration' || info === 'registrationNewTerms', newTerms = info === 'registrationNewTerms';
  const values = { ...legalValues(), version: TERMS_VERSION, date };
  const bad = (f: string): true | undefined => (state.fields?.includes(f) ? true : undefined);
  const said = (f: string): string | undefined => (bad(f) ? 'verify-error' : undefined);
  const tick = (k: 'accept' | 'clauses', text: ReactNode) => {
    const aiuto = AIUTO_SPUNTE[k];
    return (
      <div className="consent-row">
        <label className="check consent">
          <input type="checkbox" name={k} required defaultChecked={approved[k]} onChange={(e) => setApproved({ ...approved, [k]: e.target.checked })}
            aria-invalid={bad(k)} aria-describedby={said(k)} />
          <span>{text}</span>
        </label>
        {aiuto.testo ? <Aiuto testo={aiuto.testo} nome={aiuto.nome} /> : null}
      </div>
    );
  };
  return (
    <form ref={form} action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {state.error ? <p id="verify-error" ref={alert} tabIndex={-1} className="alert alert-bad" role="alert">{te(state.error, { email: PROVIDER.email })}</p> : null}
      {registration ? (
        <>
          {newTerms ? (
            <>
              <h2>{t('termsTitle')}</h2>
              <p className="note long">{t('termsChanged', values)}</p>
              {tick('accept', tr.rich('accept', { ...values, link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> }))}
            </>
          ) : null}
          <h2>{t('clausesTitle')}</h2>
          <p className="note long">{t.rich('clausesLead', { link: (chunks) => <Link href="/privacy#terms" target="_blank">{chunks}</Link> })}</p>
          {tick('clauses', tr('clauses', legalValues()))}
        </>
      ) : null}
      <div className="field">
        <Etichetta htmlFor="verify-password" aiuto={testoAiuto(AIUTO, 'verify.password')} nome={t('password')}>{t('password')}</Etichetta>
        <input id="verify-password" className="input" type="password" name="password" autoComplete="current-password" maxLength={200} required
          aria-invalid={bad('password')} aria-describedby={said('password')} />
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? t('submitting') : registration ? t('submitClauses') : t('submit')}
        </button>
      </div>
    </form>
  );
}
