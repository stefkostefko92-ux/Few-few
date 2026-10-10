// The ways from the machine room's door (UNI EN 81-20:2020, 5.2.6.3.2.2: access routes to the free areas ≥ 0,50 m wide):
// a grid of square cells over the floor, each with its clearance — the distance from its centre to the nearest wall
// (the door's opening left out) or obstacle —, the widest way from the door to every cell and the walk to it. A way's
// width is twice the least clearance along it (a person as a disc moving through). Room axes as in room-floor.ts [mm].
// Pure.
import { WALLS, alongX, edgeDistance, insideQuad, isBox, wallBox, wallLength, type Box, type Outline } from './room-floor';
import type { RoomInputs } from './room';

// cells about CELL mm (no more than MAX_CELLS over the floor); a walk's steps across a cell and diagonally
const CELL = 20, MAX_CELLS = 90_000, STEP_ORTHO = 10, STEP_DIAG = 14;

/** The floor as cells: `nx` × `ny` of `sx` × `sy` mm, kept in a frame one cell wider all round that no way enters
 *  (clearance −1), so the cell (i, j) is at (j + 1)·`stride` + i + 1; the widest ways from the door, once asked. */
export interface Grid {
  R: RoomInputs;
  nx: number;
  ny: number;
  sx: number;
  sy: number;
  stride: number;
  clear: Int32Array;
  reach?: Int32Array;
}

/** The walls' inner faces, the door's opening left out, as flat rectangles. */
function wallFaces(R: RoomInputs): Box[] {
  const out: Box[] = [];
  for (const w of WALLS) {
    const len = wallLength(R, w), pieces = w === R.doorWall ? [[0, R.doorAt], [R.doorAt + R.doorW, len]] : [[0, len]];
    for (const [a, b] of pieces) if (Math.min(b, len) > Math.max(a, 0)) out.push(wallBox(R, w, Math.max(a, 0), Math.min(b, len) - Math.max(a, 0), 0, 0));
  }
  return out;
}

/** Each cell's clearance from `outlines`, at most what it has: the distance from its centre, negative inside (a turned
 *  outline: from its sides). */
function clearOf(g: Grid, outlines: readonly Outline[]): void {
  const { nx, ny, sx, sy, stride, clear } = g;
  for (const o of outlines) {
    if (isBox(o)) continue;
    for (let j = 0; j < ny; j++) {
      const py = (j + 0.5) * sy, row = (j + 1) * stride + 1;
      for (let i = 0; i < nx; i++) {
        const p = [(i + 0.5) * sx, py] as const, e = edgeDistance(p, o), c = Math.floor(insideQuad(p, o) ? -e : e);
        if (c < clear[row + i]) clear[row + i] = c;
      }
    }
  }
  for (const [x0, y0, x1, y1] of outlines.filter(isBox)) {
    for (let j = 0; j < ny; j++) {
      const py = (j + 0.5) * sy, dy = Math.max(y0 - py, py - y1), ey = dy > 0 ? dy : 0, row = (j + 1) * stride + 1;
      for (let i = 0; i < nx; i++) {
        const px = (i + 0.5) * sx, dx = Math.max(x0 - px, px - x1);
        const d = dx > 0 || dy > 0 ? Math.sqrt((dx > 0 ? dx * dx : 0) + ey * ey) : Math.max(dx, dy), c = Math.floor(d);
        if (c < clear[row + i]) clear[row + i] = c;
      }
    }
  }
}

// the last floor worked out: the panel's place and its checks ask for the same one
let last: { key: string; g: Grid } | null = null;

/** The floor of room `R` with the walls (the door's opening left out) and `obstacles`. */
export function grid(R: RoomInputs, obstacles: readonly Outline[]): Grid {
  const key = `${R.W},${R.D},${R.doorWall},${R.doorAt},${R.doorW}|${obstacles.map((b) => b.join(',')).join(';')}`;
  if (last?.key === key) return last.g;
  const cell = Math.max(CELL, Math.sqrt((R.W * R.D) / MAX_CELLS));
  const nx = Math.max(1, Math.round(R.W / cell)), ny = Math.max(1, Math.round(R.D / cell)), stride = nx + 2;
  const clear = new Int32Array(stride * (ny + 2)).fill(-1);
  for (let j = 0; j < ny; j++) clear.fill(2 ** 30, (j + 1) * stride + 1, (j + 1) * stride + 1 + nx);
  const g: Grid = { R, nx, ny, sx: R.W / nx, sy: R.D / ny, stride, clear };
  clearOf(g, [...wallFaces(R), ...obstacles]);
  last = { key, g };
  return g;
}

/** The cells whose centres lie in `b`, row by row: [first, last] of each. */
export function rowsIn(g: Grid, b: Box): [number, number][] {
  const i0 = Math.max(0, Math.ceil(b[0] / g.sx - 0.5)), i1 = Math.min(g.nx - 1, Math.floor(b[2] / g.sx - 0.5));
  const j0 = Math.max(0, Math.ceil(b[1] / g.sy - 0.5)), j1 = Math.min(g.ny - 1, Math.floor(b[3] / g.sy - 0.5)), out: [number, number][] = [];
  if (i1 >= i0) for (let j = j0; j <= j1; j++) out.push([(j + 1) * g.stride + i0 + 1, (j + 1) * g.stride + i1 + 1]);
  return out;
}

/** The cells of the room's edge in the door's opening: where a way in starts. */
function doorCells(g: Grid): number[] {
  const R = g.R, w = R.doorWall, out: number[] = [];
  for (const [a, b] of rowsIn(g, wallBox(R, w, R.doorAt, R.doorW, 0, alongX(w) ? g.sy : g.sx))) for (let k = a; k <= b; k++) out.push(k);
  return out;
}

const steps = (g: Grid): { next: Int32Array; cost: Int32Array } => {
  const W = g.stride;
  return { next: Int32Array.of(-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1), cost: Int32Array.of(STEP_ORTHO, STEP_ORTHO, STEP_ORTHO, STEP_ORTHO, STEP_DIAG, STEP_DIAG, STEP_DIAG, STEP_DIAG) };
};

/** For every cell, the largest clearance a way from the door to it keeps throughout (−1: none reaches it): the widest
 *  way, by levels from the highest down. */
export function reachOf(g: Grid): Int32Array {
  if (g.reach) return g.reach;
  const { clear } = g, best = new Int32Array(clear.length).fill(-1), levels: (number[] | undefined)[] = [], { next } = steps(g);
  let top = -1;
  for (const s of doorCells(g)) {
    const v = clear[s];
    if (v > best[s]) {
      best[s] = v;
      (levels[v] ??= []).push(s);
      top = Math.max(top, v);
    }
  }
  for (let v = top; v >= 0; v--) {
    const q = levels[v];
    if (!q) continue;
    for (let n = 0; n < q.length; n++) {
      const k = q[n];
      if (best[k] !== v) continue;
      for (let e = 0; e < 8; e++) {
        const m = k + next[e], c = clear[m] < v ? clear[m] : v;
        if (c > best[m]) {
          best[m] = c;
          (levels[c] ??= []).push(m);
        }
      }
    }
    levels[v] = undefined;
  }
  g.reach = best;
  return best;
}

/** For every cell, how far it is to walk from the door through cells at least `r` clear (in steps of 10 per cell
 *  across, 14 diagonally; −1: out of reach). */
export function walkOf(g: Grid, r: number): Int32Array {
  const { clear } = g, dist = new Int32Array(clear.length).fill(-1), levels: (number[] | undefined)[] = [], { next, cost } = steps(g);
  for (const s of doorCells(g)) {
    if (clear[s] < r || dist[s] === 0) continue;
    dist[s] = 0;
    (levels[0] ??= []).push(s);
  }
  for (let d = 0; d < levels.length; d++) {
    const q = levels[d];
    if (!q) continue;
    for (let n = 0; n < q.length; n++) {
      const k = q[n];
      if (dist[k] !== d) continue;
      for (let e = 0; e < 8; e++) {
        const m = k + next[e], to = d + cost[e];
        if (clear[m] < r || (dist[m] >= 0 && dist[m] <= to)) continue;
        dist[m] = to;
        (levels[to] ??= []).push(m);
      }
    }
    levels[d] = undefined;
  }
  return dist;
}

/** The largest of `values` over the cells in `b` (−1: none). */
export function bestIn(g: Grid, values: Int32Array, b: Box): number {
  let best = -1;
  for (const [a, z] of rowsIn(g, b)) for (let k = a; k <= z; k++) if (values[k] > best) best = values[k];
  return best;
}

/** The least of `values` not below 0 over the cells in `b` (−1: none). */
export function leastIn(g: Grid, values: Int32Array, b: Box): number {
  let least = -1;
  for (const [a, z] of rowsIn(g, b)) for (let k = a; k <= z; k++) if (values[k] >= 0 && (least < 0 || values[k] < least)) least = values[k];
  return least;
}

/** The width of the way from the door into `b` [mm]: twice the largest clearance of a way that reaches a point of it. */
export const widthTo = (g: Grid, b: Box): number => Math.max(0, 2 * bestIn(g, reachOf(g), b));

/** The width of the way from the door to each of `areas` past the walls and `obstacles` [mm] (5.2.6.3.2.2), measured
 *  on the grid — by defect, by up to about the size of a cell; 0 when there is none. */
export function routeWidths(R: RoomInputs, obstacles: readonly Outline[], areas: readonly Box[]): number[] {
  const g = grid(R, obstacles);
  return areas.map((a) => widthTo(g, a));
}
