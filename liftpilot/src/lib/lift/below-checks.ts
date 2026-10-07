// The checks of the rooms of a machine below (registry locale.macchina, locale.pulegge). Its room, beside the shaft or
// under the pit (bottom.ts belowRoom), is a machine room: the machine inside it (m_fit, belowFit), its height, its door,
// the free area in front of the panel up to the machine, the free area beside the machine and the ways from the door to
// both — the checks, with the ids, of the room over the shaft of a machine above: they take the place of the shaft's own
// for the room over the shaft (mergeChecks), which holds no machine. With the head pulleys in a room over the shaft
// (scheme room) that room is a pulley room: the height of its ways, its door, the free height over the pulleys (soft:
// pulleys with guards need none). Room axes [mm]; pure.
import type { Layout, RoomInputs, ShaftCheck } from '@/shaft';
import { check } from '@/shaft/checks';
import { roomChecksOf, type MachineSpec } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import { panelBox, type Box } from '@/shaft/room-floor';
import { panelChecks } from '@/shaft/room-panel';
import { freeBeside } from '@/shaft/support-check';
import { belowFit, belowMachine, belowRoom, type BottomGeo } from './bottom';
import { KL } from './norme';

/** The machine's room below as the drawings show it (bottom.ts belowRoom) and the machine's corners in plan in the
 *  shaft's axes. */
export function belowRoomOf(L: Layout, g: BottomGeo, M: MachineSpec): { R: RoomInputs; body: readonly (readonly [number, number])[] } {
  const body = belowMachine(L, g, M.D, M.n, M.d, M.shape ?? null).body;
  return { R: belowRoom(L, g, body).room, body };
}

/** The machine's room below as a machine room: m_fit, m_height, m_panel (up to the machine), m_door, m_free, m_quadro and
 *  m_route, with the machine's outline in plan as what stands on its floor. */
export function belowRoomChecks(L: Layout, g: BottomGeo, M: MachineSpec): ShaftCheck[] {
  const { R, body } = belowRoomOf(L, g, M);
  const xs = body.map((p) => p[0] + R.shaftX), ys = body.map((p) => p[1] + R.shaftY);
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const free = freeBeside(R, box, [panelBox(R)]), ok = free.depth >= free.need;
  return [
    ...belowFit(L, g, M), ...roomChecksOf(R, [box]), check('m_free', ok, Math.round(free.depth), free.need, 0, 'mm'),
    ...panelChecks(R, [box], ok ? free.area : null),
  ];
}

/** The pulley room over the shaft of scheme room, its head pulleys of diameter `Dp` with their axes KL.pulleyRoomAxis over
 *  its floor: m_pheight, m_pdoor and m_pabove (soft); none in the other schemes or without a room over the shaft. */
export function pulleyRoomChecks(L: Layout, g: BottomGeo, Dp: number): ShaftCheck[] {
  const R = L.inputs.room, K = KV_VERT;
  if (g.scheme !== 'room' || !R) return [];
  const over = R.H - (KL.pulleyRoomAxis + Dp / 2);
  return [
    check('m_pheight', R.H >= K.pulleyRoomH, R.H, K.pulleyRoomH, 0, 'mm'),
    check('m_pdoor', R.doorW >= K.doorMinW && R.doorH >= K.pulleyDoorH, Math.min(R.doorW - K.doorMinW, R.doorH - K.pulleyDoorH), 0, 0, 'mm'),
    check('m_pabove', over >= K.pulleyAbove, over, K.pulleyAbove, 0, 'mm', true),
  ];
}

/** The checks of the rooms of a machine below, its head pulleys of diameter `Dp`. */
export const belowChecks = (L: Layout, g: BottomGeo, M: MachineSpec, Dp: number): ShaftCheck[] =>
  [...belowRoomChecks(L, g, M), ...pulleyRoomChecks(L, g, Dp)];
