'use client';

// Issue of a drawing set from a calculation (a whole project) or from a saved machine room (a replacement): the
// drafter's initials go into the title block, the number comes from the server (YY-NNN of the company and year). A
// revision instead keeps the number and adds a note.
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { issueDrawingSetAction, issueRoomSetAction, reviseDrawingSetAction } from '@/server/drawing-actions';

interface Props {
  /** the calculation, or the replacement's saved machine room, to issue from; for a revision, the calculations (or the
   *  rooms) of the installation to choose from */
  calculationId?: string;
  roomDesignId?: string;
  revise?: { drawingSetId: string; calculations?: { id: string; label: string }[]; rooms?: { id: string; label: string }[] };
}

export default function IssueForm({ calculationId, roomDesignId, revise }: Props) {
  const t = useTranslations('tavole'), te = useTranslations('errors'), router = useRouter();
  const [initials, setInitials] = useState('');
  const [note, setNote] = useState('');
  const options = revise?.rooms ?? revise?.calculations ?? [];
  const [calc, setCalc] = useState(options[0]?.id ?? roomDesignId ?? calculationId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (): void => {
    setError(null);
    start(async () => {
      const r = revise
        ? await reviseDrawingSetAction({ drawingSetId: revise.drawingSetId, ...(revise.rooms ? { roomDesignId: calc } : { calculationId: calc }), note, authorInitials: initials })
        : roomDesignId ? await issueRoomSetAction({ roomDesignId: calc, authorInitials: initials }) : await issueDrawingSetAction({ calculationId: calc, authorInitials: initials });
      if (r.ok && r.id) router.push(`/app/drawing-sets/${r.id}`);
      else if (!r.ok) setError(te(r.error));
    });
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="form-grid">
        {revise ? (
          <label className="field">
            <span>{t(revise.rooms ? 'reviseRoom' : 'reviseCalc')}</span>
            <select className="input" value={calc} onChange={(e) => setCalc(e.target.value)} required>
              {options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        ) : null}
        {revise ? (
          <label className="field">
            <span>{t('reviseNote')}</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} minLength={3} maxLength={120} required />
          </label>
        ) : null}
        <label className="field">
          <span>{t('initials')}</span>
          <input className="input" value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={12} required />
        </label>
      </div>
      {revise ? <p className="note">{t('reviseHint')}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || !calc}>{pending ? t('issuing') : revise ? t('revise') : t('issue')}</button>
        {error ? <span className="note bad" role="alert">{error}</span> : null}
      </div>
    </form>
  );
}
