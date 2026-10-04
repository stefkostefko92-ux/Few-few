// Small outlines the plan draws Panev's brackets with: a slot with round ends, a hexagonal bolt head, and the parts of a
// bracket under the rail and over it. Pure.
import type { Entity } from '../drawing';

/** A slot from a to b (its centres), w wide, as a closed outline in the frame of a and b. */
export function slot(a: readonly [number, number], b: readonly [number, number], w: number): [number, number][] {
  const r = w / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, out: [number, number][] = [];
  for (const [c, a0] of [[b, -Math.PI / 2], [a, Math.PI / 2]] as const) {
    for (let i = 0; i <= 6; i++) {
      const t = Math.atan2(uy, ux) + a0 + (i / 6) * Math.PI;
      out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
  }
  return out;
}

/** A hexagon of circumradius r round (x, y), a flat side along x. */
export const hex = (x: number, y: number, r: number): [number, number][] => Array.from({ length: 6 }, (_, i) => [x + r * Math.cos((i * Math.PI) / 3), y + r * Math.sin((i * Math.PI) / 3)]);

/** A bracket's parts under the rail and over it (the clips on the foot's edges). */
export interface BracketPlan {
  under: Entity[];
  over: Entity[];
}

/** M10 bolt head's circumradius, wall anchors' width [mm]. */
export const HEAD = 9.8, ANCHOR = 12;
