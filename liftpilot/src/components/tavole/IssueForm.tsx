'use client';

// Issue of a drawing set from a calculation (a whole project) or from a saved machine room (a replacement): the
// drafter's initials go into the title block (prefilled from the user's name), the number comes from the server (YY-NNN
// of the company and year). A revision instead keeps the number and adds a note. Before it, what the title block would
// get wrong or leave empty: a machine name against the calculation's (the server refuses the issue), the plant number of
// an existing lift, the client (each with the page it is corrected on); and the data of the installation sheet 1 reads
// that nobody entered, with the way to them always at hand (the issue stays allowed).
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import type { IssueChecks } from '@/lib/tavole/issue-check';
import { issueDrawingSetAction, issueRoomSetAction, reviseDrawingSetAction } from '@/server/drawing-actions';

interface Props {
  /** the calculation, or the replacement's saved machine room, to issue from; for a revision, the calculations (or the
   *  rooms) of the installation to choose from */
  calculationId?: string;
  roomDesignId?: string;
  revise?: { drawingSetId: string; calculations?: { id: string; label: string }[]; rooms?: { id: string; label: string }[] };
  /** the signed-in user's initials (initialsOf) */
  initials: string;
  /** what the data of the project leave wrong or empty in the title block (issue-check.ts), with the project to correct */
  checks?: IssueChecks;
  projectId?: string;
}

export default function IssueForm({ calculationId, roomDesignId, revise, initials: mine, checks, projectId }: Props) {
  const t = useTranslations('tavole'), tp = useTranslations('projects'), te = useTranslations('errors'), router = useRouter();
  const [initials, setInitials] = useState(mine);
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
  // the project's details, where its plant number and client are entered
  const edit = projectId ? <> <Link href={`/app/projects/${projectId}/edit`}>{tp('edit')}</Link></> : null;
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
      {checks?.machine ? (
        <p className="alert alert-bad" role="alert">
          {t('issueMachine', checks.machine)}
          {projectId ? <> <Link href={`/app/projects/${projectId}/impianto`}>{t('plantLink')}</Link></> : null}
        </p>
      ) : null}
      {checks?.plantNumber ? <p className="alert alert-warn" role="status">{t('issuePlantNumber')}{edit}</p> : null}
      {checks?.client ? <p className="note">{t('issueClient')}{edit}</p> : null}
      {checks && projectId ? (
        <p className={checks.empty.length ? 'alert alert-warn' : 'note'} role="status">
          {checks.empty.length ? t('issueEmpty', { n: String(checks.empty.length), list: checks.empty.map((k) => t(`f_${k}`)).join(', ') }) : t('issuePlantFull')}
          {' '}<Link href={`/app/projects/${projectId}/impianto`}>{t('plantLink')}</Link>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || !calc || !!checks?.machine}>{pending ? t('issuing') : revise ? t('revise') : t('issue')}</button>
        {error ? <span className="note bad" role="alert">{error}</span> : null}
      </div>
    </form>
  );
}
