'use client';

import { useTranslations } from 'next-intl';

// A temporary password, shown once: the person hands it over; the user must change it at the first login. `label` and
// `note` replace the words around it for another secret shown once (a beta invitation's link, /app/admin).
export default function SecretOnce({ email, secret, label, note }: { email?: string; secret: string; label?: string; note?: string }) {
  const t = useTranslations('team');
  return (
    <div className="alert alert-ok flex flex-col gap-2" role="status">
      <span>{label ?? t('tempPassword', { email: email ?? '' })}</span>
      <span className="secret">{secret}</span>
      <span className="note">{note ?? t('tempPasswordNote')}</span>
    </div>
  );
}
