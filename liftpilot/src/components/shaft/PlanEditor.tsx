'use client';

// The drawings of the design, to be changed where they are: the plan at the main floor, the one at the top floor and in
// the headroom (where an old building's walls may stand elsewhere) and the one in the pit (buffers, refuge space),
// section A-A whole and in its details, the machine room. Any dimension clicked takes a new length and the design is
// laid out again; the distances of the plan set by hand are listed below, with what the software would put there, to
// be reset one by one. Every value goes through the same validation as the save.
// Motion: none; the drawing is redrawn, never animated.
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Edit } from '@/drawing';
import { screenView, type ScreenView } from '@/lib/tavole/views';
import { checkedInputs, editShaft } from '@/lib/shaft-edit';
import { editValue, layout, valueOf, type MachineSpec, type ShaftInputs } from '@/shaft';
import EditableDrawing, { type Refusal } from '../drawing/EditableDrawing';
import { useEditTexts } from './edit-texts';
import PlanFixes from './PlanFixes';

interface Props {
  I: ShaftInputs;
  /** the new inputs, validated */
  onChange(next: ShaftInputs): void;
  /** the machine, for the machine room's views; null: none drawn */
  machine: MachineSpec | null;
  /** a value of the calculation a drawing shows (calc.*), in mm: null when applied, else why not; missing: refused */
  onCalc?(key: string, value: number): Refusal | null;
  id: string;
  /** the title's level where the editor sits */
  titleAs?: 'h2' | 'h3';
}

const VIEWS: readonly ScreenView[] = ['plan', 'head', 'pit-plan', 'full', 'top', 'floor', 'pit', 'room-plan', 'room-section'];

export default function PlanEditor({ I, onChange, machine, onCalc, id, titleAs: Title = 'h2' }: Props) {
  const t = useTranslations('shaft');
  const [view, setView] = useState<ScreenView>('plan');
  const L = useMemo(() => layout(I), [I]);
  const room = machine !== null && I.room !== null;
  const shown = view.startsWith('room') && !room ? 'plan' : view;
  const v = useMemo(() => screenView(L, shown, room ? machine : null), [L, shown, room, machine]);

  const texts = useEditTexts(L);
  // distances of the plan and walls of the headroom set by hand
  const manual = (e: Edit): boolean => (e.key.startsWith('plan.') && valueOf(I, e.key) !== null) || (e.key.startsWith('head.') && (valueOf(I, e.key) ?? 0) !== 0);
  const onEdit = (e: Edit, length: number): Refusal | null => {
    if (e.key.startsWith('calc.')) return onCalc ? onCalc(e.key, editValue(e, length)) : { min: null, max: null };
    const r = editShaft(I, e, length);
    if (!r.ok) return r;
    onChange(r.inputs);
    return null;
  };

  return (
    <div className="plan-editor" role="group" aria-labelledby={`${id}-title`}>
      <Title id={`${id}-title`}>{t('ed_title')}</Title>
      <p className="note">{t('ed_hint')}</p>
      <div className="seg-row" role="tablist" aria-label={t('ed_views')}>
        {VIEWS.filter((k) => room || !k.startsWith('room')).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={shown === k} className={shown === k ? 'on' : undefined} onClick={() => setView(k)}>{t(`ed_v_${k.replace('-', '_')}`)}</button>
        ))}
      </div>
      {v ? (
        <figure className="sheet-view">
          <EditableDrawing shapes={v.shapes} w={v.w} h={v.h} hits={v.hits} id={`${id}-${shown}`} label={t(`ed_v_${shown.replace('-', '_')}`)} manual={manual} onEdit={onEdit} texts={texts} />
          <figcaption>{t('scale', { n: v.scale })} · {t('ed_count', { n: v.hits.length })}</figcaption>
        </figure>
      ) : <p className="note">{t('ed_none')}</p>}
      <PlanFixes I={I} L={L} name={(k) => texts.nameOf(`plan.${k}`)} onChange={onChange} check={checkedInputs} refused={texts.refused} />
    </div>
  );
}
