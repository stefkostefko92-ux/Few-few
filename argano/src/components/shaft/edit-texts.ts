'use client';

// The words of a drawing whose dimensions change where they are: the name of the input behind each dimension (as the
// form calls it), the buttons, the refusals. Shared by the plan editor and the sheets of the standalone page.
import { useTranslations } from 'next-intl';
import { editLabel, type Layout } from '@/shaft';
import type { EditTexts } from '../drawing/EditableDrawing';

export function useEditTexts(L: Layout): EditTexts & { nameOf(key: string): string } {
  const t = useTranslations('shaft');
  const name = (key: string): string => t(editLabel(key, L.frame.kind === 'cantilever'));
  return {
    nameOf: name, group: t('ed_group'), name: (e) => name(e.key), newValue: t('ed_new'), moves: (what) => t('ed_moves', { what }), apply: t('ed_apply'), cancel: t('ed_cancel'),
    refused: (min, max) => (min !== null && max !== null ? t('ed_range', { min, max }) : min !== null ? t('ed_min', { min }) : max !== null ? t('ed_max', { max }) : t('ed_bad')),
  };
}
