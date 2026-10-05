'use client';

// Where a form's draft stands, in its save bar: resumed (kept on a day the server writes), kept a moment ago, or not
// kept; and its discard, asked twice — the page then opens again from the latest record of the project or empty.
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { discardDraftAction } from '@/server/draft-actions';
import type { DraftHandle, DraftTarget } from './useDraft';

const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function DraftBar({ target, draft }: { target: DraftTarget; draft: DraftHandle }) {
  const { state } = draft;
  const t = useTranslations('draft');
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  if (state.kind === 'none') return null;
  const discard = (): void => start(async () => {
    draft.stop();
    const r = await discardDraftAction({ projectId: target.projectId, scope: target.scope });
    if (r.ok) window.location.reload();
    else setError(true);
  });
  const text = state.kind === 'resumed' ? t('resumed', { at: state.at }) : state.kind === 'saved' ? t('saved', { time: hhmm(state.at) }) : t('failed');
  return (
    <span className={`draft-bar note${state.kind === 'failed' || error ? ' bad' : ''}`} role="status">
      {text}
      {state.kind !== 'failed' ? (asking ? (
        <>
          {' '}{t('ask')}{' '}
          <button type="button" className="btn btn-sm" onClick={discard} disabled={pending}>{t('yes')}</button>{' '}
          <button type="button" className="btn btn-sm" onClick={() => setAsking(false)} disabled={pending}>{t('no')}</button>
        </>
      ) : <>{' '}<button type="button" className="btn btn-sm" onClick={() => setAsking(true)}>{t('discard')}</button></>) : null}
      {error ? <> {t('discardFailed')}</> : null}
    </span>
  );
}
