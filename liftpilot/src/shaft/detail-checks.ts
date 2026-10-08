// The checks of the shaft's details (round 36): v_emerg, the rise between consecutive landings with doors, over which
// emergency doors are needed (UNI EN 81-20:2020, 5.2.3.1; registry porte.soccorso — the software does not model them,
// so it does not pass); p_toe, the plate under the landing sills, a warning until the doors' unlocking zone is entered
// (toe.ts, registry porte.sottosoglia); the counterweight's screen's lower edge and width (screen.ts); the information
// h_cwgap, the clearance on the counterweight's sign (cw-gap.ts). Pure.
import { check } from './checks';
import { cwGapCheck } from './cw-gap';
import { KV_VERT } from './norme-vert';
import { screenChecks } from './screen';
import { toeOf } from './toe';
import { levels } from './vertical';
import type { Layout, ShaftCheck } from './types';

/** The longest rise between two consecutive floors with a landing door of the design (any entrance) [mm]; 0 with fewer
 *  than two such floors. */
export function maxDoorRise(L: Layout): number {
  const V = L.inputs.vertical, lv = levels(V.floors), sides = new Set(L.doors.map((d) => d.side));
  const zs = V.floors.flatMap((f, i) => ([...f.door].some((s) => sides.has(s as 'A' | 'B')) ? [lv[i] ?? 0] : []));
  return Math.max(0, ...zs.slice(1).map((z, i) => z - (zs[i] ?? z)));
}

export function detailChecks(L: Layout): ShaftCheck[] {
  const K = KV_VERT, rise = maxDoorRise(L), t = toeOf(L.inputs);
  return [
    check('v_emerg', rise <= K.emergencyRise, rise, K.emergencyRise, 0, 'mm'),
    check('p_toe', t.entered, t.h, t.zone + K.toeOver, 0, 'mm', true),
    ...screenChecks(L),
    // the clearance on the counterweight's sign, from the headroom's checks already made (cw-gap.ts)
    cwGapCheck(L, L.checks),
  ];
}
