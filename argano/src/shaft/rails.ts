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

/** Designation as written on the drawings, e.g. "T 70x70x8" or "T89/B". */
export const railLabel = (t: RailType): string => (RAILS[t].iso ? t : `T ${t.slice(1)}`);
