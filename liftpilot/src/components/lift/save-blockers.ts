'use client';

// What the save of the one form would refuse, as the server refuses it (src/server/save.ts createLiftDesign), named as the
// form names it and with the field each one is corrected in: every value of the calculation out of range (shown or not),
// each issue of the geometry, every value of the shaft out of the ranges the server accepts. The bar of the save lists
// them; after «Aggiorna con il software attuale» found the record no longer saves as it was, the notice at the top links
// each one to its field (RefreshNotice).
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { LiftDerived } from '@/lib/lift';
import { SHAFT_FIELDS, type BlankKey } from '@/lib/lift/blank';
import type { CalcKey, Pres } from '@/lib/present/tr';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { DEFAULTS, type ShaftInputs } from '@/shaft';
import { fieldId } from '../blank';

/** The key of the shaft's form label for a value at `path` of the shaft's inputs (the path itself when none). */
function shaftLabelKey(path: readonly string[]): string {
  const [a, b] = path;
  if (b && a === 'vertical') return `vt_${b}`;
  if (b && a === 'room') return `rm_${b}`;
  if (b && a === 'imbotti') return `im_${b}`;
  if (b && a === 'frame') return `fr_${b}`;
  if (b && a === 'plan') return `pk_${b}`;
  return a && a in DEFAULTS ? `a_${a}` : a ?? '';
}

/** An issue of the geometry as the field it is fixed in. */
const ISSUE_FIELD: Readonly<Record<string, string>> = { calata: 'n_D', rinvio: 'h' };

const isShaftField = (k: string): k is (typeof SHAFT_FIELDS)[number] => (SHAFT_FIELDS as readonly string[]).includes(k);
const isVertical = (k: string): k is Extract<BlankKey, 'v' | 'pit' | 'headroom'> => k === 'v' || k === 'pit' || k === 'headroom';

/** The id of the form's field a refused value is corrected in (the calculation's fields carry their own id, the
 *  project's those of blank.tsx fieldId); null: a value the form has no single field for. */
export function blockerField(field: string): string | null {
  if (!field.startsWith('shaft.')) return ISSUE_FIELD[field] ?? field.replace(/^calc\./, '');
  const [a = '', b = ''] = field.slice(6).split('.');
  if (isShaftField(a)) return fieldId(a);
  if (a === 'vertical' && isVertical(b)) return fieldId(b);
  if (a === 'room' && b) return `bk-room-${b}`;
  return null;
}

export interface SaveBlocker {
  /** the field it is corrected in; null: none */
  id: string | null;
  label: string;
}

/** The values the save would refuse of the inputs `shaft` and their derivation `derived` (null: not worked out yet). */
export function useSaveBlockers(P: Pres, derived: LiftDerived | null, shaft: ShaftInputs) {
  const ts = useTranslations('shaft');
  const nameOf = useCallback((field: string): string => {
    if (field.startsWith('shaft.')) {
      const path = field.slice(6).split('.'), key = shaftLabelKey(path);
      return ts.has(key) ? ts(key) : path.join('.');
    }
    const id = ISSUE_FIELD[field] ?? field.replace(/^calc\./, '');
    return P.t(id.replace(/^[no]_/, '') as CalcKey) + (id.startsWith('o_') ? ` (${P.t('g_old')})` : '');
  }, [P, ts]);
  const blockers = useMemo((): SaveBlocker[] => {
    if (!derived) return [];
    const r = shaftInputsSchema.safeParse(shaft);
    const fields = [...derived.analysis.ctx.bad, ...derived.issues, ...(r.success ? [] : r.error.issues.map((i) => `shaft.${i.path.map(String).join('.')}`))];
    const seen = new Set<string>();
    return fields.flatMap((f) => {
      const label = nameOf(f);
      if (seen.has(label)) return [];
      seen.add(label);
      return [{ id: blockerField(f), label }];
    });
  }, [shaft, derived, nameOf]);
  const refused = useMemo(() => blockers.map((b) => b.label), [blockers]);
  return { nameOf, blockers, refused };
}
