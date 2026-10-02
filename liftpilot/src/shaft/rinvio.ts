// The diverting pulley of a machine above the shaft, in the machine room and never in the shaft (registry
// locale.rinvio). It turns in the machine's bedplate — legs on dampers, two beams at the top that carry the machine, the
// pulley hung between them — or, with another support chosen for the machine, on its own stand on the room's floor.
// Ours is drawn after the makers' bedplates (SICOR XTE3022, XTE6026: the pulley's axis 320 mm over the floor, the top
// 736 mm); a maker's own, when the machine is one of its models with a bedplate in the catalogue
// (src/lib/catalog/bedplates.ts), gives its heights, its code and the rope drops it takes. Millimetres over the room's
// floor, along the rope drop line from the sheave's centre. Pure.
import { machineFrame, type MachineShape } from './machine-shape';
import { KV_VERT } from './norme-vert';
import type { MachineSupport } from './support';

/** A maker's bedplate with the diverting pulley: its code, mass, heights and the spacing of the rope drops it takes. */
export interface MakerBedplate {
  brand: string;
  model: string;
  code: string;
  /** bedplate, pulley and dampers [kg] */
  mass: number;
  /** the pulley diameters it takes; null: not stated */
  dt: readonly number[] | null;
  pulleyAxis: number;
  sheaveAxis: number;
  /** the top of its beams, where the machine's seat stands */
  top: number;
  /** the spacing of the two rope drops, from the sheave's car side to the pulley's far side, it takes */
  fall: { min: number | null; max: number };
  length: number;
  width: number;
  src: string;
}

/** Where the pulley turns and what holds it. */
export interface RinvioFrame {
  /** in the machine's bedplate, or on its own stand on the floor when another support carries the machine */
  on: 'frame' | 'stand';
  pulleyAxis: number;
  /** the bedplate's top over the floor; 0 on a stand */
  top: number;
  /** a maker's machine on the maker's bedplate: the height of its seat under its feet (the sheave's axis is the maker's);
   *  null: our bedframe as on every support (machine-shape.ts) */
  bed: number | null;
  maker: MakerBedplate | null;
  /** the calculation took its h from here (the pulley's distance automatic): a change of h is a change of the bedplate */
  auto?: boolean;
}

/** The pulley's axis over the floor: the makers' height, its rim at least KV_VERT.rinvioRim over the floor. */
export const rinvioAxisOf = (Dp: number): number => Math.max(KV_VERT.rinvioAxis, Dp / 2 + KV_VERT.rinvioRim);

/** Our bedplate's top over the floor: the pulley under its beams. */
export const rinvioTopOf = (Dp: number): number => Math.max(KV_VERT.rinvioTop, rinvioAxisOf(Dp) + Dp / 2 + KV_VERT.rinvioOver);

/** The pulley's place for the support `sup` (the bedplate with the pulley, or another one), the pulley Dp, the maker's
 *  bedplate when the machine has one and `yWheel`, the maker's machine's sheave axis over its feet (null: the machine
 *  is drawn as the generic one, the maker's heights still count). A height set by hand makes the bedplate ours. */
export function rinvioFrame(sup: MachineSupport, Dp: number, maker: MakerBedplate | null, yWheel: number | null): RinvioFrame {
  if (sup.kind !== 'rinvio') return { on: 'stand', pulleyAxis: rinvioAxisOf(Dp), top: 0, bed: null, maker: null };
  const seat = maker && yWheel !== null ? maker.sheaveAxis - maker.top - yWheel : null;
  if (maker && sup.height === undefined && (seat === null || seat >= 0)) return { on: 'frame', pulleyAxis: maker.pulleyAxis, top: maker.top, bed: seat, maker };
  return { on: 'frame', pulleyAxis: rinvioAxisOf(Dp), top: sup.height ?? rinvioTopOf(Dp), bed: null, maker: null };
}

/** The sheave's axis over the floor with the machine on the bedplate `rf`: the maker's, or our top and the machine's own
 *  height over it (machine-shape.ts). */
export const sheaveAxisIn = (rf: RinvioFrame, D: number, shape: MachineShape | null): number =>
  (rf.maker ? rf.maker.sheaveAxis : rf.top + machineFrame(D, shape, rf.bed).axis);

/** Along the drop line, from the sheave's centre: where the bedplate runs, past the machine's bedframe [x0, x1] and the
 *  pulley at `pu` (radius r) by KV_VERT.rinvioOverhang. */
export const rinvioSpan = (x0: number, x1: number, pu: number, r: number): readonly [number, number] =>
  [Math.min(x0, pu - r) - KV_VERT.rinvioOverhang, Math.max(x1, pu + r) + KV_VERT.rinvioOverhang];
