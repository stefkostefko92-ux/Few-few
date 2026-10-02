// Nesting: parts grouped by stock and decor, MaxRects with best-short-side-fit, grain kept along the sheet length,
// tool-diameter spacing between parts and a trimmed sheet edge.
import { cutSize } from './panel.js';
import { STOCK } from './materials.js';
import { SHEET_TRIM } from './model.js';

const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

export function nest(model, opts = {}) {
  const spacing = opts.spacing ?? model.spec.tool;
  const groups = new Map();
  for (const p of model.parts) {
    const k = `${p.stock}|${p.decor}`;
    if (!groups.has(k)) groups.set(k, []);
    const cut = cutSize(p, model.spec.bandCompensation);
    groups.get(k).push({ part: p, w: cut.L, h: cut.W, canRotate: !p.grain });
  }
  const sheets = [];
  const errors = [];
  for (const [k, items] of groups) {
    const [stockId, decor] = k.split('|');
    const [SW, SH] = STOCK[stockId].sheet;
    const binW = SW - 2 * SHEET_TRIM + spacing;
    const binH = SH - 2 * SHEET_TRIM + spacing;
    const sorted = [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.part.id.localeCompare(b.part.id));
    const local = [];
    for (const it of sorted) {
      const w = it.w + spacing;
      const h = it.h + spacing;
      let sh = local.find((s) => findPosition(s.free, w, h, it.canRotate));
      if (!sh) {
        sh = { stock: stockId, decor, w: SW, h: SH, free: [{ x: 0, y: 0, w: binW, h: binH }], placements: [] };
        if (!findPosition(sh.free, w, h, it.canRotate)) {
          errors.push(`${it.part.name} (${it.w} × ${it.h}) не се побира в лист ${SW} × ${SH}.`);
          continue;
        }
        local.push(sh);
      }
      commit(sh, it, findPosition(sh.free, w, h, it.canRotate), spacing);
    }
    for (const sh of local) {
      const used = sh.placements.reduce((a, pl) => a + pl.w * pl.h, 0);
      sh.yield = used / (SW * SH);
      const big = sh.free.reduce((a, f) => (!a || f.w * f.h > a.w * a.h ? f : a), null);
      sh.remnant = big && big.w - spacing >= 300 && big.h - spacing >= 200 ? { x: SHEET_TRIM + big.x, y: SHEET_TRIM + big.y, w: Math.round(big.w - spacing), h: Math.round(big.h - spacing) } : null;
      delete sh.free;
      sheets.push(sh);
    }
  }
  sheets.forEach((sh, i) => {
    sh.index = i + 1;
  });
  return { sheets, errors, spacing, trim: SHEET_TRIM };
}

function findPosition(free, w, h, canRotate) {
  let best = null;
  for (const fr of free) {
    for (const rot of canRotate ? [false, true] : [false]) {
      const rw = rot ? h : w;
      const rh = rot ? w : h;
      if (rw <= fr.w + 1e-6 && rh <= fr.h + 1e-6) {
        const shortSide = Math.min(fr.w - rw, fr.h - rh);
        const longSide = Math.max(fr.w - rw, fr.h - rh);
        if (!best || shortSide < best.shortSide || (shortSide === best.shortSide && longSide < best.longSide)) best = { x: fr.x, y: fr.y, w: rw, h: rh, rot, shortSide, longSide };
      }
    }
  }
  return best;
}

function commit(sheet, item, pos, spacing) {
  sheet.placements.push({ partId: item.part.id, name: item.part.name, x: SHEET_TRIM + pos.x, y: SHEET_TRIM + pos.y, w: pos.w - spacing, h: pos.h - spacing, rot: pos.rot, L: item.w, W: item.h });
  const used = { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
  const next = [];
  for (const fr of sheet.free) {
    if (!intersects(fr, used)) {
      next.push(fr);
      continue;
    }
    if (used.x > fr.x) next.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
    if (used.x + used.w < fr.x + fr.w) next.push({ x: used.x + used.w, y: fr.y, w: fr.x + fr.w - (used.x + used.w), h: fr.h });
    if (used.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
    if (used.y + used.h < fr.y + fr.h) next.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: fr.y + fr.h - (used.y + used.h) });
  }
  sheet.free = next.filter((a, i) => !next.some((b, j) => j !== i && contains(b, a) && (!contains(a, b) || j < i)));
}
