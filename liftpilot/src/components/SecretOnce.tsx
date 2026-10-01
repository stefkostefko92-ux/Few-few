'use client';

import { useTranslations } from 'next-intl';

// A temporary password, shown once: the person hands it over; the user must change it at the first login.
export default function SecretOnce({ email, secret }: { email?: string; secret: string }) {
  const t = useTranslations('team');
  return (
    <div className="alert alert-ok flex flex-col gap-2" role="status">
      <span>{t('tempPassword', { email: email ?? '' })}</span>
      <span className="secret">{secret}</span>
      <span className="note">{t('tempPasswordNote')}</span>
    </div>
  );
}
