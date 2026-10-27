'use client';

// The save of «Calcolo argano»: the label, the button (held while something is missing, out of range or the type of
// intervention disagrees with the test), what stops it, the draft's bar and the server's answer. Round 52: the label's
// «?» beside it (the field has no visible name: the «?» is not inside it), opening upward from the bar (calc.css).
import { useTranslations } from 'next-intl';
import DraftBar from '@/components/draft/DraftBar';
import type { DraftHandle, DraftTarget } from '@/components/draft/useDraft';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { ConAiuto } from '../shaft/Campo';

interface Props {
  label: string;
  setLabel(s: string): void;
  save(): void;
  saving: boolean;
  /** how many values are still to enter */
  missing: number;
  /** the fields out of range, named */
  bad: string;
  /** what the type of intervention and the test disagree on, named */
  incoerente: string;
  draft: DraftTarget | null;
  draftHandle: DraftHandle;
  error: string | null;
}

export default function CalcSaveBar({ label, setLabel, save, saving, missing, bad, incoerente, draft, draftHandle, error }: Props) {
  const tc = useTranslations('calculations'), tb = useTranslations('blank'), te = useTranslations('errors');
  return (
    <div className="savebar">
      <div className="inner">
        <span className="calc-label">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={tc('labelPlaceholder')} aria-label={tc('label')} />
          <ConAiuto aiuto={testoAiuto(AIUTO, 'label')} nome={tc('label')} />
        </span>
        <button type="button" className="primary" onClick={save} disabled={saving || !!bad || !!incoerente || missing > 0}>{saving ? tc('saving') : tc('save')}</button>
        {missing ? <span className="note">{tb('saveMissing', { n: missing })}</span>
          : bad ? <span className="note bad">{tc('fixFields', { list: bad })}</span>
            : incoerente ? <span className="note bad">{te('invalidIntervento')}: {incoerente}</span> : <span className="note">{tc('saveHint')}</span>}
        {draft ? <DraftBar target={draft} draft={draftHandle} /> : null}
        {error ? <span className="note bad" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}
