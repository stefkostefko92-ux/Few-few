// The machine room over the machine and at its handwheel (registry locale.macchina, locale.volantino,
// locale.esistente.altezza): the free height over the machine's unguarded rotating parts (UNI EN 81-20:2020,
// 5.2.6.3.2.3: m_above), where the handwheel is for the manual emergency operation and whether the free area beside the
// machine reaches it (m_wheel), and the height of an existing room under 2,0 m when a modification is tested to
// UNI 10411-1:2024 (9.2 → UNI EN 81-21:2022, 5.9: m_hexist). Room axes [mm]; pure.
import { check } from './checks';
import { machineU, machineV, type MachineSpec, type RoomGeo } from './machine-room';
import { MACHINE_A } from './machine-outline';
import { partBox } from './machine-shape';
import { KV_VERT } from './norme-vert';
import type { RoomInputs } from './room';
import type { ShaftCheck } from './types';

type Pt = readonly [number, number];

/** The generic machine's handwheel at Ø 560, on the motor's shaft end [m]: along the worm, its top over the bedplate's
 *  underside (machine-outline.ts). */
const WHEEL_X = 0.975, WHEEL_TOP = MACHINE_A.yWorm + 0.2;

/** The handwheel of the machine: its middle in the machine's frame (x along the worm, z across) and its top over the
 *  room's floor [mm] — a maker's where its sheet puts it (else the motor's far end on the worm's line), the generic one
 *  on the motor's shaft end. */
function wheelOf(G: RoomGeo, M: MachineSpec): { x: number; z: number; top: number } {
  const F = G.frame, S = F.shape;
  if (!S) {
    const k = 1000 * F.s;
    return { x: WHEEL_X * k, z: 0, top: M.axis - MACHINE_A.yWheel * k + WHEEL_TOP * k };
  }
  const hw = S.parts.find((p) => p.role === 'handwheel'), b = hw ? partBox(hw) : null;
  if (b) return { x: (b[0] + b[3]) / 2, z: (b[2] + b[5]) / 2, top: M.axis - S.yWheel + b[4] };
  const motors = S.parts.filter((p) => p.role === 'motor').map(partBox);
  const far = motors.length ? Math.max(...motors.map((m) => m[3])) : S.overall[1];
  return { x: far, z: motors.length ? (motors[0][2] + motors[0][5]) / 2 : 0, top: M.axis - S.yWheel + S.yWorm };
}

/** Where the handwheel is in the room's plan (room axes), as the machine is turned. */
export function wheelAt(G: RoomGeo, M: MachineSpec): Pt {
  const w = wheelOf(G, M), u = machineU(G, w.x), v = machineV(G, w.z);
  return [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
}

/** The highest point of the machine's rotating parts a person could reach over the room's floor [mm]: the sheave's rim
 *  with the ropes on it, the handwheel, a diverting pulley turning in the room. */
export const rotatingTop = (G: RoomGeo, M: MachineSpec): number => rotatingTopAt(G, M).z;

/** The same highest point with where it stands along the drop line (u) [mm], for section B-B's dimension. */
export function rotatingTopAt(G: RoomGeo, M: MachineSpec): { z: number; u: number } {
  const rim = Math.max(M.d, 12), w = wheelOf(G, M);
  const tops = [{ z: M.axis + M.D / 2 + rim, u: G.sheaveAt }, { z: w.top, u: machineU(G, w.x) }];
  if (M.Dp > 0) tops.push({ z: G.pulleyZ + M.Dp / 2 + rim, u: G.pulleyAt });
  return tops.reduce((a, b) => (b.z > a.z ? b : a));
}

/** m_above (soft: the parts may be guarded): the free height from the highest unguarded rotating part to the ceiling's
 *  lowest point, at least KV_VERT.rotatingAbove. */
export function aboveCheck(G: RoomGeo, M: MachineSpec): ShaftCheck {
  const clear = G.room.H - rotatingTop(G, M);
  return check('m_above', clear >= KV_VERT.rotatingAbove, Math.round(clear), KV_VERT.rotatingAbove, 0, 'mm', true);
}

/** m_wheel (soft): the free area beside the machine within KV_VERT.wheelReach of the handwheel — the margin [mm]; `gap`
 *  the handwheel's distance from the area (room-free.ts freeBeside). */
export const wheelCheck = (gap: number): ShaftCheck => check('m_wheel', gap <= KV_VERT.wheelReach, Math.round(KV_VERT.wheelReach - gap), 0, 0, 'mm', true);

/** m_hexist: an existing machine room in a modification (UNI 10411-1:2024, 9.2): at least KV_VERT.existingRoomMin it
 *  passes; down to KV_VERT.existingRoomPad under the padding (`padding` thick) it warns — the zones marked and padded
 *  (UNI EN 81-21:2022, 5.9); lower it fails. The limit shown: the height it would pass at. */
export function existingRoomCheck(R: Pick<RoomInputs, 'H'>, padding: number = KV_VERT.existingPadding): ShaftCheck {
  const K = KV_VERT, low = K.existingRoomPad + padding, status = R.H >= K.existingRoomMin ? 'ok' : R.H >= low ? 'warn' : 'fail';
  return { id: 'm_hexist', status, value: R.H, limit: status === 'fail' ? low : K.existingRoomMin, dec: 0, unit: 'mm' };
}
