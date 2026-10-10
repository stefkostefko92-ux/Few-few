// The machine as the drawings of the machine room take it from the calculation: the sheave, the ropes, the diverting
// pulley at the h of the calculation and on the side its bend takes it, the sheave's axis over the room's floor where
// its support puts it — on shims at KL.sheaveAxisPerD·D (the L0 of the calculation counts the same height, the 3D's
// rope rig puts it there: rig.ts), or on the bedplate with the diverting pulley (src/shaft/rinvio.ts: what a machine with
// one stands on, the pulley in the room and never in the shaft); the maker's machine the proposal took as it is
// (src/lib/catalog/shapes.ts), on our bedframe, which takes the axis higher when the machine's own needs it, or on the
// maker's bedplate (src/lib/catalog/bedplates.ts) at the maker's heights.
import { deflectorAngle } from '@/calc/geometry';
import type { ParsedInputs } from '@/calc/types';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { shapeOf } from '@/lib/catalog/shapes';
import type { MachineSpec } from '@/shaft/machine-room';
import type { MachineShape } from '@/shaft/machine-shape';
import { rinvioFrame, sheaveAxisIn, type RinvioFrame } from '@/shaft/rinvio';
import type { RoomInputs } from '@/shaft/room';
import { hebBase, sheaveAxisOn, supportOf, type MachineSupport } from '@/shaft/support';
import { KL } from './norme';

const SHIMS: MachineSupport = { kind: 'shims' };

/** A maker's machine: brand and model. */
export interface Made {
  brand: string;
  model: string;
}

/** Where the diverting pulley Dp turns in the room above the shaft, for the sheave D and the machine; null without a
 *  pulley or a room. `h`: the pulley's distance under the sheave's axis entered by hand [mm] (null: taken from the
 *  bedplate); the maker's bedplate holds the pulley at its own height, so an h that puts it elsewhere takes ours, made to
 *  measure. */
export function rinvioOf(room: RoomInputs | null | undefined, D: number, Dp: number, shape: MachineShape | null, made: Made | null, h: number | null = null): RinvioFrame | null {
  if (!room || Dp <= 0) return null;
  const mk = made ? makerBedplate(made.brand, made.model, D, Dp) : null;
  // h is kept to the millimetre
  const maker = mk && (h === null || Math.abs(mk.sheaveAxis - h - mk.pulleyAxis) <= 1) ? mk : null;
  return rinvioFrame(supportOf(room, true), Dp, maker, shape ? shape.yWheel : null, hebBase(room, true));
}

/** The sheave's axis over the machine room's floor on the room's support, for the sheave D [mm]; a maker's machine on
 *  our bedframe (shape) where it takes the axis higher; on the bedplate with the diverting pulley (`rinvio`). */
export const sheaveAxis = (room: RoomInputs | null | undefined, D: number, shape: MachineShape | null = null, rinvio: RinvioFrame | null = null): number =>
  (rinvio?.on === 'frame' ? sheaveAxisIn(rinvio, D, shape)
    : sheaveAxisOn(supportOf(room ?? null, rinvio !== null), D, KL.sheaveAxisPerD * D, shape, 0, hebBase(room, rinvio !== null)));

/** The sheave's axis over the floor of a machine below (on shims, room.ts in 3D) [mm]. */
export const sheaveAxisBelow = (D: number, shape: MachineShape | null = null): number => sheaveAxisOn(SHIMS, D, KL.sheaveAxisPerD * D, shape);

/** The maker's machine the proposal took, as it is; null for the generic machine (entered by hand, a model without a
 *  shape, none from a catalogue). */
export const machineShapeOf = (fit: { machine: { brand: string; model: string } } | null | undefined): MachineShape | null =>
  (fit ? shapeOf(fit.machine.brand, fit.machine.model) : null);

export function machineSpec({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, mass: number = N.mass, label = '', room: RoomInputs | null = null, shape: MachineShape | null = null,
  made: Made | null = null): MachineSpec {
  const defl = I.layout === 'topDefl', rinvio = defl ? rinvioOf(room, N.D, I.Dp, shape, made, I.h * 1000) : null;
  return {
    D: N.D, Dp: defl ? I.Dp : 0, n: N.n, d: N.d, mass, label, axis: sheaveAxis(room, N.D, shape, rinvio),
    h: defl ? I.h * 1000 : 0, reverse: defl && (deflectorAngle(N.D, I.Dp, I.dx, I.h)?.reverse ?? false), ropeIn: 0, shape, rinvio,
    ...(I.r === 2 && I.Dp > 0 ? { pulley2: I.Dp } : {}),
    ...(hebBase(room, rinvio !== null) ? { base: hebBase(room, rinvio !== null) } : {}),
  };
}
