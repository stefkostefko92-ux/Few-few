// The cells of a free carcass column (layout.js), bottom to top, a fixed shelf („Неподвижен рафт“) between two cells.
// Built in the carcass's own passes: first the fixed shelves (geometry only), the drawers of the drawer cells and the
// doors over their cells — the slide pilots and hinge plates claim their holes first, the hinges keep clear of the fixed
// shelves; then the system holes and shelves of the shelf cells and the rails of the rail cells; and last the confirmats
// of the fixed shelves, placed clear of every hole the panels have by then (the other face of a partition included).
// Every part made here knows its place (carcass, column, cell), so the editor can select it.
import { panel } from './panel.js';
import { r1, dimTxt } from './util.js';
import { CONFIRMAT, confirmat, confirmatZs, clashes, hasHole } from './joinery.js';
import { buildDrawers } from './drawers.js';
import { buildDoors } from './fronts.js';
import { hangRail } from './rail.js';
import { shelvesInZone } from './shelves.js';
import { resolveSizes, LAYOUT_LIMITS } from './layout.js';

const SHELF_HOLE_MARGIN = 30; // no system hole closer than this to the fixed shelf above (наш избор)

// Parts made by fn get the place of the cell (the editor selects by it).
function placed(ctx, place, fn) {
  const from = ctx.parts.length;
  const out = fn();
  for (const p of ctx.parts.slice(from)) p.place = place;
  return out;
}

// Pass 1: the fixed shelves, the drawers and the doors of one column.
export function cellFronts(ctx, o, a) {
  const { i, n, col, c, Hc, yInnerTop, zEnd, backFront, T, nm, key, bc, carc, gap, hingeSides } = a;
  const cells = col.cells;
  const last = cells.length - 1;
  const where = nm(n > 1 ? `Колона ${i + 1}` : 'Шкаф');
  const inner0 = c + T;
  const avail = yInnerTop - inner0 - last * T;
  const res = resolveSizes(cells.map((x) => x.h), avail, LAYOUT_LIMITS.minCell);
  if (res.over) ctx.warn('warn', `${where}: зададените височини на отделенията (${dimTxt(r1(cells.reduce((s, x) => s + (x.h ?? LAYOUT_LIMITS.minCell), 0)))} mm) не се побират в ${dimTxt(r1(avail))} mm — разпределени са пропорционално.`);
  const placeOf = (k) => ({ carcass: col.carcassIndex ?? 0, column: col.layoutIndex ?? i, cell: k });
  // the clear inside of every cell, and a fixed shelf over each but the last
  col.bounds = [];
  col.dividers = [];
  let y = inner0;
  cells.forEach((cell, k) => {
    const hi = k === last ? yInnerTop : r1(y + res.sizes[k]);
    col.bounds.push({ lo: y, hi });
    if (k < last) {
      const part = placed(ctx, placeOf(k), () => panel(ctx, {
        ...carc, key: key(`c${i + 1}div${k + 1}`), name: nm(n > 1 ? `Неподвижен рафт ${i + 1}.${k + 1}` : `Неподвижен рафт ${k + 1}`),
        role: 'divider', box: { min: [col.xa, hi, backFront], max: [col.xb, hi + T, zEnd] }, n: '+y', L: 'x', bands: { '+z': bc }, explode: [0, 0, 0.6],
      }));
      col.dividers.push(part);
      y = hi + T;
    }
  });
  // where the fronts of a cell reach: the outer edge of the carcass at its ends, the middle of a fixed shelf between
  const lower = (k) => (k === 0 ? c : col.bounds[k].lo - T / 2);
  const upper = (k) => (k === last ? c + Hc : col.bounds[k].hi + T / 2);
  const middles = col.dividers.map((d) => d.box.min[1] + T / 2);
  cells.forEach((cell, k) => {
    if (cell.fill !== 'drawers') return;
    placed(ctx, placeOf(k), () => buildDrawers(ctx, o, { ...a, dz0: lower(k), dzH: upper(k) - lower(k), drawers: cell.n, floorY: col.bounds[k].lo, key: (s) => key(`${s}k${k + 1}`) }));
  });
  col.hingeYs = [];
  col.fronts.forEach((f, si) => {
    const span = f.to > f.from ? `${f.from + 1}–${f.to + 1}` : `${f.from + 1}`;
    const name = (s) => nm(col.fronts.length > 1 ? `${s} (отд. ${span})` : s);
    const door = { ...col, doors: f.kind === 'doors2' ? 2 : 1, hingeSide: f.hinge ?? undefined };
    const ys = placed(ctx, placeOf(f.from), () => buildDoors(ctx, o, {
      ...a, col: door, dy0: lower(f.from) + gap / 2, dy1: upper(f.to) - gap / 2, hingeSides, avoidYs: middles,
      key: (s) => key(`${s}f${si + 1}`), nm: name,
    }));
    col.hingeYs.push(...ys);
  });
}

// Pass 2: the shelves of the shelf cells and the rails of the rail cells.
export function cellInteriors(ctx, a) {
  const { i, n, col, c, yInnerTop, rows, T, backFront, zEnd, bc, carc, key, nm, mod } = a;
  const placeOf = (k) => ({ carcass: col.carcassIndex ?? 0, column: col.layoutIndex ?? i, cell: k });
  col.cells.forEach((cell, k) => {
    const { lo, hi } = col.bounds[k];
    if (cell.fill === 'shelves') {
      const label = (s) => (n > 1 ? `Рафт ${i + 1}.${k + 1}.${s}` : `Рафт ${k + 1}.${s}`);
      placed(ctx, placeOf(k), () => shelvesInZone(ctx, {
        col, i, n, shelves: cell.n, c, yInnerTop, zoneBottom: lo, zoneTop: hi, holeTop: k === col.cells.length - 1 ? hi : hi - SHELF_HOLE_MARGIN,
        rows, T, backFront, zEnd, bc, carc, key, nm, tag: `k${k + 1}`, label, hingeYs: col.hingeYs,
      }));
    } else if (cell.fill === 'rail') {
      const from = ctx.symbols.length;
      hangRail(ctx, { col, i, yInnerTop: hi, backFront, zEnd, mod, nm });
      for (const s of ctx.symbols.slice(from)) s.place = placeOf(k);
    }
  });
}

// Last: confirmats through the side or partition into both ends of every fixed shelf, each one clear of the holes the
// panel has by now (system holes, slide pilots, hinge plates, the fixed shelves on its other face). None found: an
// error — the CNC files are withheld rather than two holes drilled into one another.
export function joinCellShelves(ctx, a) {
  const { col, backFront, zEnd, z0, T } = a;
  const zStart = Math.max(backFront + 30, z0 + 50);
  for (const d of col.dividers) {
    const y = d.box.min[1] + T / 2;
    for (const [face, edge, x] of [[col.left, '-x', col.xa], [col.right, '+x', col.xb]]) {
      // clashes() lets a second hole share a spot (addHoleOnce merges system holes); two screws never share one —
      // the fixed shelf at the same height on the other face of a partition takes other depths
      const free = (z) => !clashes(face, [x, y, z], CONFIRMAT.face) && !hasHole(face, [x, y, z], CONFIRMAT.face);
      const zs = confirmatZs(zStart, zEnd - 50, free);
      if (!zs.every(free)) {
        ctx.warn('error', `${d.name}: конфирматите към ${face.name} нямат място покрай отворите в нея на тази височина — преместете рафта с няколко сантиметра.`);
        continue;
      }
      confirmat(ctx, face, d, edge, zs.map((z) => [x, y, z]));
    }
  }
}
