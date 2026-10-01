'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { reviewCalculationAction } from '@/server/calc-actions';

export default function ReviewForm({ calculationId }: { calculationId: string }) {
  const t = useTranslations('calculations'), te = useTranslations('errors'), router = useRouter();
  const [note, setNote] = useState(''), [error, setError] = useState(''), [pending, start] = useTransition();
  const submit = (): void => {
    setError('');
    start(async () => {
      const r = await reviewCalculationAction({ calculationId, note });
      if (r.ok) { setNote(''); router.refresh(); } else setError(te(r.error ?? 'unexpected'));
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <label className="field">
        <span>{t('reviewNote')}</span>
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={submit} disabled={pending}>{t('reviewAction')}</button>
        <span className="note">{t('reviewHint')}</span>
        {error ? <span className="note bad" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}
