'use client';

// The one form's values still to enter, as its fields read them (src/lib/lift/blank.ts): a value to enter shows
// nothing and is marked as needed; the software's own values come once the project's data are in, a standard one with
// a badge saying so.
import { useTranslations } from 'next-intl';
import type { BlankKey } from '@/lib/lift/blank';
import type { ShaftInputs } from '@/shaft';

export interface FormBlank {
  /** a value still to enter */
  is(k: BlankKey): boolean;
  /** every value still to enter, relevant or not */
  list: readonly BlankKey[];
  /** the project's data are in: the software's own values are shown */
  full: boolean;
}

/** Every value entered (a saved design, the standalone page). */
export const NO_BLANK: FormBlank = { is: () => false, list: [], full: true };

/** A change of the shaft, with what it does to the values still to enter (the keys of its top level it sets are entered). */
export type ShaftSet = (patch: Partial<ShaftInputs>, edit?: (blank: readonly BlankKey[]) => BlankKey[]) => void;

/** The field of a value still to enter (the missing list's links go to it). */
export const fieldId = (k: BlankKey): string => (k === 'r' || k === 'layout' ? k : k === 'bottom' ? 'bottom-scheme' : `bk-${k.replace('.', '-')}`);

/** A millimetre value as typed, or null while the field is empty or not a number (nothing changes). */
export function mmOf(text: string): number | null {
  if (text.trim() === '') return null;
  const v = Math.round(Number(text.replace(',', '.')));
  return Number.isFinite(v) ? v : null;
}

/** The badge of a standard value of the software. */
export function StdBadge({ on = true }: { on?: boolean }) {
  const t = useTranslations('blank');
  return on ? <span className="badge std" title={t('stdTitle')}>{t('std')}</span> : null;
}
