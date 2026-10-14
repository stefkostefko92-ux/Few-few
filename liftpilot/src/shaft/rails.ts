// T guide rails: the machined profiles of ISO 7465 and the plain T sections of older installations, with the sizes
// the drawings need (foot width b, height h, blade thickness k) and the mass per metre the building loads need.
// Registry: ingombri.guide (src/shaft/norme.ts).

export const RAIL_TYPES = ['T45/A', 'T50/A', 'T70-1/A', 'T75-3/B', 'T82/B', 'T89/B', 'T90/B', 'T114/B', 'T125/B', 'T127-1/B', 'T45x45x5', 'T70x70x8'] as const;
export type RailType = (typeof RAIL_TYPES)[number];

export interface RailSize {
  /** foot width, height, blade thickness [mm] */
  b: number;
  h: number;
  k: number;
  /** mass per metre [kg/m] */
  q: number;
  /** machined profile (ISO 7465, now ISO 8100-33), or a hot-rolled tee of an existing installation (EN 10055) */
  iso: boolean;
}

export const RAILS: Readonly<Record<RailType, RailSize>> = {
  'T45/A': { b: 45, h: 45, k: 5, q: 3.34, iso: true },
  'T50/A': { b: 50, h: 50, k: 5, q: 3.73, iso: true },
  'T70-1/A': { b: 70, h: 65, k: 9, q: 7.4, iso: true },
  'T75-3/B': { b: 75, h: 62, k: 10, q: 8.63, iso: true },
  'T82/B': { b: 82.5, h: 68.25, k: 9, q: 8.55, iso: true },
  'T89/B': { b: 89, h: 62, k: 15.88, q: 12.3, iso: true },
  'T90/B': { b: 90, h: 75, k: 16, q: 13.7, iso: true },
  'T114/B': { b: 114, h: 89, k: 16, q: 16.4, iso: true },
  'T125/B': { b: 125, h: 82, k: 16, q: 17.9, iso: true },
  'T127-1/B': { b: 127, h: 88.9, k: 15.88, q: 17.9, iso: true },
  'T45x45x5': { b: 45, h: 45, k: 5, q: 3.34, iso: false },
  'T70x70x8': { b: 70, h: 70, k: 8, q: 8.32, iso: false },
};

/** A rail's section for the check of UNI EN 81-50:2020, 5.10: area [mm²], second moments [mm⁴] and the least
 *  section moduli [mm³] about the axis parallel to the foot (x: Fy bends the blade over it) and the axis of symmetry (y:
 *  Fx), the thickness c of the neck between the blade and the foot [mm]. The radii of gyration are √(I/A): ISO 7465:2007
 *  printed T127-1/B's wrong (its section moduli), ISO 8100-33:2022 corrected them. */
export interface RailSection {
  A: number;
  Ix: number;
  Wx: number;
  Iy: number;
  Wy: number;
  c: number;
}

// ISO 7465:2007 as Savera prints it (Standard Savera Guide, Rev 03/10; the axes and c from its Rev 08.26): A [cm²], Ix,
// Iy [cm⁴], Wx, Wy [cm³] and c [mm]; T45/A and T50/A have a flat foot as thick as the blade. The hot-rolled tee T 70×70×8
// from EN 10055:1995, Table 1 (c its web); EN 10055 has no T 45, so T 45×45×5 takes T45/A's section (the same sizes).
const cm = (A: number, Ix: number, Wx: number, Iy: number, Wy: number, c: number): RailSection =>
  ({ A: A * 100, Ix: Ix * 1e4, Wx: Wx * 1e3, Iy: Iy * 1e4, Wy: Wy * 1e3, c });
const T45A = cm(4.25, 8.08, 2.53, 3.84, 1.71, 5);
export const RAIL_SECTIONS: Readonly<Record<RailType, RailSection>> = {
  'T45/A': T45A,
  'T50/A': cm(4.75, 11.24, 3.15, 5.25, 2.1, 5),
  'T70-1/A': cm(9.4, 40.95, 9.169, 18.86, 5.389, 6),
  'T75-3/B': cm(10.91, 40.29, 9.286, 26.47, 7.06, 8),
  'T82/B': cm(10.91, 49.31, 10.27, 30.17, 7.358, 7.5),
  'T89/B': cm(15.77, 59.83, 14.35, 52.41, 11.78, 10),
  'T90/B': cm(17.25, 102, 20.86, 52.48, 11.66, 10),
  'T114/B': cm(20.89, 179.3, 29.7, 108.6, 19.05, 9.5),
  'T125/B': cm(22.82, 151, 26.16, 159.1, 25.46, 10),
  'T127-1/B': cm(22.74, 187.9, 30.65, 149.9, 23.61, 10),
  'T45x45x5': T45A,
  'T70x70x8': cm(10.6, 44.5, 8.79, 22.1, 6.32, 8),
};

/** The least radius of gyration of a rail's section [mm]. */
export const iMin = (S: RailSection): number => Math.sqrt(Math.min(S.Ix, S.Iy) / S.A);

/** The fishplate at a joint of two lengths: its length, the rows of bolts at ± each distance from the joint, the
 *  holes ± across/2 from the rail's axis, its thickness and the bolts' size [mm]. */
export interface Fishplate {
  l: number;
  rows: readonly number[];
  across: number;
  t: number;
  bolt: 8 | 12;
}

// ISO 7465 tables as the makers print them (fishplates of T45/A and T50/A: suppliers' ISO 7465 / GB/T 22562 sheets;
// T70-1/A, T75-3/B, RP82, RP89, RP90: Monteferro), 8 bolts each; the rows' distances read from the joint. Not in
// those tables, and so taken from a neighbour: T75-3/B's rows (T70-1/A's), the plates over T90 (RP89's), the holes'
// spacing across T75 and up (the middle of the foot's flanges); the hot-rolled tees take the plates of their size.
const T70_PLATE: Fishplate = { l: 250, rows: [25, 105], across: 42, t: 10, bolt: 12 };
const T89_PLATE: Fishplate = { l: 305, rows: [38.1, 114.3], across: 52, t: 17.5, bolt: 12 };
export const FISHPLATES: Readonly<Record<RailType, Fishplate>> = {
  'T45/A': { l: 160, rows: [15, 65], across: 25, t: 8, bolt: 8 },
  'T50/A': { l: 200, rows: [25, 75], across: 30, t: 8, bolt: 8 },
  'T70-1/A': T70_PLATE,
  'T75-3/B': { ...T70_PLATE, l: 240, rows: [25, 100], across: 43 },
  'T82/B': { l: 216, rows: [27, 81], across: 46, t: 10, bolt: 12 },
  'T89/B': T89_PLATE,
  'T90/B': { ...T89_PLATE, t: 19 },
  'T114/B': { ...T89_PLATE, across: 66, t: 19 },
  'T125/B': { ...T89_PLATE, across: 71, t: 19 },
  'T127-1/B': { ...T89_PLATE, across: 71, t: 19 },
  'T45x45x5': { l: 160, rows: [15, 65], across: 25, t: 8, bolt: 8 },
  'T70x70x8': T70_PLATE,
};

/** The forged clip that holds a rail's foot on a bracket (Donati n° 1–4, by the foot's width): its bolt, width and
 *  length; where its shank stands and how far the clip on its plate reaches past the foot's edge [mm]. */
export interface RailClip {
  bolt: number;
  width: number;
  length: number;
  shank: number;
  reach: number;
}

const CLIPS = [[50, 10, 22, 32], [75, 12, 26, 39], [90, 14, 29, 45], [Infinity, 16, 34, 50]] as const;

/** The clip of a rail: the shank at 11/36 of its length past the foot's edge, the heel 16,5/36 beyond (the proportions
 *  of the N1 clip on Panev's drawings), the plate 2 mm past the heel. */
export function railClip(t: RailType): RailClip {
  const [, bolt, width, length] = CLIPS.find(([upTo]) => RAILS[t].b <= upTo) ?? CLIPS[CLIPS.length - 1];
  const shank = (11 / 36) * length;
  return { bolt, width, length, shank, reach: shank + (16.5 / 36) * length + 2 };
}

/** A generic rail bracket (when not Panev's): the plate behind the foot, the flange of its angles, the plate on the wall
 *  [mm thick]; up to `onePiece` from the wall one piece, beyond it two angles bolted together (components/lift3d/railfix.ts
 *  builds it, plan-staffe.ts draws it). */
export const GENERIC_BRACKET = { plate: 10, flange: 8, wallPlate: 12, onePiece: 150 } as const;

/** Designation as written on the drawings, e.g. "T 70x70x8" or "T89/B". */
export const railLabel = (t: RailType): string => (RAILS[t].iso ? t : `T ${t.slice(1)}`);
