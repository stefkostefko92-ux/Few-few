// Assembly drawing for any furniture type: front view (drawing-front.js: painter's order, fronts closed, shelves and
// partitions behind them as hidden lines) and section A–A seen from the left (first-angle projection: placed to the
// right), with overall and module dimensions and the material, joint and hardware notes (drawing-notes.js). A Г or П
// kitchen gets the plan of the room and a view of every wall instead (drawing-walls.js).
import { pickScale, dimH, dimV, frame, svgDoc } from './drawing-kit.js';
import { translator } from './i18n.js';
import { typeLabel } from './model.js';
import { dimsText } from './types.js';
import { drawingSheets } from './drawing-part.js';
import { frontView, extents, moduleRanges } from './drawing-front.js';
import { notes, materialLine } from './drawing-notes.js';
import { drawingWalls } from './drawing-walls.js';

// Sheet 1 of the drawing set (drawingSheets).
export function drawingAssembly(model, meta) {
  if (model.runs?.length) return drawingWalls(model, meta);
  const { parts, symbols, spec } = model;
  const t = translator(model.lang);
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
  // FRONT VIEW
  let g = frontView(parts, symbols, X, Y, k, t);
  g += `<line class="d-gnd" x1="${X(ext.x0) - 6}" y1="${Y(0)}" x2="${X(ext.x1) + 6}" y2="${Y(0)}"/>`;
  const mods = moduleRanges(parts);
  const chain = mods.length > 1;
  // below the ground: the section plane's arrow (to Y(0) + 6), the module chain, the overall width, the view's name
  g += dimH(X(ext.x0), X(ext.x1), Y(0) + (chain ? 20 : 12), t.num(W), { ext: [[X(ext.x0), Y(0)], [X(ext.x1), Y(0)]] });
  g += dimV(Y(0), Y(H), X(ext.x0) - 10, t.num(H), { ext: [[X(ext.x0), Y(H)], [X(ext.x0), Y(0)]] });
  if (chain) {
    for (const m of mods) {
      if (m.row) g += dimH(X(m.x0), X(m.x1), Y(H) - 9, `${m.name} ${t.num(m.x1 - m.x0)}`, { ext: [[X(m.x0), Y(m.y1)], [X(m.x1), Y(m.y1)]] });
      else g += dimH(X(m.x0), X(m.x1), Y(0) + 12, `${m.name} ${t.num(m.x1 - m.x0)}`, { ext: [[X(m.x0), Y(m.y0)], [X(m.x1), Y(m.y0)]] });
    }
  }
  const xc = cutPlane(parts, spec, ext);
  g += sectionPlane(X(xc), Y(H) - 5, Y(0) + 4.5);
  g += `<text class="d-vt" x="${X((ext.x0 + ext.x1) / 2)}" y="${Y(0) + (chain ? 29 : 21)}" text-anchor="middle">${t('drw.front')}</text>`;

  // SECTION A–A (left view: back on the left, front on the right)
  const sx0 = X(ext.x1) + 30;
  const Z = (z) => sx0 + (z - ext.z0) * k;
  const beyond = parts.filter((p) => p.box.max[0] > xc).sort((a, b) => b.box.min[0] - a.box.min[0]);
  for (const p of beyond) {
    const cut = p.box.min[0] <= xc;
    g += `<rect class="${cut ? 'd-cut' : 'd-vis'}" ${cut ? 'fill="url(#HATCH)"' : ''} x="${Z(p.box.min[2])}" y="${Y(p.box.max[1])}" width="${(p.box.max[2] - p.box.min[2]) * k}" height="${(p.box.max[1] - p.box.min[1]) * k}"/>`;
  }
  for (const s of symbols.filter((sy) => sy.type === 'rail' && sy.x0 <= xc && sy.x1 >= xc)) g += `<circle class="d-out" cx="${Z(s.z)}" cy="${Y(s.y)}" r="${Math.max(0.8, (s.h / 2) * k)}"/>`;
  for (const s of symbols.filter((sy) => sy.type === 'worktop' && sy.x0 <= xc && sy.x1 >= xc)) g += `<rect class="d-vis" x="${Z(s.z0)}" y="${Y(s.y + s.t)}" width="${(s.z1 - s.z0) * k}" height="${s.t * k}"/>`;
  g += `<line class="d-gnd" x1="${Z(ext.z0) - 6}" y1="${Y(0)}" x2="${Z(ext.z1) + 6}" y2="${Y(0)}"/>`;
  // the carcass depth (what the title gives) and, with the fronts, the overall depth
  const side = beyond.filter((p) => p.role === 'side').reduce((a, p) => (!a || p.box.max[2] - p.box.min[2] > a.box.max[2] - a.box.min[2] ? p : a), null);
  const both = side && side.box.max[2] < ext.z1 - 0.5;
  if (both) g += dimH(Z(side.box.min[2]), Z(side.box.max[2]), Y(0) + 11, t.num(side.box.max[2] - side.box.min[2]), { ext: [[Z(side.box.min[2]), Y(0)], [Z(side.box.max[2]), Y(0)]] });
  g += dimH(Z(ext.z0), Z(ext.z1), Y(0) + (both ? 18 : 11), t.num(D), { ext: [[Z(ext.z0), Y(0)], [Z(ext.z1), Y(0)]] });
  const shelves = parts.filter((p) => (p.role === 'shelf' || p.role === 'divider') && p.box.min[0] <= xc && p.box.max[0] >= xc).sort((a, b) => a.box.min[1] - b.box.min[1]);
  shelves.forEach((sh, i) => {
    const y = sh.box.max[1];
    g += dimV(Y(0), Y(y), Z(ext.z1) + 8 + 6 * i, t.num(y), { ext: [[Z(sh.box.max[2]), Y(y)]] });
  });
  g += `<text class="d-vt" x="${Z((ext.z0 + ext.z1) / 2)}" y="${Y(0) + (both ? 27 : 20)}" text-anchor="middle">${t('drw.section')}</text>`;
  g += notes(model);
  const material = materialLine(parts, t);
  return svgDoc(g + frame(`${typeLabel(spec.type, t)} ${dimsText(spec.type, spec, t)}`, meta, scale, 1, drawingSheets(model).count, material, t), t('drw.assemblyOf', { what: typeLabel(spec.type, t) }), 'assembly');
}

function cutPlane(parts, spec, ext) {
  if (spec.type === 'bed') return ext.x0 + (ext.x1 - ext.x0) / 4;
  const p = parts.find((q) => q.role === 'shelf') ?? parts.find((q) => q.role === 'door' || q.role === 'drawer-front');
  return p ? (p.box.min[0] + p.box.max[0]) / 2 + 0.5 : (ext.x0 + ext.x1) / 2 + 0.5;
}

// Section plane (ISO 128-44): a thin chain line, thick at its ends, with arrows towards the viewing direction — the
// section is seen from the left, so they point right — and the section's letter at each arrow.
function sectionPlane(x, top, bottom) {
  let s = `<line class="d-cpl" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"/>`;
  s += `<line class="d-cplt" x1="${x}" y1="${top}" x2="${x}" y2="${top + 3}"/><line class="d-cplt" x1="${x}" y1="${bottom - 3}" x2="${x}" y2="${bottom}"/>`;
  for (const y of [top, bottom]) {
    s += `<line class="d-cpa" x1="${x}" y1="${y}" x2="${x + 4}" y2="${y}"/><path class="d-cpah" d="M${x + 6} ${y} l-2.4 -0.9 v1.8 z"/>`;
    s += `<text class="d-vt" x="${x + 6.8}" y="${y + 1.3}">A</text>`;
  }
  return s;
}
