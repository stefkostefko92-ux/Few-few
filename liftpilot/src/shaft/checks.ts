// A check of the shaft design and the direction of its limit. Shared by the plan, the section and the machine room.
import type { ShaftCheck, ShaftCheckId } from './types';

/** Checks whose limit is a maximum (value ≤ limit); for the others it is a minimum. */
export const isUpperLimit = (id: ShaftCheckId): boolean => id === 'v_area' || id === 'v_wall' || id === 'v_sill' || id === 'v_land' || id === 'v_land2' || id === 'v_op' || id === 'b_type' || id === 'm_beam' || id === 'm_beamf' || id === 'm_rinvio';

export function check(id: ShaftCheckId, ok: boolean, value: number | null, limit: number | null, dec: number, unit: ShaftCheck['unit'], soft = false): ShaftCheck {
  return { id, status: ok ? 'ok' : soft ? 'warn' : 'fail', value, limit, dec, unit };
}
