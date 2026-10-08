// A check of the shaft design and the direction of its limit. Shared by the plan, the section and the machine room.
import type { ShaftCheck, ShaftCheckId } from './types';

/** Checks whose limit is a maximum (value ≤ limit); for the others it is a minimum. */
export const isUpperLimit = (id: ShaftCheckId): boolean => id === 'v_area' || id === 'v_wall' || id === 'v_sill' || id === 'v_land' || id === 'v_land2' || id === 'v_op' || id === 'b_type' || id === 'm_beam' || id === 'm_beamf' || id === 'm_heb' || id === 'm_hebf' || id === 'm_rinvio' || id === 'm_calata'
  || id === 'gr_stress' || id === 'gr_flange' || id === 'gr_defl' || id === 'sg_type' || id === 'v_govrail'
  || id === 'v_emerg' || id === 'p_screenlo';

export function check(id: ShaftCheckId, ok: boolean, value: number | null, limit: number | null, dec: number, unit: ShaftCheck['unit'], soft = false): ShaftCheck {
  return { id, status: ok ? 'ok' : soft ? 'warn' : 'fail', value, limit, dec, unit };
}

/** The checks of `base` followed by those of `over`, a check of `over` taking the place of the one of `base` with its id
 *  (the free area in front of the panel, measured up to the machine once the machine is known). */
export const mergeChecks = (base: readonly ShaftCheck[], over: readonly ShaftCheck[]): ShaftCheck[] =>
  [...base.map((c) => over.find((o) => o.id === c.id) ?? c), ...over.filter((o) => !base.some((c) => c.id === o.id))];

/** Checks whose value is kept rounded to the millimetre while the outcome is decided on the exact one. */
const KEPT_ROUNDED: ReadonlySet<ShaftCheckId> = new Set<ShaftCheckId>(['m_calata', 'm_fit', 'm_stand', 'm_quadro', 'v_place', 'v_doorcar', 'v_niche', 'v_staffa']);

/** `x` rounded as the pages print it (half away from zero, as Intl does). */
export function roundShown(x: number, dec: number): number {
  return Number(new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false }).format(x));
}

/** The decimals that show a value without contradicting the outcome of a check of limit `limit` (≤ when `upper`): its
 *  own, or up to three more when a value that does not meet the limit would round onto it; null when even then it
 *  reads as meeting it (a value kept rounded, or an outcome decided on more than the value). */
export function decimalsShown(value: number, limit: number, upper: boolean, met: boolean, dec: number): number | null {
  if (met) return dec;
  for (let k = dec; k <= dec + 3; k++) {
    const v = roundShown(value, k);
    if (upper ? v > limit : v < limit) return k;
  }
  return null;
}

/** A check's value as the pages and the documents print it (without its unit), never contradicting its outcome: with
 *  more decimals when needed, and a value kept rounded that sits on its limit as beyond it ("< 0", "> 20"). */
export function shownValue(c: ShaftCheck, fmt: (x: number, dec: number) => string): string {
  if (c.value === null) return '—';
  if (c.limit === null || c.status === 'info') return fmt(c.value, c.dec);
  const upper = isUpperLimit(c.id), k = decimalsShown(c.value, c.limit, upper, c.status === 'ok', c.dec);
  if (k !== null) return fmt(c.value, k);
  return KEPT_ROUNDED.has(c.id) && c.value === c.limit ? `${upper ? '>' : '<'} ${fmt(c.value, c.dec)}` : fmt(c.value, c.dec);
}
