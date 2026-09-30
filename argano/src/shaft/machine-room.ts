// Machine room above the shaft: where the machine sits (its sheave over the car's rope drop, the diverting pulley over
// the counterweight's), the checks of the room (height, free area in front of the control panel, door), and the
// geometry both drawings of the room share. The machine is a schematic worm-geared machine sized on the sheave.
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import type { Layout, ShaftCheck } from './types';
import type { RoomInputs } from './room';

/** The machine as the calculation describes it [mm, kg]. */
export interface MachineSpec {
  /** sheave pitch diameter; diverting pulley diameter (0: none) */
  D: number;
  Dp: number;
  /** ropes: number and diameter */
  n: number;
  d: number;
  /** machine and bedframe mass */
  mass: number;
  /** label, e.g. "M73 Sx" */
  label: string;
}

export interface RoomGeo {
  room: RoomInputs;
  /** plan: rope drops of the car and of the counterweight, in room coordinates (x, y) */
  carDrop: readonly [number, number];
  cwDrop: readonly [number, number];
  /** unit vector from the car drop to the counterweight drop, and the drop spacing (calata) */
  ux: number;
  uy: number;
  calata: number;
  /** centres of the sheave and of the diverting pulley on the drop line, from the car drop [mm] */
  sheaveAt: number;
  pulleyAt: number;
  /** bedframe along the drop line, from the car drop, and its width across [mm] */
  frame0: number;
  frame1: number;
  frameW: number;
}

/** Room coordinates: origin at the room's inner corner; the shaft's inner corner of entrance A lies at (shaftX, shaftY). */
export function roomGeo(L: Layout, M: MachineSpec): RoomGeo | null {
  const R = L.inputs.room;
  if (!R) return null;
  const car: [number, number] = [R.shaftX + L.car.x + L.car.w / 2, R.shaftY + L.car.y + L.car.h / 2];
  const cw: [number, number] = [R.shaftX + L.cw.x + L.cw.w / 2, R.shaftY + L.cw.y + L.cw.h / 2];
  const dx = cw[0] - car[0], dy = cw[1] - car[1], calata = Math.hypot(dx, dy) || 1;
  const sheaveAt = M.D / 2, pulleyAt = M.Dp > 0 ? calata - M.Dp / 2 : M.D / 2;
  return {
    room: R, carDrop: car, cwDrop: cw, ux: dx / calata, uy: dy / calata, calata, sheaveAt, pulleyAt,
    frame0: -200, frame1: Math.max(calata, M.D) + 200, frameW: Math.max(500, Math.round(M.D * 0.9)),
  };
}

export function roomChecks(L: Layout): ShaftCheck[] {
  const R = L.inputs.room;
  if (!R) return [];
  const across = R.panelWall === 'front' || R.panelWall === 'rear' ? R.D : R.W;
  const free = across - R.panelD;
  return [
    check('m_height', R.H >= KV_VERT.roomH, R.H, KV_VERT.roomH, 0, 'mm'),
    check('m_panel', free >= KV_VERT.panelFreeDepth && R.panelW >= KV_VERT.panelFreeWidth, free, KV_VERT.panelFreeDepth, 0, 'mm'),
    check('m_door', R.doorW >= KV_VERT.doorMinW && R.doorH >= KV_VERT.doorMinH, Math.min(R.doorW - KV_VERT.doorMinW, R.doorH - KV_VERT.doorMinH), 0, 0, 'mm'),
  ];
}
