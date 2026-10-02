// Assembly drawing for any furniture type: front view (painter's order, fronts closed, shelves and partitions behind
// them as hidden lines) and section A–A seen from the left (first-angle projection: placed to the right), with
// overall and module dimensions and the material, joint and hardware notes.
import { pickScale, dimH, dimV, frame, svgDoc, fmt } from './drawing-kit.js';
import { decorName, STOCK } from './materials.js';
import { typeLabel } from './model.js';
import { dimsText } from './types.js';
import { esc } from './util.js';

const FRONTS = new Set(['door', 'drawer-front']);

export function drawingAssembly(model, meta, sheetNo = 1, sheetCount = 2) {
  const { parts, symbols, spec } = model;
  const ext = extents(parts, symbols);
  const W = ext.x1 - ext.x0;
  const H = ext.y1;
  const D = ext.z1 - ext.z0;
  const scale = pickScale(W + D, H, 300, 175);
  const k = 1 / scale;
  const fx = 46;
  const fy = 28 + Math.max(0, (200 - H * k) / 2);
  const X = (x) => fx + (x - ext.x0) * k;
  const Y = (y) => fy + (H - y) * k;
  let g = '';
  // FRONT VIEW
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
  for (const p of parts.filter((q) => (q.role === 'shelf' || q.role === 'partition') && covered(q))) {
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
    const len = s.model.holes === 2 && s.model.spacing ? s.model.spacing + 24 : 24;
    g += s.horizontal ? `<line class="d-out" x1="${X(s.x - len / 2)}" y1="${Y(s.y)}" x2="${X(s.x + len / 2)}" y2="${Y(s.y)}"/>` : `<line class="d-out" x1="${X(s.x)}" y1="${Y(s.y - len / 2)}" x2="${X(s.x)}" y2="${Y(s.y + len / 2)}"/>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'worktop')) {
    g += `<rect class="d-vis" x="${X(s.x0)}" y="${Y(s.y + s.t)}" width="${(s.x1 - s.x0) * k}" height="${s.t * k}"/><text class="d-small" x="${X(s.x0) + 2}" y="${Y(s.y + s.t) - 1}">плот (покупен)</text>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'mattress')) g += `<rect class="d-hid" x="${X(s.x0)}" y="${Y(s.y + s.h)}" width="${(s.x1 - s.x0) * k}" height="${s.h * k}" rx="1"/>`;
  g += `<line class="d-gnd" x1="${X(ext.x0) - 6}" y1="${Y(0)}" x2="${X(ext.x1) + 6}" y2="${Y(0)}"/>`;
  const mods = moduleRanges(parts);
  const chain = mods.length > 1;
  g += dimH(X(ext.x0), X(ext.x1), Y(0) + (chain ? 17 : 11), fmt(W), { ext: [[X(ext.x0), Y(0)], [X(ext.x1), Y(0)]] });
  g += dimV(Y(0), Y(H), X(ext.x0) - 10, fmt(H), { ext: [[X(ext.x0), Y(H)], [X(ext.x0), Y(0)]] });
  if (chain) {
    for (const m of mods) {
      if (m.row) g += dimH(X(m.x0), X(m.x1), Y(H) - 7, `${m.name} ${fmt(m.x1 - m.x0)}`, { ext: [[X(m.x0), Y(m.y1)], [X(m.x1), Y(m.y1)]] });
      else g += dimH(X(m.x0), X(m.x1), Y(0) + 8, `${m.name} ${fmt(m.x1 - m.x0)}`, { ext: [[X(m.x0), Y(m.y0)], [X(m.x1), Y(m.y0)]], textBelow: false });
    }
  }
  const xc = cutPlane(parts, spec, ext);
  g += `<line class="d-cpl" x1="${X(xc)}" y1="${Y(H) - 3}" x2="${X(xc)}" y2="${Y(0) + 4}"/><text class="d-vt" x="${X(xc) + 1.5}" y="${Y(H) - 3.5}">A</text><text class="d-vt" x="${X(xc) + 1.5}" y="${Y(0) + 7.5}">A</text>`;
  g += `<text class="d-vt" x="${X((ext.x0 + ext.x1) / 2)}" y="${Y(0) + (chain ? 26 : 20)}" text-anchor="middle">Изглед отпред</text>`;

  // SECTION A–A (left view: back on the left, front on the right)
  const sx0 = X(ext.x1) + 30;
  const Z = (z) => sx0 + (z - ext.z0) * k;
  const beyond = parts.filter((p) => p.box.max[0] > xc).sort((a, b) => b.box.min[0] - a.box.min[0]);
  for (const p of beyond) {
    const cut = p.box.min[0] <= xc;
    g += `<rect class="${cut ? 'd-cut' : 'd-vis'}" ${cut ? 'fill="url(#HATCH)"' : ''} x="${Z(p.box.min[2])}" y="${Y(p.box.max[1])}" width="${(p.box.max[2] - p.box.min[2]) * k}" height="${(p.box.max[1] - p.box.min[1]) * k}"/>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'rail' && sy.x0 <= xc && sy.x1 >= xc)) g += `<circle class="d-out" cx="${Z(s.z)}" cy="${Y(s.y)}" r="${Math.max(0.8, 15 * k)}"/>`;
  g += `<line class="d-gnd" x1="${Z(ext.z0) - 6}" y1="${Y(0)}" x2="${Z(ext.z1) + 6}" y2="${Y(0)}"/>`;
  g += dimH(Z(ext.z0), Z(ext.z1), Y(0) + 11, fmt(D), { ext: [[Z(ext.z0), Y(0)], [Z(ext.z1), Y(0)]] });
  const shelves = parts.filter((p) => p.role === 'shelf' && p.box.min[0] <= xc && p.box.max[0] >= xc).sort((a, b) => a.box.min[1] - b.box.min[1]);
  shelves.forEach((sh, i) => {
    const y = sh.box.max[1];
    g += dimV(Y(0), Y(y), Z(ext.z1) + 8 + 6 * i, fmt(y), { ext: [[Z(sh.box.max[2]), Y(y)]] });
  });
  g += `<text class="d-vt" x="${Z((ext.z0 + ext.z1) / 2)}" y="${Y(0) + 20}" text-anchor="middle">Разрез A–A</text>`;
  g += notes(model);
  const material = materialLine(parts);
  return svgDoc(g + frame(`${typeLabel(spec.type)} ${dimsText(spec.type, spec)}`, meta, scale, sheetNo, sheetCount, material), `Сглобен чертеж: ${typeLabel(spec.type)}`);
}

function extents(parts, symbols) {
  const e = { x0: Infinity, x1: -Infinity, y1: 0, z0: Infinity, z1: -Infinity };
  for (const p of parts) {
    e.x0 = Math.min(e.x0, p.box.min[0]);
    e.x1 = Math.max(e.x1, p.box.max[0]);
    e.y1 = Math.max(e.y1, p.box.max[1]);
    e.z0 = Math.min(e.z0, p.box.min[2]);
    e.z1 = Math.max(e.z1, p.box.max[2]);
  }
  for (const s of symbols.filter((sy) => sy.type === 'worktop')) e.y1 = Math.max(e.y1, s.y + s.t);
  return e;
}

function moduleRanges(parts) {
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

function cutPlane(parts, spec, ext) {
  if (spec.type === 'bed') return ext.x0 + (ext.x1 - ext.x0) / 4;
  const p = parts.find((q) => q.role === 'shelf') ?? parts.find((q) => q.role === 'door' || q.role === 'drawer-front');
  return p ? (p.box.min[0] + p.box.max[0]) / 2 + 0.5 : (ext.x0 + ext.x1) / 2 + 0.5;
}

function materialLine(parts) {
  const main = parts.find((p) => p.role === 'side' || p.role === 'bed-rail') ?? parts[0];
  return `${STOCK[main.stock].name} ${fmt(main.T)} · ${decorName(main.decor)}`;
}

function notes(model) {
  const { parts, spec, hardware } = model;
  const front = parts.find((p) => p.role === 'door' || p.role === 'drawer-front' || p.role === 'bed-head');
  const carcass = parts.find((p) => p.role === 'side' || p.role === 'bed-rail');
  const lines = [];
  if (carcass) lines.push(`Корпус: ${STOCK[carcass.stock].name} ${fmt(carcass.T)} mm, ${decorName(carcass.decor)}; кант ${fmt(spec.bandCarcass)} mm.`);
  if (front) lines.push(`Фронт: ${STOCK[front.stock].name} ${fmt(front.T)} mm, ${decorName(front.decor)}${STOCK[front.stock].painted ? ' (боядисан, без кант)' : `; кант ${fmt(spec.bandFront)} mm`}. Фуга ${fmt(spec.gap)} mm.`);
  lines.push('Съединения: конфирмат 7×50, рафтоносачи по системата 32 mm, гръб HDF 3 mm в канал 4×8 mm на 16 mm от гърба.');
  const named = hardware.filter((h) => h.brand && h.group === 'Обков').slice(0, 4).map((h) => `${h.brand} ${h.sku ?? ''}${h.key.endsWith(':полуналожена') ? ' (полуналожена)' : ''} × ${h.qty}`.replace(/\s+/g, ' '));
  if (named.length) lines.push(`Обков: ${named.join('; ')}.`);
  return lines.map((t, i) => `<text class="d-note" x="30" y="${258 + i * 4.8}">${esc(t.length > 118 ? `${t.slice(0, 117)}…` : t)}</text>`).join('');
}
