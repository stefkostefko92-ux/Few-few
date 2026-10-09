// The rails developed in elevation (registries guide.staffe, guide.staffe.cabina, ingombri.staffe.contrappeso): a car
// rail and a counterweight rail side by side, each from the pit floor to just under the slab in the design's lengths
// with the fishplates at the joints, every bracket where rail-brackets.ts puts it (the same heights the 3D, the list of
// articles and the rails' check take) on the side of its wall — on a side counterweight its bridge too —, the floors as
// reference lines named between the rails (the floor over its line, its height under it). Dimensioned from the pit floor: the brackets' lower edges with every interval
// (car rails on the left, the counterweight's on the right) and the lengths of the rails. A tall shaft in columns side
// by side, cut at the joints (rails-cols.ts) with a break line and a lettered tag where one goes on in the next; each
// column with the rails' names over it. Drawn for the scale it is printed at (the room the dimensions take is paper's).
// The heights are the rule's, worked out: references, no input changes them here. Pure.
import { DIM, TEXT, chain, line, path, rowOffset, textWidth, type Box, type Entity, type Pt } from '../drawing';
import { BRACKET_H } from './brackets';
import { bridgeHeights, designPieces, railHeights } from './rail-brackets';
import { FISHPLATES, railLabel } from './rails';
import { DEV_SLAB, columnChains, devColumns, devRails, devSpan, type DevColumn } from './rails-cols';
import { section } from './section';
import type { Layout, Rail } from './types';

/** How far each rail's blade, bracket arm and wall plate reach, how far apart the rails stand at least, a side
 *  counterweight's bridge as drawn [mm]. */
export const DEV = { rail: 45, arm: 260, plate: 14, gap: 2600, bridge: 120 } as const;
/** Paper room [mm]: between two columns; the floors' lines past the wall plates; round a floor's name between the rails;
 *  a column past its break; the break line's half width; the rails' names over a column (two lines). */
export const DEV_PAPER = { gutter: 6, past: 2, name: 1.5, pad: 3, zig: 3, title: [10, 13.5] } as const;
const FLOOR_SIZE = 1.8, TITLE_SIZE = 2.2;

export interface RailsDev {
  entities: Entity[];
  bounds: Box;
}

/** A floor's name over its line and its height over the lowest under it, as written between the rails. */
const floorName = (label: string, z: number): readonly [string, string] => [`PIANO ${label}`, `${z >= 0 ? '+' : ''}${Math.round(z)}`];

/** A column's geometry across, in mm of the model at `scale`: the rails' places, the wall plates' outer faces, its whole
 *  width with the dimensions' rows and the step from one column to the next. */
export function devAcross(L: Layout, scale: number): { car: number; cw: number; plates: readonly [number, number]; left: number; right: number; step: number } {
  const S = section(L), size = Math.max(FLOOR_SIZE, TEXT.min);
  const names = L.inputs.vertical.floors.flatMap((f, i) => floorName(f.label, S.levels[i] ?? 0).map((t) => textWidth(t, { size, cond: true })));
  const out = DEV.rail + DEV.arm + DEV.plate, cw = Math.max(DEV.gap, (Math.max(0, ...names) + 2 * DEV_PAPER.name) * scale + 2 * DEV.rail);
  const left = -out - (rowOffset(1) + TEXT.dim + DIM.textGap + 1) * scale, right = cw + out + (rowOffset(1) + DIM.over + 0.5) * scale;
  return { car: 0, cw, plates: [-out, cw + out], left, right, step: right - left + DEV_PAPER.gutter * scale };
}

/** The development at `scale` in the columns `cols` (all of it in one by default), side by side from the left; `first`:
 *  the letter of the break the first of them starts at (the columns of an earlier sheet took the ones before). */
export function railsDev(L: Layout, scale = 100, cols: readonly DevColumn[] = devColumns(L), first = 0): RailsDev {
  const I = L.inputs, S = section(L), A = devAcross(L, scale), [b] = devSpan(L), out: Entity[] = [], p = (mm: number): number => mm * scale;
  const [x0, x1] = [A.plates[0] - p(DEV_PAPER.past), A.plates[1] + p(DEV_PAPER.past)];
  let bounds: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  cols.forEach((c, k) => {
    // the column moved to its place: its lowest height at the development's foot
    const dx = k * A.step - A.left, dz = b - c.lo, T = (x: number, z: number): Pt => [x + dx, z + dz];
    const slab = (z0: number, z1: number): Entity => path([T(x0, z0), T(x1, z0), T(x1, z1), T(x0, z1)], true, 'wall', 'concrete');
    // the slabs under the pit and over the shaft where the column reaches them; the floors with their names
    if (c.from === null) out.push(slab(S.pitFloor - DEV_SLAB, S.pitFloor));
    if (c.to === null) out.push(slab(S.ceiling, S.ceiling + DEV_SLAB));
    I.vertical.floors.forEach((f, i) => {
      const z = S.levels[i] ?? 0;
      if (z < c.lo || z > c.hi) return;
      // the name over the line and the height under it; both over it just above a column's break, both under it just
      // below one (the break's letter stands there)
      const [name, height] = floorName(f.label, z), at = A.car + DEV.rail + p(DEV_PAPER.name), h = Math.max(FLOOR_SIZE, TEXT.min), room = p(2 * h + 1.4);
      const lines = c.from !== null && z - c.lo < room ? [0.8 + h + 0.6, 0.8] : c.to !== null && c.hi - z < room ? [-0.8 - h, -0.8 - 2 * h - 0.6] : [0.8, -0.8 - h];
      out.push(line(T(x0, z), T(x1, z), 'axis'), { e: 'text', at: T(at, z + p(lines[0] ?? 0)), text: name, size: FLOOR_SIZE, halo: true },
        { e: 'text', at: T(at, z + p(lines[1] ?? 0)), text: height, size: FLOOR_SIZE, halo: true });
    });
    for (const r of devRails(L)) out.push(...railColumn(L, r, c, r.kind === 'car' ? A.car : A.cw, r.kind === 'car' ? A.plates[0] : A.plates[1], scale, T));
    // the rails' names over the column; the letters of its breaks between the rails
    const cwName = `GUIDA DEL CONTRAPPESO ${railLabel(I.cwRail)}${L.bridge ? ' CON STAFFA A PONTE' : ''}`;
    out.push({ e: 'text', at: T(A.car, c.hi + p(DEV_PAPER.title[0])), text: `GUIDA DI CABINA ${railLabel(I.carRail)}`, size: TITLE_SIZE, align: 'c', bold: true },
      { e: 'text', at: T(A.cw, c.hi + p(DEV_PAPER.title[1])), text: cwName, size: TITLE_SIZE, align: 'c', bold: true });
    const letter = (i: number): string => String.fromCharCode(65 + ((first + i) % 26));
    if (c.to !== null) out.push({ e: 'tag', at: T(A.cw / 2, c.hi + p(5.6)), text: letter(k) });
    if (c.from !== null) out.push({ e: 'tag', at: T(A.cw / 2, c.lo - p(4)), text: letter(k - 1) });
    const [l, h] = [T(A.left, c.lo - p(DIM.overrun + 1)), T(A.right, c.hi + p(DEV_PAPER.title[1] + 3))];
    bounds = { x0: Math.min(bounds.x0, l[0]), y0: Math.min(bounds.y0, l[1]), x1: Math.max(bounds.x1, h[0]), y1: Math.max(bounds.y1, h[1]) };
  });
  return { entities: out, bounds: Number.isFinite(bounds.x0) ? bounds : { x0: 0, y0: 0, x1: 0, y1: 0 } };
}

/** One rail in a column: its lengths with the fishplates at the joints, its brackets out to its wall's side (left for
 *  the car's, right for the counterweight's) with their wall plates, a side counterweight's bridge beside the
 *  counterweight's; its two chains; a break line where the column cuts it. */
function railColumn(L: Layout, r: Rail, c: DevColumn, x: number, plate: number, scale: number, T: (x: number, z: number) => Pt): Entity[] {
  const I = L.inputs, fp = FISHPLATES[r.kind === 'car' ? I.carRail : I.cwRail], s = r.kind === 'car' ? 1 : -1, out: Entity[] = [];
  const { pieces, joints } = designPieces(L), z0 = section(L).pitFloor, hs = railHeights(L, r);
  const box = (a: number, za: number, d: number, zb: number, st: 'outline' | 'thin', fill: 'steel' | 'zinc'): Entity =>
    path([T(Math.min(a, d), za), T(Math.max(a, d), za), T(Math.max(a, d), zb), T(Math.min(a, d), zb)], true, st, fill);
  let z = z0;
  for (const q of pieces) {
    const a = Math.max(z + (z > z0 ? 5 : 0), c.lo), d = Math.min(z + q, c.hi);
    if (d > a) out.push(box(x - DEV.rail, a, x + DEV.rail, d, 'outline', 'steel'));
    z += q;
  }
  for (const j of joints) if (j - fp.l / 2 >= c.lo && j + fp.l / 2 <= c.hi) out.push(box(x - DEV.rail - 30, j - fp.l / 2, x + DEV.rail + 30, j + fp.l / 2, 'thin', 'zinc'));
  const arm = x - s * (DEV.rail + DEV.arm);
  for (const h of hs) {
    if (h < c.lo || h + BRACKET_H > c.hi) continue;
    out.push(box(x - s * DEV.rail, h, arm, h + BRACKET_H, 'thin', 'zinc'), box(arm, h - 25, plate, h + BRACKET_H + 25, 'thin', 'zinc'));
  }
  // the bridge of a side counterweight beside its rail, toward the car's
  if (r.kind === 'cw' && L.bridge) {
    for (const h of bridgeHeights(L)) if (h >= c.lo && h + DEV.bridge <= c.hi) out.push(box(x + DEV.rail, h, x + DEV.rail + DEV.bridge, h + DEV.bridge, 'thin', 'steel'));
  }
  // the chains from the pit floor: the brackets (the first, each interval, the last to the rail's top) from their wall
  // plates, the rail's ends from its face; the rail's lengths
  const { brackets, lengths } = columnChains(L, r, c), face = x - s * DEV.rail, [dx] = T(0, 0), at = (row: number): number => plate - s * rowOffset(row) * scale + dx;
  const lift = (pts: readonly number[]): number[] => pts.map((v) => T(0, v)[1]);
  if (brackets.length > 1) out.push(chain({ dir: 'y', at: at(0), pts: lift(brackets), from: brackets.map((h) => (hs.includes(h) ? plate : face) + dx) }));
  if (lengths.length > 1) out.push(chain({ dir: 'y', at: at(1), pts: lift(lengths), text: lengths.slice(1).map(() => 'Guida {v}'), from: face + dx }));
  // where the column cuts the rail: a break line across it
  const zig = (zc: number): Entity => {
    const w = DEV_PAPER.zig * scale, h = 0.9 * scale;
    return path([T(x - w, zc), T(x - w / 3, zc), T(x - w / 6, zc + h), T(x + w / 6, zc - h), T(x + w / 3, zc), T(x + w, zc)], false, 'thin');
  };
  if (c.to !== null) out.push(zig(c.hi));
  if (c.from !== null) out.push(zig(c.lo));
  return out;
}
