// The drawing set of the installation on the screen, sheet by sheet, drawn live from the design with the kernel the
// app's PDF uses: an unissued set, without number, author or logo. The software's estimates are marked as in the app.
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { Edit } from '@/drawing';
import { valueMarks, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { buildTavole } from '@/lib/tavole/build';
import { valueOf } from '@/shaft';
import DrawingFigure from '@/components/drawing/DrawingFigure';
import EditableDrawing, { type Refusal } from '@/components/drawing/EditableDrawing';
import { useEditTexts } from '@/components/shaft/edit-texts';

interface Props {
  inputs: LiftInputs;
  derived: LiftDerived;
  lead: string;
  /** a dimension of a sheet given a new length (the design above changes): null when applied, else why not */
  onEdit(e: Edit, length: number): Refusal | null;
}

export default function Sheets({ inputs, derived, lead, onEdit }: Props) {
  const t = useTranslations('tavole'), texts = useEditTexts(derived.layout);
  const [page, setPage] = useState(1);
  const { doc, hits } = useMemo(() => buildTavole({
    values: derived.values, layout: derived.layout, plant: {}, marks: valueMarks(inputs.auto, derived, derived.bottom, derived.collaudo),
    project: { name: '—', address: null, city: null, province: null, plantNumber: null, client: null },
    company: { name: 'LiftPilot', logo: null },
    set: { number: '—', issuedAt: new Date(), author: '—', revisions: [] },
  }), [inputs.auto, derived]);
  const total = doc.pages.length, n = Math.min(page, total), sheet = doc.pages[n - 1];
  return (
    <section className="panel ar-sheets" aria-labelledby="ar-sheets-title">
      <h2 id="ar-sheets-title">{t('title')}</h2>
      <p className="note">{lead}</p>
      <nav className="seg-row" aria-label={t('sheets')}>
        {doc.pages.map((_, i) => (
          <button key={i} type="button" className={i + 1 === n ? 'on' : undefined} aria-current={i + 1 === n ? 'page' : undefined} onClick={() => setPage(i + 1)}>{i + 1}</button>
        ))}
      </nav>
      {sheet ? (
        <DrawingFigure className="sheet-page" w={sheet.w} h={sheet.h} label={t('sheet', { n, total })} caption={t('sheet', { n, total })}>
          <EditableDrawing shapes={sheet.shapes} w={sheet.w} h={sheet.h} id={`ar-sheet-${n}`} label={t('sheet', { n, total })} hits={hits[n - 1] ?? []} fit="width"
            manual={(e) => e.key.startsWith('plan.') && valueOf(inputs.shaft, e.key) !== null} onEdit={onEdit} texts={texts} />
        </DrawingFigure>
      ) : null}
    </section>
  );
}
