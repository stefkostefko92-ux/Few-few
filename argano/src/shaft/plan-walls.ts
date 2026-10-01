// The walls of a plan of the shaft, where they stand at its level (head.ts: in the headroom of an old building they may
// stand elsewhere than at the main floor): the concrete ring cut by the landing door openings of the level, thinner
// behind the niches that run its whole height, its inner face round them, the lamps' recesses and the trunking's
// chase, the jambs of the openings. Coordinates along a wall are the plan's own (x on the front and rear walls, y on
// the side ones), so doors and niches keep their places whichever box the walls stand on.
import { path, type Entity, type Pt } from '../drawing';
import { mainBox, type WallBox } from './head';
import { KV } from './norme';
import { chasesOn, nichesOf } from './niche';
import type { DoorLayout, Layout, Wall } from './types';

/** Model point of (u along the wall, v into the shaft from its face), the walls standing on `box`. */
export function onWall(L: Layout, w: Wall, u: number, v: number, box: WallBox = mainBox(L.inputs)): Pt {
  return w === 'front' ? [u, box.y0 + v] : w === 'rear' ? [u, box.y1 - v] : w === 'left' ? [box.x0 + v, u] : [box.x1 - v, u];
}

export const quad = (L: Layout, w: Wall, u0: number, v0: number, u1: number, v1: number, box?: WallBox): Pt[] =>
  [onWall(L, w, u0, v0, box), onWall(L, w, u1, v0, box), onWall(L, w, u1, v1, box), onWall(L, w, u0, v1, box)];

/** Where a wall's inner face runs along it: [start, end] in its own u. */
const extent = (w: Wall, b: WallBox): readonly [number, number] => (w === 'front' || w === 'rear' ? [b.x0, b.x1] : [b.y0, b.y1]);

/** The inner face of the shaft walls, round the niches that run their whole height: clockwise from the front-left
 *  corner, each wall walked along its axis or back. */
export function innerFace(L: Layout, box: WallBox = mainBox(L.inputs)): Pt[] {
  const out: Pt[] = [];
  const walk = (w: Wall, back: boolean): void => {
    const [lo, hi] = extent(w, box), ns = chasesOn(L.inputs, w).filter((n) => n.at >= lo - 0.5 && n.at + n.width <= hi + 0.5).sort((a, b) => (back ? b.at - a.at : a.at - b.at));
    const [start, end] = back ? [hi, lo] : [lo, hi];
    out.push(onWall(L, w, start, 0, box));
    for (const n of ns) {
      const [a, b] = back ? [n.at + n.width, n.at] : [n.at, n.at + n.width];
      out.push(onWall(L, w, a, 0, box), onWall(L, w, a, -n.depth, box), onWall(L, w, b, -n.depth, box), onWall(L, w, b, 0, box));
    }
    out.push(onWall(L, w, end, 0, box));
  };
  walk('front', false);
  walk('right', false);
  walk('rear', true);
  walk('left', true);
  // corners appear twice where the walls meet, and the walk ends where it started
  const same = (p: Pt, q: Pt): boolean => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;
  const pts = out.filter((p, i) => i === 0 || !same(p, out[i - 1]));
  return pts.length > 1 && same(pts[0], pts[pts.length - 1]) ? pts.slice(0, -1) : pts;
}

/** Concrete ring around the shaft standing on `box`, cut by the openings of the landing doors `open` and thinner
 *  behind the niches that run its whole height; its inner face goes round them. */
export function walls(L: Layout, open: readonly DoorLayout[], box: WallBox = mainBox(L.inputs)): Entity[] {
  const T = L.inputs.wall, out: Entity[] = [];
  const strip = (w: Wall): void => {
    const [lo, hi] = extent(w, box);
    const cuts = open.filter((d) => d.wall === w).map((d) => [d.u0 - KV.doorPortal, d.u1 + KV.doorPortal] as const);
    const recess = chasesOn(L.inputs, w);
    // the side walls run past the corners, the front and rear ones stop at them
    const ends = w === 'left' || w === 'right' ? [lo - T, hi + T] : [lo, hi];
    const us = [...new Set([...ends, ...cuts.flat(), ...recess.flatMap((n) => [n.at, n.at + n.width])])].filter((u) => u >= ends[0] && u <= ends[1]).sort((a, b) => a - b);
    // runs of the same wall face: open (null) or the face's depth behind the inner face
    let run: { u0: number; u1: number; v: number | null } | null = null;
    const flush = (): void => {
      if (run && run.v !== null && run.v > -T && run.u1 - run.u0 > 0.5) out.push(path(quad(L, w, run.u0, run.v, run.u1, -T, box), true, 'wall', 'concrete'));
    };
    for (let i = 0; i + 1 < us.length; i++) {
      const a = us[i], b = us[i + 1], mid = (a + b) / 2;
      const v = cuts.some(([c0, c1]) => mid > c0 && mid < c1) ? null : -(recess.find((n) => mid > n.at && mid < n.at + n.width)?.depth ?? 0);
      if (run && run.v === v) run.u1 = b;
      else {
        flush();
        run = { u0: a, u1: b, v };
      }
    }
    flush();
  };
  for (const w of ['front', 'rear', 'left', 'right'] as const) strip(w);
  out.push(path(innerFace(L, box), true, 'wall'));
  // the lamps' recesses are above the cut: dashed, with the lamp; the trunking in its chase
  for (const n of nichesOf(L.inputs)) {
    const c = onWall(L, n.wall, n.at + n.width / 2, -n.depth / 2, box);
    if (n.use === 'light') {
      out.push(path([onWall(L, n.wall, n.at, 0, box), onWall(L, n.wall, n.at, -n.depth, box), onWall(L, n.wall, n.at + n.width, -n.depth, box), onWall(L, n.wall, n.at + n.width, 0, box)], false, 'hidden'));
      out.push({ e: 'mark', at: c, sym: 'light' });
    } else if (n.use === 'duct') {
      const hw = Math.min(50, n.width / 2 - 10), d = Math.min(60, n.depth - 10);
      if (hw > 5 && d > 5) out.push(path(quad(L, n.wall, n.at + n.width / 2 - hw, -n.depth, n.at + n.width / 2 + hw, -n.depth + d, box), true, 'thin', 'steel'));
    }
  }
  // jambs of the openings: along the reveal and returning on the outer face
  for (const d of open) {
    for (const [u, s] of [[d.u0 - KV.doorPortal, -1], [d.u1 + KV.doorPortal, 1]] as const) {
      out.push(path([onWall(L, d.wall, u, 0, box), onWall(L, d.wall, u, -T, box), onWall(L, d.wall, u + s * 60, -T, box)], false, 'jamb'));
    }
  }
  return out;
}
