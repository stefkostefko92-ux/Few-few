// The front view of an assembly (drawing-assembly.js, and every wall of a Г or П kitchen in drawing-walls.js): the
// parts in painter's order with the fronts closed, shelves and partitions behind them as hidden lines, the opening of
// the doors, the handles, the worktop and the mattress — and the module ranges the dimension chains follow.
import { handleHoles } from './hardware.js';
import { translator } from './i18n.js';

export const FRONTS = new Set(['door', 'drawer-front', 'blind']);

// X and Y: model mm to sheet mm; k: the scale (sheet mm per model mm); t: the model's language.
export function frontView(parts, symbols, X, Y, k, t = translator('bg')) {
  let g = '';
  for (const s of symbols.filter((sy) => sy.type === 'leg')) g += `<rect class="d-vis" x="${X(s.x - 15)}" y="${Y(s.y0 + s.h)}" width="${30 * k}" height="${s.h * k}"/>`;
  for (const p of [...parts].sort((a, b) => a.box.max[2] - b.box.max[2])) {
    g += `<rect class="${FRONTS.has(p.role) ? 'd-front' : 'd-vis'}" x="${X(p.box.min[0])}" y="${Y(p.box.max[1])}" width="${(p.box.max[0] - p.box.min[0]) * k}" height="${(p.box.max[1] - p.box.min[1]) * k}"/>`;
  }
  const fronts = parts.filter((p) => FRONTS.has(p.role));
  // hidden when every sample point of the part (inset 2 mm) sits behind some closed front
  const behind = (x, y, z) => fronts.some((f) => f.box.min[2] >= z - 0.1 && x >= f.box.min[0] && x <= f.box.max[0] && y >= f.box.min[1] && y <= f.box.max[1]);
  const covered = (p) => {
    const xs = [p.box.min[0] + 2, p.box.max[0] - 2];
    const ys = [p.box.min[1] + 2, (p.box.min[1] + p.box.max[1]) / 2, p.box.max[1] - 2];
    return xs.every((x) => ys.every((y) => behind(x, y, p.box.max[2])));
  };
  for (const p of parts.filter((q) => (q.role === 'shelf' || q.role === 'partition' || q.role === 'divider') && covered(q))) {
    g += `<rect class="d-hid" x="${X(p.box.min[0])}" y="${Y(p.box.max[1])}" width="${(p.box.max[0] - p.box.min[0]) * k}" height="${(p.box.max[1] - p.box.min[1]) * k}"/>`;
  }
  for (const d of parts.filter((p) => p.role === 'door')) {
    const [x0, y0] = d.box.min;
    const [x1, y1] = d.box.max;
    const apex = d.hingeSide === 'left' ? X(x0) : X(x1);
    const free = d.hingeSide === 'left' ? X(x1) : X(x0);
    g += `<polyline class="d-open" points="${free},${Y(y1)} ${apex},${Y((y0 + y1) / 2)} ${free},${Y(y0)}"/>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'handle')) {
    const len = s.model.length ?? (handleHoles(s.model).pair ? s.model.spacing + 40 : 24);
    g += s.horizontal ? `<line class="d-out" x1="${X(s.x - len / 2)}" y1="${Y(s.y)}" x2="${X(s.x + len / 2)}" y2="${Y(s.y)}"/>` : `<line class="d-out" x1="${X(s.x)}" y1="${Y(s.y - len / 2)}" x2="${X(s.x)}" y2="${Y(s.y + len / 2)}"/>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'worktop')) {
    g += `<rect class="d-vis" x="${X(s.x0)}" y="${Y(s.y + s.t)}" width="${(s.x1 - s.x0) * k}" height="${s.t * k}"/><text class="d-small" x="${X(s.x1) - 2}" y="${Y(s.y + s.t) - 1}" text-anchor="end">${t('drw.worktop')}</text>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'mattress')) g += `<rect class="d-hid" x="${X(s.x0)}" y="${Y(s.y + s.h)}" width="${(s.x1 - s.x0) * k}" height="${s.h * k}" rx="1"/>`;
  return g;
}

// The overall box of a front view: the parts and the worktop over them.
export function extents(parts, symbols) {
  const e = { x0: Infinity, x1: -Infinity, y1: 0, z0: Infinity, z1: -Infinity };
  for (const p of parts) {
    e.x0 = Math.min(e.x0, p.box.min[0]);
    e.x1 = Math.max(e.x1, p.box.max[0]);
    e.y1 = Math.max(e.y1, p.box.max[1]);
    e.z0 = Math.min(e.z0, p.box.min[2]);
    e.z1 = Math.max(e.z1, p.box.max[2]);
  }
  for (const s of symbols.filter((sy) => sy.type === 'worktop')) {
    e.x0 = Math.min(e.x0, s.x0);
    e.x1 = Math.max(e.x1, s.x1);
    e.y1 = Math.max(e.y1, s.y + s.t);
    e.z1 = Math.max(e.z1, s.z1);
  }
  return e;
}

export function moduleRanges(parts) {
  const m = new Map();
  for (const p of parts) {
    if (!p.module) continue;
    const r = m.get(p.module) ?? { name: p.module, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    r.x0 = Math.min(r.x0, p.box.min[0]);
    r.x1 = Math.max(r.x1, p.box.max[0]);
    r.y0 = Math.min(r.y0, p.box.min[1]);
    r.y1 = Math.max(r.y1, p.box.max[1]);
    m.set(p.module, r);
  }
  // modules stacked over the same x range get a second dimension row
  const list = [...m.values()].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  list.forEach((r, i) => {
    r.row = list.slice(0, i).some((q) => q.x0 < r.x1 - 1 && q.x1 > r.x0 + 1) ? 1 : 0;
  });
  return list;
}
