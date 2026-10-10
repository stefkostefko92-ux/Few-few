// A code written in the thickness of a shaft wall, along it (the articles of a rail's brackets on a plan:
// plan-staffe.ts, plan-car-brackets.ts): from a point along the wall toward the side asked; where that covers the
// lettering already in the walls, from the point the other way while it stays along the wall, else a line further out
// (its height and 0,6 mm; at most two) — the plans' lettering taken at the plan's scale (never under 1:25: tag-place.ts
// kOf), 0,6 mm apart. Model millimetres. Pure.
import { letterSize, textWidth, type Box, type Entity } from '../drawing';
import type { WallBox } from './head';
import { onWall } from './plan-walls';
import { TAG_SCALE, kOf, letteringBoxes } from './tag-place';
import type { Layout, Wall } from './types';

/** The paper between two letterings in a wall [mm]: half of it round each. */
const GAP = 0.6;

export interface WallLabel {
  wall: Wall;
  /** where it starts along the wall (`shift` past it, toward the side it runs to) [mm of the wall's u] */
  u: number;
  shift?: number;
  text: string;
  size: number;
  /** toward the wall's higher u as a rule */
  up: boolean;
}

/** The lettering of `w` on the walls standing on `box`, clear of `inWalls` where it can be, on a plan drawn at `scale`. */
export function wallLabel(L: Layout, w: WallLabel, inWalls: readonly Entity[], box: WallBox, scale: number = TAG_SCALE): Entity {
  const K = kOf(scale), T = L.inputs.wall, along = w.wall === 'front' || w.wall === 'rear', [lo, hi] = along ? [box.x0, box.x1] : [box.y0, box.y1], shift = w.shift ?? 0;
  const at = (line: number, up: boolean): Entity => ({ e: 'text', at: onWall(L, w.wall, w.u + (up ? shift : -shift), -T / 2 - line * (1.3 * letterSize(w.size) + GAP) * K, box),
    text: w.text, size: w.size, align: up ? 'l' : 'r', halo: true, angle: along ? 0 : 90 });
  // the other way only while the lettering stays along its wall
  const len = shift + textWidth(w.text, { size: letterSize(w.size), cond: true }) * K, fits = w.up ? w.u - len >= lo - T : w.u + len <= hi + T;
  const taken = letteringBoxes(inWalls, scale, GAP / 2), clear = (e: Entity): boolean => letteringBoxes([e], scale, GAP / 2).every((b) => !taken.some((t) => meets(b, t)));
  const tries = [0, 1, 2].flatMap((line) => [at(line, w.up), ...(fits ? [at(line, !w.up)] : [])]);
  return tries.find(clear) ?? at(1, w.up);
}

/** Two boxes that overlap. */
const meets = (a: Box, b: Box): boolean => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
