'use client';

import { useTranslations } from 'next-intl';
import '@/app/public.css';

// Unexpected error on a page: no technical detail for the user; the digest links it to the server log.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <main id="main" tabIndex={-1} className="pub-page err-page blueprint">
      <p className="err-code" aria-hidden="true">500</p>
      <h1>{t('errorTitle')}</h1>
      <p className="lead">{t('errorText')}</p>
      {error.digest ? <p className="note mono">{t('errorCode', { code: error.digest })}</p> : null}
      <p className="err-actions"><button type="button" className="btn btn-primary" onClick={reset}>{t('retry')}</button></p>
    </main>
  );
}
