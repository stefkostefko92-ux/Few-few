// Adjustable shelves of a zone of a column — a whole template column, or one cell of a free carcass (cells.js): the 32 mm
// system holes in the zone where they clash with nothing already drilled, then the shelves on holes present on both
// panels, spread evenly, clear of the hinges.
import { panel } from './panel.js';
import { r1 } from './util.js';
import { SYSTEM, addHoleOnce, hasHole, clashes } from './joinery.js';

export const HINGE_CLEAR = 45; // shelves keep this distance (centre to centre) from hinges and their plates
const PIN_RISE = 4; // a shelf rests on its pins, this far above the axis of the pin holes

// a.holeTop: the highest system hole (default zoneTop); a.tag and a.label: keys and names of the shelves of one cell.
export function shelvesInZone(ctx, a) {
  const { col, c, yInnerTop, zoneBottom, zoneTop, rows } = a;
  const holeTop = a.holeTop ?? zoneTop;
  const holeYs = [];
  for (let y = c + SYSTEM.start; y <= yInnerTop - SYSTEM.start + 0.01; y += SYSTEM.pitch) if (y >= zoneBottom + 30 && y <= holeTop) holeYs.push(r1(y));
  const shelves = Math.max(0, a.shelves ?? 0);
  if (shelves) {
    for (const y of holeYs) {
      for (const z of rows) {
        for (const [p, fx] of [[col.left, col.xa], [col.right, col.xb]]) {
          if (!clashes(p, [fx, y, z], SYSTEM.d)) addHoleOnce(p, [fx, y, z], SYSTEM.d, SYSTEM.depth, 'system', { hw: 'system' }, p.role === 'partition');
        }
      }
    }
  }
  placeShelves(ctx, { ...a, shelves, holeYs });
}

function placeShelves(ctx, a) {
  const { col, i, n, shelves, holeYs, rows, zoneBottom, zoneTop, T, backFront, zEnd, bc, carc, key, nm } = a;
  const tag = a.tag ?? '';
  const label = a.label ?? ((k) => (n > 1 ? ctx.t('part.shelfIn', { col: i + 1, k }) : ctx.t('part.shelf', { k })));
  const hingeYs = a.hingeYs ?? col.hingeYs;
  // pins only go into plain system holes (a hole taken by a hinge plate screw, from either face, is not usable)
  const usable = holeYs.filter((y) => rows.every((z) => hasHole(col.left, [col.xa, y, z], SYSTEM.d, 'system') && hasHole(col.right, [col.xb, y, z], SYSTEM.d, 'system')));
  const used = [];
  for (let k = 1; k <= shelves; k++) {
    const target = zoneBottom + ((zoneTop - zoneBottom) * k) / (shelves + 1) - T / 2;
    let best = null;
    for (const y of usable) {
      if (y + PIN_RISE + T > zoneTop - 40 || y < zoneBottom + 40) continue;
      if (used.some((u) => Math.abs(u - y) < T + 60)) continue;
      if (hingeYs.some((hy) => Math.abs(y + PIN_RISE + T / 2 - hy) < HINGE_CLEAR)) continue;
      if (best === null || Math.abs(y + PIN_RISE - target) < Math.abs(best + PIN_RISE - target)) best = y;
    }
    if (best === null) {
      ctx.warn('warn', ctx.t('w.noShelfRoom', { where: nm(ctx.t('part.column', { n: i + 1 })), k }));
      continue;
    }
    used.push(best);
    const y = best + PIN_RISE;
    panel(ctx, { ...carc, key: key(`c${i + 1}${tag}shelf${k}`), name: nm(label(k)), role: 'shelf', box: { min: [col.xa + 1, y, backFront + 1], max: [col.xb - 1, y + T, zEnd - 20] }, n: '+y', L: 'x', bands: { '+z': bc }, explode: [0, 0, 0.9], pinY: best });
    ctx.hw('pins', { name: ctx.t('hw.pin'), qty: 4, unit: ctx.t('u.pcs'), group: ctx.t('g.hardware') });
  }
}
