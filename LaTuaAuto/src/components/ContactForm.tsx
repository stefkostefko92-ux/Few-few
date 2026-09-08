'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { sendContactAction, type ContactState } from '@/app/actions/contact';

export function ContactForm() {
  const t = useTranslations('contact');
  const locale = useLocale();
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactAction, { status: 'idle' });

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot: скрито за хора, видимо за ботове. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="email" className="label">{t('email')}</label>
        <input id="email" name="email" type="email" required maxLength={254} className="field" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="body" className="label">{t('message')}</label>
        <textarea id="body" name="body" required minLength={10} maxLength={4000} rows={6} className="field" />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>{t('send')}</button>
      <p aria-live="polite" className="text-sm">
        {state.status === 'sent' ? <span className="text-emerald-700">{t('sent')}</span> : null}
        {state.status === 'error' ? <span className="text-red-700">{t('error')}</span> : null}
      </p>
    </form>
  );
}
