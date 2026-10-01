// The drawing set of the installation on the screen, sheet by sheet, drawn live from the design with the kernel the
// app's PDF uses: an unissued set, without number, author or logo. The software's estimates are marked as in the app.
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { valueMarks, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { buildTavole } from '@/lib/tavole/build';
import ShapesSvg from '@/components/drawing/ShapesSvg';

interface Props {
  inputs: LiftInputs;
  derived: LiftDerived;
  lead: string;
}

export default function Sheets({ inputs, derived, lead }: Props) {
  const t = useTranslations('tavole');
  const [page, setPage] = useState(1);
  const doc = useMemo(() => buildTavole({
    values: derived.values, layout: derived.layout, plant: {}, marks: valueMarks(inputs.auto, derived),
    project: { name: '—', address: null, city: null, province: null, plantNumber: null, client: null },
    company: { name: 'Argano', logo: null },
    set: { number: '—', issuedAt: new Date(), author: '—', revisions: [] },
  }).doc, [inputs.auto, derived]);
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
        <figure className="sheet-page">
          <ShapesSvg shapes={sheet.shapes} w={sheet.w} h={sheet.h} id={`ar-sheet-${n}`} label={t('sheet', { n, total })} />
          <figcaption className="note">{t('sheet', { n, total })}</figcaption>
        </figure>
      ) : null}
    </section>
  );
}
