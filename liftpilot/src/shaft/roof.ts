// The car roof in plan: where the refuge space of the type chosen fits (UNI EN 81-20:2020, 5.2.5.7.1, Tabella 3) and
// where the place to stand is drawn. The crosshead of a central sling runs across the roof over the rails' axis: where
// its underside is lower than the refuge's height, the refuge stands wholly in front of it or behind it; the operators of
// the car doors take a strip of the roof on the side of their entrance (registry spazi.tetto.arcata). The check (h_stand,
// section.ts) and the drawing (plan-view.ts) take the same place. Pure.
import type { Box } from '../drawing';
import { KV_VERT } from './norme-vert';
import type { Layout } from './types';
import type { VerticalInputs } from './vertical';

/** The place to stand on the car roof, across and along the car [mm]: as set, else as drawn by default. */
export const standOf = (V: VerticalInputs): readonly [number, number] => [V.standW ?? KV_VERT.standDrawn[0], V.standD ?? KV_VERT.standDrawn[1]];

export interface RoofRefuge {
  /** the least margin of the refuge's plan in the best free part of the roof, either way round [mm]: negative when it
   *  fits nowhere */
  fit: number;
  /** the refuge drawn in that part, at its back on the right; the place to stand at its back on the left */
  refuge: Box;
  free: Box;
}

/** The free parts of the roof [mm]: the roof less the operators' strips, split by the crosshead when it is lower than
 *  the refuge's height over the roof. */
export function roofParts(L: Layout): Box[] {
  const c = L.car, V = L.inputs.vertical, K = KV_VERT, op = K.roofOperator;
  const walls = new Set(L.doors.map((d) => d.wall));
  const x0 = c.x + (walls.has('left') ? op : 0), x1 = c.x + c.w - (walls.has('right') ? op : 0);
  const y0 = c.y + (walls.has('front') ? op : 0), y1 = c.y + c.h - (walls.has('rear') ? op : 0);
  const low = V.frameTop - K.crossheadH - V.carOutH < K.refugeH[V.topRefuge];
  if (L.frame.kind !== 'central' || !low) return [{ x0, y0, x1, y1 }];
  const a = L.frame.axis - K.crossheadHalf, b = L.frame.axis + K.crossheadHalf;
  // behind the crosshead first: the side away from the entrance, where the drawing puts the refuge
  return [{ x0, y0: Math.max(y0, b), x1, y1 }, { x0, y0, x1, y1: Math.min(y1, a) }];
}

/** The refuge on the car roof: the best part for its plan, either way round, and where it is drawn. */
export function roofRefuge(L: Layout): RoofRefuge {
  const V = L.inputs.vertical, [w, d] = KV_VERT.refugePlan[V.topRefuge], [sw, sd] = standOf(V);
  const margin = (p: Box): number => {
    const W = p.x1 - p.x0, D = p.y1 - p.y0;
    return Math.max(Math.min(W - w, D - d), Math.min(W - d, D - w));
  };
  const parts = roofParts(L);
  let best = parts[0] ?? { x0: L.car.x, y0: L.car.y, x1: L.car.x + L.car.w, y1: L.car.y + L.car.h };
  for (const p of parts) if (margin(p) > margin(best) + 1e-9) best = p;
  const fit = margin(best);
  // drawn as before (the long side along the depth when it fits so), 60 mm in from the part's edges where there is room
  const along = Math.min(best.x1 - best.x0 - w, best.y1 - best.y0 - d) >= Math.min(best.x1 - best.x0 - d, best.y1 - best.y0 - w);
  const [rw, rd] = along ? [w, d] : [d, w];
  const gx = Math.max(0, Math.min(60, best.x1 - best.x0 - rw)), gy = Math.max(0, Math.min(60, best.y1 - best.y0 - rd));
  const refuge = { x0: best.x1 - gx - rw, y0: Math.max(best.y0, best.y1 - gy - rd), x1: best.x1 - gx, y1: best.y1 - gy };
  const free = { x0: best.x0 + 60, y0: Math.max(best.y0, best.y1 - gy - sd), x1: best.x0 + 60 + sw, y1: best.y1 - gy };
  return { fit, refuge, free };
}
