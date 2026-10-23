'use client';

// An unexpected error on a page, said without technical detail: what happened, «Riprova», the code that links it to the
// server's log (Next's digest), «Segnala il problema» for a signed-in user — the report page gets the code and the page
// it came from (path only, never the query) — and the address to write to for everyone. Two frames: inside the
// application (`inApp`: the shell's menu and footer stay around it, src/app/[locale]/app/error.tsx) and on its own
// (src/app/[locale]/error.tsx, with the public footer). Outside the application nobody can tell from the browser whether
// the visitor is signed in (the session cookie is httpOnly): a page under /app means so; the report page sends anyone
// else to the sign-in.
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { PROVIDER } from '@/lib/provider';
import Icon from './Icon';

/** The report page with the error's code and the page it came from. */
export function reportHref(pathname: string, digest: string | undefined): string {
  const q = new URLSearchParams();
  if (digest) q.set('codice', digest);
  q.set('da', pathname);
  return `/app/segnala?${q.toString()}`;
}

export default function ErrorView({ error, reset, inApp = false }: { error: Error & { digest?: string }; reset: () => void; inApp?: boolean }) {
  const t = useTranslations('errors');
  const pathname = usePathname();
  const report = inApp || pathname === '/app' || pathname.startsWith('/app/');
  const actions = (
    <p className={inApp ? 'flex flex-wrap gap-3 m-0' : 'err-actions'}>
      <button type="button" className="btn btn-primary" onClick={reset}><Icon name="refresh-cw" size={18} />{t('retry')}</button>
      {report ? <Link className="btn" href={reportHref(pathname, error.digest)}><Icon name="message-circle" size={18} />{t('reportLink')}</Link> : null}
      {inApp ? null : <Link className="btn" href="/"><Icon name="home" size={18} />{t('toHome')}</Link>}
    </p>
  );
  const code = error.digest ? <p className="note mono">{t('errorCode', { code: error.digest })}</p> : null;
  const mail = <p className="note">{t('reportMail', { email: PROVIDER.email })}</p>;
  if (inApp) {
    return (
      <main className="page page-narrow">
        <div className="page-head">
          <div className="titles">
            <p className="eyebrow">{t('errorEyebrow')}</p>
            <h1>{t('errorTitle')}</h1>
            <p className="lead">{t('errorText')}</p>
          </div>
        </div>
        <section className="panel items-start" role="alert">
          {code}
          {actions}
          {mail}
        </section>
      </main>
    );
  }
  return (
    <main id="main" tabIndex={-1} className="pub-page err-page blueprint">
      <p className="err-code" aria-hidden="true">500</p>
      <h1>{t('errorTitle')}</h1>
      <p className="lead">{t('errorText')}</p>
      {code}
      {actions}
      {mail}
    </main>
  );
}
