// The machine as the drawings of the machine room take it from the calculation: the sheave, the ropes, the diverting
// pulley at the h of the calculation and on the side its bend takes it, the sheave's axis over the room's floor where
// its support puts it — on shims at KL.sheaveAxisPerD·D (the L0 of the calculation counts the same height, the 3D's
// rope rig puts it there: rig.ts); the maker's machine the proposal took as it is (src/lib/catalog/shapes.ts), on our
// bedframe, which takes the axis higher when the machine's own needs it.
import { deflectorAngle } from '@/calc/geometry';
import type { ParsedInputs } from '@/calc/types';
import { shapeOf } from '@/lib/catalog/shapes';
import type { MachineSpec } from '@/shaft/machine-room';
import type { MachineShape } from '@/shaft/machine-shape';
import type { RoomInputs } from '@/shaft/room';
import { sheaveAxisOn, supportOf, type MachineSupport } from '@/shaft/support';
import { KL } from './norme';

const SHIMS: MachineSupport = { kind: 'shims' };

/** The sheave's axis over the machine room's floor on the room's support, for the sheave D [mm]; a maker's machine on
 *  our bedframe (shape) where it takes the axis higher. */
export const sheaveAxis = (room: RoomInputs | null | undefined, D: number, shape: MachineShape | null = null): number =>
  sheaveAxisOn(supportOf(room ?? null), D, KL.sheaveAxisPerD * D, shape);

/** The sheave's axis over the floor of a machine below (on shims, room.ts in 3D) [mm]. */
export const sheaveAxisBelow = (D: number, shape: MachineShape | null = null): number => sheaveAxisOn(SHIMS, D, KL.sheaveAxisPerD * D, shape);

/** The maker's machine the proposal took, as it is; null for the generic machine (entered by hand, a model without a
 *  shape, none from a catalogue). */
export const machineShapeOf = (fit: { machine: { brand: string; model: string } } | null | undefined): MachineShape | null =>
  (fit ? shapeOf(fit.machine.brand, fit.machine.model) : null);

export function machineSpec({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, mass: number = N.mass, label = '', room: RoomInputs | null = null, shape: MachineShape | null = null): MachineSpec {
  const defl = I.layout === 'topDefl';
  return {
    D: N.D, Dp: defl ? I.Dp : 0, n: N.n, d: N.d, mass, label, axis: sheaveAxis(room, N.D, shape),
    h: defl ? I.h * 1000 : 0, reverse: defl && (deflectorAngle(N.D, I.Dp, I.dx, I.h)?.reverse ?? false), ropeIn: I.r === 2 ? I.Dp / 2 : 0, shape,
  };
}
