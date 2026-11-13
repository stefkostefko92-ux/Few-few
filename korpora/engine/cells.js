// The cells of a free carcass column (layout.js), bottom to top, a fixed shelf („Неподвижен рафт“) between two cells.
// Built in the carcass's own passes: first the fixed shelves (geometry only), the drawers of the drawer cells and the
// doors over their cells — the slide pilots and hinge plates claim their holes first, the hinges keep clear of the fixed
// shelves; then the system holes and shelves of the shelf cells and the rails of the rail cells; and last the joints
// of the fixed shelves, placed clear of every hole the panels have by then (the other face of a partition included):
// confirmats, or glued dowels where the head of a confirmat would end under the fixed shelf on the other face of a
// partition. Every part made here knows its place (carcass, column, cell), so the editor can select it.
import { panel } from './panel.js';
import { r1, dimTxt } from './util.js';
import { CONFIRMAT, DOWEL, MIN_WEB, confirmat, confirmatZs, dowels, taken } from './joinery.js';
import { buildDrawers } from './drawers.js';
import { buildDoors } from './fronts.js';
import { hangRail } from './rail.js';
import { shelvesInZone } from './shelves.js';
import { resolveSizes, fitCount, LAYOUT_LIMITS } from './layout.js';

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
  const where = nm(n > 1 ? `Колона ${i + 1}` : 'Шкаф');
  const inner0 = c + T;
  // the cells that fit at their minimum height, bottom up; the others (and the fronts over them) are not built — an error
  const room = (k) => yInnerTop - inner0 - (k - 1) * T;
  const fit = fitCount(col.cells.length, room, LAYOUT_LIMITS.minCell);
  if (fit < col.cells.length) {
    ctx.warn('error', `${where}: ${dimTxt(r1(room(1)))} mm не стигат за ${col.cells.length} отделения по поне ${LAYOUT_LIMITS.minCell} mm с неподвижните рафтове между тях — построени са долните ${fit}. Махнете отделения или увеличете височината.`);
    col.cells = col.cells.slice(0, fit);
    col.fronts = col.fronts.filter((f) => f.to < fit);
  }
  const cells = col.cells;
  const last = cells.length - 1;
  const avail = room(cells.length);
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
    ctx.cells.push({ ...placeOf(k), x0: col.xa, x1: col.xb, y0: y, y1: hi, fill: cell.fill, n: cell.n, auto: cell.h === null });
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

// Last: the joints of both ends of every fixed shelf, through the side or partition, each hole clear of the holes the
// panel has by now (system holes, slide pilots, hinge plates, the joints of the fixed shelves on its other face).
// Confirmats, their heads on the other face of the panel — unless a fixed shelf on the other face of a partition is so
// near in height that it would cover them:
//  - that shelf not joined yet: this one is screwed first, the heads stay under it (no cap there);
//  - joined already with confirmats: this one is glued on dowels, over its heads, while the other shelf hides the
//    through holes of the dowels (DOWEL_HIDDEN); between that and SCREW_CLEAR neither joint can be made — an error.
// No room for the holes: an error too — the CNC files are withheld rather than two holes drilled into one another.
export function joinCellShelves(ctx, a) {
  const { col, backFront, zEnd, z0, T } = a;
  const zStart = Math.max(backFront + 30, z0 + 50);
  const SCREW_CLEAR = T / 2 + CONFIRMAT.head / 2 + MIN_WEB; // a head this far from the middle of a shelf clears it
  const DOWEL_HIDDEN = T / 2 - DOWEL.d / 2; // a dowel hole this near the middle of a shelf is hidden behind it
  for (const d of col.dividers) {
    const y = d.box.min[1] + T / 2;
    for (const [face, edge, x] of [[col.left, '-x', col.xa], [col.right, '+x', col.xb]]) {
      const across = face.role === 'partition' ? (x === face.box.max[0] ? face.box.min[0] : face.box.max[0]) : null;
      // the fixed shelves on the other face of the partition, near this height, and whether each is screwed there
      const near = across === null ? [] : ctx.parts
        .filter((o) => o.role === 'divider' && (o.box.min[0] === across || o.box.max[0] === across) && Math.abs(o.box.min[1] + T / 2 - y) < SCREW_CLEAR)
        .map((o) => ({ dy: Math.abs(o.box.min[1] + T / 2 - y), screwed: face.features.some((f) => f.kind === 'confirmat' && f.world[0] === across && Math.abs(f.world[1] - (o.box.min[1] + T / 2)) < 0.01) }));
      const doweled = near.some((o) => o.screwed);
      if (doweled && near.some((o) => o.screwed && o.dy > DOWEL_HIDDEN)) {
        ctx.warn('error', `${d.name}: неподвижният рафт от другата страна на ${face.name} е на ${dimTxt(r1(Math.max(...near.map((o) => o.dy))))} mm по височина — главите на конфирматите биха останали под него, а отворите за шкантове не се скриват зад него. Изравнете двата рафта или ги раздалечете на поне ${dimTxt(r1(SCREW_CLEAR))} mm.`);
        continue;
      }
      const hole = doweled ? DOWEL.d : CONFIRMAT.face;
      const free = (z) => !taken(face, [x, y, z], hole);
      const zs = confirmatZs(zStart, zEnd - 50, free);
      if (!zs.every(free)) {
        ctx.warn('error', `${d.name}: ${doweled ? 'шкантовете' : 'конфирматите'} към ${face.name} нямат място покрай отворите в нея на тази височина — преместете рафта с няколко сантиметра.`);
        continue;
      }
      const points = zs.map((z) => [x, y, z]);
      if (doweled) dowels(ctx, face, d, edge, points);
      // the heads in the next column show unless the fixed shelf there will cover them: they get caps
      else confirmat(ctx, face, d, edge, points, across === null ? {} : { cap: !near.some((o) => o.dy + CONFIRMAT.head / 2 <= T / 2) });
    }
  }
}
