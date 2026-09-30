'use client';

import { useTranslations } from 'next-intl';

// Unexpected error on a page: no technical detail for the user; the digest links it to the server log.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <main className="page page-narrow">
      <p className="eyebrow">500</p>
      <h1>{t('errorTitle')}</h1>
      <p className="lead">{t('errorText')}</p>
      {error.digest ? <p className="note mono">{t('errorCode', { code: error.digest })}</p> : null}
      <p><button type="button" className="btn btn-primary" onClick={reset}>{t('retry')}</button></p>
    </main>
  );
}
