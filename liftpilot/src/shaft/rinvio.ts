// The diverting pulley of a machine above the shaft, in the machine room and never in the shaft (registry
// locale.rinvio). It turns in the machine's bedplate — legs on dampers, beams at the top under the irons of the machine's
// bedframe that carry it (bedplateBeams), the pulley hung between them — or, with another support chosen for the
// machine, on its own stand on the room's floor.
// Ours is drawn after the makers' bedplates (SICOR XTE3022, XTE6026: the pulley's axis 320 mm over the floor, the top
// 736 mm); a maker's own, when the machine is one of its models with a bedplate in the catalogue
// (src/lib/catalog/bedplates.ts), gives its heights, its code and the rope drops it takes. Millimetres over the room's
// floor, along the rope drop line from the sheave's centre. Pure.
import type { MachineSpec, RoomGeo } from './machine-room';
import { IRON, machineFrame, type MachineShape } from './machine-shape';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { ropeWidths } from './ropes';
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
  /** its length along the drop line and width across, and the sheave's axis from its end on the car's side */
  length: number;
  width: number;
  axisAt: number;
  src: string;
}

/** Where the pulley turns and what holds it. */
export interface RinvioFrame {
  /** in the machine's bedplate, or on its own stand on the floor when another support carries the machine */
  on: 'frame' | 'stand';
  pulleyAxis: number;
  /** the bedplate's top over the floor; 0 on a stand */
  top: number;
  /** what stands under the maker's machine's feet over the bedplate's top: nothing on ours (0: the feet bolted on its
   *  irons — the generic machine on its own bedplate), the maker's pedestal on the maker's (the sheave's axis is the
   *  maker's); null on a stand: another support carries the machine, on our bedframe (machine-shape.ts) */
  bed: number | null;
  maker: MakerBedplate | null;
  /** the calculation took its h from here (the pulley's distance automatic): a change of h is a change of the bedplate */
  auto?: boolean;
  /** what the bedplate or the stand stands on over the floor: the HEB beams' height (0: the floor); the heights above
   *  count it */
  base?: number;
}

/** The pulley's axis over the floor: the makers' height, its rim at least KV_VERT.rinvioRim over the floor. */
export const rinvioAxisOf = (Dp: number): number => Math.max(KV_VERT.rinvioAxis, Dp / 2 + KV_VERT.rinvioRim);

/** Our bedplate's top over the floor: the pulley under its beams. */
export const rinvioTopOf = (Dp: number): number => Math.max(KV_VERT.rinvioTop, rinvioAxisOf(Dp) + Dp / 2 + KV_VERT.rinvioOver);

/** The pulley's place for the support `sup` (the bedplate with the pulley, or another one), the pulley Dp, the maker's
 *  bedplate when the machine has one and `yWheel`, the maker's machine's sheave axis over its feet (null: the machine
 *  is drawn as the generic one, the maker's heights still count). A height set by hand makes the bedplate ours. */
export function rinvioFrame(sup: MachineSupport, Dp: number, maker: MakerBedplate | null, yWheel: number | null, base = 0): RinvioFrame {
  // over the floor, or over the HEB beams (the frame's own heights unchanged, every height over the floor raised)
  const on = (rf: RinvioFrame): RinvioFrame => (base ? { ...rf, pulleyAxis: rf.pulleyAxis + base, top: rf.top + base, base } : rf);
  if (sup.kind !== 'rinvio') return on({ on: 'stand', pulleyAxis: rinvioAxisOf(Dp), top: 0, bed: null, maker: null });
  const seat = maker && yWheel !== null ? maker.sheaveAxis - maker.top - yWheel : null;
  if (maker && sup.height === undefined && (seat === null || seat >= 0)) return on({ on: 'frame', pulleyAxis: maker.pulleyAxis, top: maker.top, bed: seat, maker });
  return on({ on: 'frame', pulleyAxis: rinvioAxisOf(Dp), top: sup.height ?? rinvioTopOf(Dp), bed: 0, maker: null });
}

/** The sheave's axis over the bedplate's top [mm]: on ours the maker's machine with its feet on the irons (the generic
 *  one on its own bedplate), on the maker's its pedestal (`bed`) and the machine (machine-shape.ts). */
export const axisOverTop = (D: number, shape: MachineShape | null, bed: number | null = 0): number => machineFrame(D, shape, bed).axis;

/** The sheave's axis over the floor with the machine on the bedplate `rf`: the maker's, or our top and the machine's own
 *  height over it. */
export const sheaveAxisIn = (rf: RinvioFrame, D: number, shape: MachineShape | null): number =>
  (rf.maker ? rf.maker.sheaveAxis + (rf.base ?? 0) : rf.top + axisOverTop(D, shape, rf.bed));

/** Along the drop line, from the sheave's centre: where the bedplate runs, past the machine's bedframe [x0, x1] and the
 *  pulley at `pu` (radius r) by KV_VERT.rinvioOverhang. */
export const rinvioSpan = (x0: number, x1: number, pu: number, r: number): readonly [number, number] =>
  [Math.min(x0, pu - r) - KV_VERT.rinvioOverhang, Math.max(x1, pu + r) + KV_VERT.rinvioOverhang];

/** A maker's bedplate along the drop line from the sheave's axis: its catalogue length from its end on the car's side
 *  (the pulley on the counterweight's, as the maker builds it) [mm]. */
export const makerRun = (mk: MakerBedplate): readonly [number, number] => [-mk.axisAt, mk.length - mk.axisAt];

/** Along the drop line: where the bedplate runs [u0, u1] (absolute u, as the room's drawings measure it) — a maker's as
 *  long as it is made (a machine or a pulley past its ends is the check m_bedplate's), ours past the machine and the
 *  pulley. */
export function rinvioRun(M: MachineSpec, G: RoomGeo): readonly [number, number] {
  const mk = M.rinvio?.on === 'frame' ? M.rinvio.maker : null;
  if (!mk) return rinvioSpan(G.frame0, G.frame1, G.pulleyAt, M.Dp / 2);
  const [a, b] = makerRun(mk);
  return [G.sheaveAt + a, G.sheaveAt + b];
}

/** Across the machine, in its own frame (z, machine-shape.ts): the bedplate under the irons `beams` of the machine's
 *  bedframe — its side beams under the outer irons, as wide as that or at least `width` (the maker's, else ours: then
 *  centred on them), and the irons no side beam carries (its flange off theirs), each on a beam of its own between them
 *  end to end. The pulley and the ropes go down between the second iron and the third (machineFrame). [mm] */
export function bedplateBeams(beams: readonly number[], width: number): { edges: readonly [number, number]; inner: number[] } {
  const b = PROFILES[KV_VERT.rinvioBeam].b, lo = Math.min(...beams) - b / 2, hi = Math.max(...beams) + b / 2, c = (lo + hi) / 2;
  const edges: readonly [number, number] = hi - lo >= width ? [lo, hi] : [c - width / 2, c + width / 2];
  const sides = [edges[0] + b / 2, edges[1] - b / 2];
  return { edges, inner: beams.filter((z) => sides.every((s) => Math.abs(z - s) >= (b + IRON) / 2)) };
}

/** Across the drop line: where the bedplate runs [v0, v1] (bedplateBeams; v as machine-room.ts machineV). */
export function rinvioAcross(G: RoomGeo, rf: RinvioFrame): readonly [number, number] {
  const F = G.frame, [a, b] = bedplateBeams(F.beams, rf.maker?.width ?? KV_VERT.rinvioWidth).edges.map((z) => G.dir * (F.zSheave - z));
  return [Math.min(a, b), Math.max(a, b)];
}

/** Where the legs of the bedplate stand (drop-line axes u, v) [mm]: at its corners — or, ours bridging the HEB beams
 *  `lay` (heb.ts: the beams cross it), where each of its sides crosses each beam's axis, so every leg stands on a beam's
 *  flange and the bedplate runs past them; the maker's where the maker puts them. Its sides first, each from its car end. */
export function bedplateLegs(G: RoomGeo, M: MachineSpec, lay: { dir: 'x' | 'y'; at: readonly [number, number]; bridge: boolean } | null): [number, number][] {
  const rf = M.rinvio;
  if (rf?.on !== 'frame') return [];
  const [u0, u1] = rinvioRun(M, G), [v0, v1] = rinvioAcross(G, rf), h = KV_VERT.rinvioLeg / 2, sides = [v0 + h, v1 - h];
  if (!lay?.bridge || rf.maker) return sides.flatMap((v) => [u0 + h, u1 - h].map((u): [number, number] => [u, v]));
  // a beam's axis is a line of constant y (beams along x) or x; a point of the side v at u: carDrop + u·(ux, uy) + v·(−uy, ux)
  const k = lay.dir === 'x' ? 1 : 0, du = k ? G.uy : G.ux, dv = k ? G.ux : -G.uy;
  return sides.flatMap((v) => lay.at.map((c): [number, number] => [(c - G.carDrop[k] - v * dv) / du, v]).sort((a, b) => a[0] - b[0]));
}

/** Where the diverting pulley stands where it may not (one rule for the full project and the replacement): under the
 *  room's floor ('floor'), or in the bedplate up over its top into the machine standing on it ('machine': an h or a
 *  bedplate's height set by hand) — the pulley stays under the bedplate's beams or between them; null where it is right. */
export function rinvioClash(G: RoomGeo | null, M: MachineSpec): 'floor' | 'machine' | null {
  const rf = M.rinvio ?? null, r = M.Dp / 2;
  if (!G || !rf || M.Dp <= 0) return null;
  if (G.pulleyZ - r < 0) return 'floor';
  return rf.on === 'frame' && G.pulleyAt + r > G.frame0 && G.pulleyAt - r < G.frame1 && G.pulleyZ + r > rf.top ? 'machine' : null;
}

/** The pulley's own stand on the floor (another support carries the machine): its ends along the drop line and across,
 *  as the room's drawings draw it. */
export function standBox(M: MachineSpec, G: RoomGeo): readonly [number, number, number, number] {
  const r = M.Dp / 2, half = ropeWidths(M.n, M.d).pulley;
  return [G.pulleyAt - r - 110, -half - 40, G.pulleyAt + r + 110, half + 40];
}
