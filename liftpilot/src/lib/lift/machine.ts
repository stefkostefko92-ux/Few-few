// The machine as the drawings of the machine room take it from the calculation: the sheave, the ropes, the diverting
// pulley at the h of the calculation and on the side its bend takes it, the sheave's axis over the room's floor where
// its support puts it — on shims at KL.sheaveAxisPerD·D (the L0 of the calculation counts the same height, the 3D's
// rope rig puts it there: rig.ts).
import { deflectorAngle } from '@/calc/geometry';
import type { ParsedInputs } from '@/calc/types';
import type { MachineSpec } from '@/shaft/machine-room';
import type { RoomInputs } from '@/shaft/room';
import { sheaveAxisOn, supportOf } from '@/shaft/support';
import { KL } from './norme';

/** The sheave's axis over the machine room's floor on the room's support, for the sheave D [mm]. */
export const sheaveAxis = (room: RoomInputs | null | undefined, D: number): number => sheaveAxisOn(supportOf(room ?? null), D, KL.sheaveAxisPerD * D);

export function machineSpec({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, mass: number = N.mass, label = '', room: RoomInputs | null = null): MachineSpec {
  const defl = I.layout === 'topDefl';
  return {
    D: N.D, Dp: defl ? I.Dp : 0, n: N.n, d: N.d, mass, label, axis: sheaveAxis(room, N.D),
    h: defl ? I.h * 1000 : 0, reverse: defl && (deflectorAngle(N.D, I.Dp, I.dx, I.h)?.reverse ?? false), ropeIn: I.r === 2 ? I.Dp / 2 : 0,
  };
}
