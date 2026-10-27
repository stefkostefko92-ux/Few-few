'use client';

// The internal review of a saved calculation: an optional note and the button. Round 52: the note with its «?»
// (messages/aiuto/calcolo.json), a label of its own (shaft/Campo).
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { testoAiuto } from '@/lib/aiuto';
import { reviewCalculationAction } from '@/server/calc-actions';
import AIUTO from '../../messages/aiuto/calcolo.json';
import Campo from './shaft/Campo';

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
      <Campo id="review-note" nome={t('reviewNote')} aiuto={testoAiuto(AIUTO, 'review_note')}>
        <textarea id="review-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={submit} disabled={pending}>{t('reviewAction')}</button>
        <span className="note">{t('reviewHint')}</span>
        {error ? <span className="note bad" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}
