// Boxes and placement: a view maps model millimetres to paper millimetres by scale and translation (no rotation).
import type { Box, Pt } from './types';

export const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
export const boxW = (b: Box): number => b.x1 - b.x0;
export const boxH = (b: Box): number => b.y1 - b.y0;
export const centre = (b: Box): Pt => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

export function union(a: Box | null, b: Box): Box {
  return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b;
}

export function boundsOf(pts: readonly Pt[]): Box {
  let b: Box | null = null;
  for (const [x, y] of pts) b = union(b, { x0: x, y0: y, x1: x, y1: y });
  return b ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
}

export const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });

/** Model → paper: paper = origin + model / scale. */
export interface Place {
  /** scale denominator: 20 means 1:20 */
  scale: number;
  /** paper point of the model origin */
  ox: number;
  oy: number;
}

export const toPaper = (p: Place, [x, y]: Pt): Pt => [p.ox + x / p.scale, p.oy + y / p.scale];

/** Placement that puts the centre of `model` at the paper point `at`. */
export function placeAt(model: Box, scale: number, at: Pt): Place {
  const [cx, cy] = centre(model);
  return { scale, ox: at[0] - cx / scale, oy: at[1] - cy / scale };
}

export const rectPts = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
