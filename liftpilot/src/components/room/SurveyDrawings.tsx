'use client';

// The replacement's machine room drawn as it will be (plan and section B-B), its dimensions changed where they are:
// the room, the support, the shaft under it and the drops (moved together); what the calculation decides (the drops'
// spacing, h) is not a dimension to change here. Every value goes through the same validation as the save.
// Motion: none; the drawing is redrawn, never animated.
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import SectionTitle from '@/components/project/SectionTitle';
import type { Edit } from '@/drawing';
import { editLabel } from '@/shaft';
import { editSurvey } from '@/lib/room/edit';
import type { RoomDerived } from '@/lib/room/derive';
import type { Survey } from '@/lib/room/survey';
import { cropped, surveyView } from '@/lib/tavole/views';
import DrawingFigure from '../drawing/DrawingFigure';
import EditableDrawing, { type EditTexts, type Refusal } from '../drawing/EditableDrawing';

const AREA = { x0: 0, y0: 0, x1: 190, y1: 190 };

interface Props {
  survey: Survey;
  derived: RoomDerived;
  onChange(next: Survey): void;
  id: string;
}

export default function SurveyDrawings({ survey, derived, onChange, id }: Props) {
  const t = useTranslations('shaft'), tr = useTranslations('room');
  const [kind, setKind] = useState<'plan' | 'section'>('plan');
  const v = useMemo(() => {
    try {
      const x = surveyView(derived, kind, AREA);
      return x ? cropped(x) : null;
    } catch {
      return null;
    }
  }, [derived, kind]);
  const name = (key: string): string => (key.startsWith('drop.') ? tr(key === 'drop.carX' ? 'dr_x' : 'dr_y') : t(editLabel(key, false)));
  const texts: EditTexts = {
    group: t('ed_group'), name: (e) => name(e.key), newValue: t('ed_new'), pick: t('ed_pick'), moves: (what) => t('ed_moves', { what }), apply: t('ed_apply'), cancel: t('ed_cancel'),
    refused: (min, max) => (min !== null && max !== null ? t('ed_range', { min, max }) : min !== null ? t('ed_min', { min }) : max !== null ? t('ed_max', { max }) : t('ed_bad')),
  };
  // the support set by hand is marked
  const manual = (e: Edit): boolean => (e.key.startsWith('sup.') || e.key === 'rinvio.height') && survey.room.support !== undefined;
  const onEdit = (e: Edit, length: number): Refusal | null => {
    const r = editSurvey(survey, e, length);
    if (!r.ok) return r;
    onChange(r.survey);
    return null;
  };
  return (
    <div className="plan-editor" role="group" aria-labelledby={`${id}-title`}>
      <SectionTitle id={`${id}-title`} icon="blueprint">{tr('drawTitle')}</SectionTitle>
      <p className="note">{t('ed_hint')}</p>
      <div className="seg-row" role="tablist" aria-label={t('ed_views')}>
        {(['plan', 'section'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : undefined} onClick={() => setKind(k)}>{t(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')}</button>
        ))}
      </div>
      {v ? (
        <DrawingFigure className="sheet-view" w={v.w} h={v.h} label={t(kind === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')} caption={<>{t('scale', { n: v.scale })} · {t('ed_count', { n: v.hits.length })}</>}>
          <EditableDrawing shapes={v.shapes} w={v.w} h={v.h} hits={v.hits} id={`${id}-${kind}`} label={t(kind === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')} manual={manual} onEdit={onEdit} texts={texts} />
        </DrawingFigure>
      ) : <p className="note">{tr('noDrawing')}</p>}
    </div>
  );
}
