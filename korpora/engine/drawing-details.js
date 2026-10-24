// Enlarged details for part drawings: hinge cup with its dowels or screws, hinge mounting plate, handle holes and
// slide pilots. Each detail draws into a box on the sheet at its own scale, oriented like the main view
// (u to the right, v up), so the numbers read the same way.
import { dimH, dimV, fmt, SCALES } from './drawing-kit.js';
import { esc } from './util.js';

// The first ISO 5455 scale between 1:min and 1:max at which `span` mm takes at most `room` mm of paper, else 1:max.
const detailScale = (span, room, min, max) => SCALES.find((s) => s >= min && s <= max && span / s <= room) ?? max;
// A hardware hole: orange outline, filled only when it goes through — as in the part's main view and its legend.
const keyClass = (h) => `d-key${h.through ? ' d-thru' : ''}`;
const box = (b, title, scale) => `<rect class="d-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/><text class="d-tag" x="${b.x + 1.5}" y="${b.y + 3.6}">${esc(title)} · М ${scale === 1 ? '1:1' : `1:${scale}`}</text>`;

// Hinge cup: hinge edge, cup, fixings; dimensions from the hinge edge.
export function hingeDetail(p, cup, fixings, b) {
  const left = p.hingeSide === 'left';
  const edgeV = left ? 0 : p.W;
  const sgn = left ? 1 : -1;
  const cx = b.x + b.w / 2 - 6;
  const ey = b.y + b.h - 9; // paper y of the hinge edge
  const P = (u, v) => [cx + (u - cup.u), ey - sgn * (v - edgeV)];
  const [x, y] = P(cup.u, cup.v);
  const r = cup.d / 2;
  let s = box(b, 'Чашка на панта', 1);
  s += `<line class="d-out" x1="${b.x + 3}" y1="${ey}" x2="${b.x + b.w - 3}" y2="${ey}"/><text class="d-small" x="${b.x + 3}" y="${ey + 3.2}">ръб с пантите</text>`;
  s += `<circle class="${keyClass(cup)}" cx="${x}" cy="${y}" r="${r}"/><line class="d-cl" x1="${x - r - 3}" y1="${y}" x2="${x + r + 3}" y2="${y}"/><line class="d-cl" x1="${x}" y1="${y - r - 3}" x2="${x}" y2="${ey + 1}"/>`;
  s += `<text class="d-dt" x="${x}" y="${y + r / 2}" text-anchor="middle">Ø${fmt(cup.d)} × ${fmt(cup.depth)}</text>`;
  const toCentre = Math.abs(cup.v - edgeV);
  s += dimV(ey, y, x - r - 4, fmt(toCentre), { ext: [[x, y]] });
  const boring = toCentre - r;
  s += `<line class="d-ext" x1="${x + 2}" y1="${y + r}" x2="${x + r + 9}" y2="${y + r}"/><text class="d-dt" x="${x + r + 4}" y="${ey - 0.8}">${fmt(boring)}</text>`;
  if (fixings.length === 2) {
    const [a, c] = [...fixings].sort((m, n) => m.u - n.u);
    const [ax, ay] = P(a.u, a.v);
    const [bx, by] = P(c.u, c.v);
    for (const [fx, fy, f] of [[ax, ay, a], [bx, by, c]]) {
      s += f.mark ? `<path class="d-mark" d="M${fx - 1.5} ${fy}h3M${fx} ${fy - 1.5}v3"/>` : `<circle class="${keyClass(f)}" cx="${fx}" cy="${fy}" r="${f.d / 2}"/>`;
    }
    s += dimH(ax, bx, y - r - 6, fmt(c.u - a.u), { ext: [[ax, ay], [bx, by]] });
    s += dimV(y, by, bx + 6, fmt(Math.abs(a.v - cup.v)), { ext: [[bx, by], [x + r, y]] });
    s += `<text class="d-dt" x="${bx + 9}" y="${by - 4}">${a.mark ? 'винт' : `Ø${fmt(a.d)} × ${fmt(a.depth)}`}</text>`;
  }
  return s;
}

// Mounting plate holes on the carcass panel: distance from the front edge and the vertical spacing.
export function plateDetail(holes, frontV, b) {
  const [a, c] = [...holes].sort((m, n) => m.u - n.u);
  const cx = b.x + b.w / 2;
  const sgn = frontV === 0 ? 1 : -1;
  const ey = b.y + b.h - 12;
  const mid = (a.u + c.u) / 2;
  const P = (u, v) => [cx + (u - mid), ey - sgn * (v - frontV)];
  const [ax, ay] = P(a.u, a.v);
  const [bx, by] = P(c.u, c.v);
  let s = box(b, 'Планка на панта', 1);
  s += `<line class="d-out" x1="${b.x + 4}" y1="${ey}" x2="${b.x + b.w - 4}" y2="${ey}"/><text class="d-small" x="${b.x + 4}" y="${ey + 3.4}">ръб отпред</text>`;
  for (const [x, y, h] of [[ax, ay, a], [bx, by, c]]) s += `<circle class="${keyClass(h)}" cx="${x}" cy="${y}" r="${h.d / 2}"/>`;
  s += `<rect class="d-hid" x="${ax - 6}" y="${ay - 9}" width="${bx - ax + 12}" height="18" rx="2"/>`;
  s += dimH(ax, bx, ay - 12, fmt(c.u - a.u), { ext: [[ax, ay], [bx, by]] });
  s += dimV(ey, ay, ax - 9, fmt(Math.abs(a.v - frontV)), { ext: [[ax, ay]] });
  s += `<text class="d-dt" x="${bx + 3}" y="${by + 1}">Ø${fmt(a.d)} × ${a.through ? 'проходен' : fmt(a.depth)}</text>`;
  return s;
}

// Handle holes: spacing and the distances from hole 1 to the two nearest edges (named as on the furniture).
export function handleDetail(p, holes, edges, b) {
  const hs = [...holes].sort((m, n) => m.u - n.u || m.v - n.v);
  const span = hs.length === 2 ? Math.hypot(hs[1].u - hs[0].u, hs[1].v - hs[0].v) : 0;
  const scale = detailScale(span, b.w - 24, 1, 20);
  const k = 1 / scale;
  const cu = hs.reduce((a, h) => a + h.u, 0) / hs.length;
  const cv = hs.reduce((a, h) => a + h.v, 0) / hs.length;
  const nearU = cu < p.L - cu ? { at: 0, name: edges.u0 } : { at: p.L, name: edges.u1 };
  const nearV = cv < p.W - cv ? { at: 0, name: edges.v0 } : { at: p.W, name: edges.v1 };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const P = (u, v) => [cx + (u - cu) * k, cy - (v - cv) * k];
  let s = box(b, 'Дръжка', scale);
  // the nearest edges, when they fall inside the detail box
  const [exU] = P(nearU.at, cv);
  const [, eyV] = P(cu, nearV.at);
  if (exU > b.x + 2 && exU < b.x + b.w - 2) s += `<line class="d-out" x1="${exU}" y1="${b.y + 6}" x2="${exU}" y2="${b.y + b.h - 12}"/>`;
  if (eyV > b.y + 6 && eyV < b.y + b.h - 12) s += `<line class="d-out" x1="${b.x + 2}" y1="${eyV}" x2="${b.x + b.w - 2}" y2="${eyV}"/>`;
  const pts = hs.map((h) => P(h.u, h.v));
  pts.forEach(([x, y], i) => {
    s += `<circle class="${keyClass(hs[i])}" cx="${x}" cy="${y}" r="${Math.max(0.6, (hs[0].d / 2) * k)}"/>`;
  });
  if (hs.length === 2) {
    const [[ax, ay], [bx, by]] = pts;
    if (Math.abs(ay - by) < 0.01) s += dimH(ax, bx, ay - 6, fmt(span), { ext: [[ax, ay], [bx, by]] });
    else s += dimV(ay, by, ax - 6, fmt(span), { ext: [[ax, ay], [bx, by]] });
  }
  const y0 = b.y + b.h - 9.5;
  s += `<text class="d-dt" x="${b.x + 2}" y="${y0}">Ø${fmt(hs[0].d)} проходен × ${hs.length}</text>`;
  s += `<text class="d-small" x="${b.x + 2}" y="${y0 + 3.2}">отвор 1: ${fmt(Math.abs(hs[0].u - nearU.at))} от ръб „${esc(nearU.name)}“</text>`;
  s += `<text class="d-small" x="${b.x + 2}" y="${y0 + 6.2}">${fmt(Math.abs(hs[0].v - nearV.at))} от ръб „${esc(nearV.name)}“</text>`;
  return s;
}

// Slide pilots: positions from the front edge and the height of the row.
export function slideDetail(holes, frontV, b) {
  const hs = [...holes].sort((m, n) => Math.abs(m.v - frontV) - Math.abs(n.v - frontV));
  const far = Math.abs(hs.at(-1).v - frontV);
  const scale = detailScale(far, 60, 2, 10); // the row within 60 mm of paper from the front edge
  const k = 1 / scale;
  const x0 = b.x + 8;
  const yRow = b.y + b.h / 2 + 4;
  let s = box(b, 'Водач', scale);
  s += `<line class="d-out" x1="${x0}" y1="${b.y + 8}" x2="${x0}" y2="${b.y + b.h - 6}"/><text class="d-small" x="${x0 + 1}" y="${b.y + b.h - 2.5}">ръб отпред</text>`;
  let prevX = x0;
  hs.forEach((h, i) => {
    const x = x0 + Math.abs(h.v - frontV) * k;
    s += `<circle class="${keyClass(h)}" cx="${x}" cy="${yRow}" r="${Math.max(0.7, (h.d / 2) * k)}"/>`;
    s += dimH(i === 0 ? x0 : prevX, x, yRow - 6 - (i % 2) * 5, fmt(i === 0 ? Math.abs(h.v - frontV) : Math.abs(h.v - hs[i - 1].v)), { ext: [[x, yRow]] });
    prevX = x;
  });
  s += `<text class="d-dt" x="${b.x + 2}" y="${b.y + b.h - 9}">Ø${fmt(hs[0].d)} × ${hs[0].through ? 'проходен' : fmt(hs[0].depth)}, ред на u = ${fmt(hs[0].u)}</text>`;
  return s;
}
