// Part drawing with its drilling map: face A up exactly as the part lies on the CNC table, every hole tagged with a
// letter (one letter per kind, Ø and depth), ordinate dimensions for hinge, handle, plate, slide and joint holes,
// horizontal edge holes as hidden lines, a grouped hole table and enlarged details of the hardware holes.
import { pickScale, dimH, dimV, ordinates, frame, svgDoc, fmt } from './drawing-kit.js';
import { hingeDetail, plateDetail, handleDetail, slideDetail } from './drawing-details.js';
import { partHoles } from './drill.js';
import { edgeLabels, cutSize } from './panel.js';
import { STOCK, decorName } from './materials.js';
import { esc, neg } from './util.js';

const KEY = new Set(['cup', 'cup-dowel', 'plate', 'handle', 'slide', 'confirmat', 'pilot', 'screw']);
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

export function holeLetters(holes) {
  const map = new Map();
  for (const h of holes) {
    const k = `${h.kind}|${h.d}|${h.depth}|${h.mark}`;
    if (!map.has(k)) map.set(k, { letter: LETTERS[map.size] ?? `Z${map.size}`, kind: h.kind, purpose: h.purpose, d: h.d, depth: h.depth, through: h.through, mark: h.mark, label: h.label, count: 0 });
    map.get(k).count += 1;
    h.letter = map.get(k).letter;
  }
  return [...map.values()];
}

export function drawingPart(model, meta, partId, sheetNo = 2, sheetCount = 2) {
  const p = model.parts.find((x) => x.id === partId) ?? model.parts[0];
  const holes = partHoles(p);
  const groups = holeLetters(holes);
  const edges = edgeLabels(p);
  // two layouts: long parts get the full width (details below), compact parts get a taller view (details right)
  const wide = { area: { x: 30, y: 30, w: 372, h: 136 }, slots: [{ x: 234, y: 170, w: 86, h: 78 }, { x: 322, y: 170, w: 86, h: 78 }], table: { x: 30, y: 176, rows: 11 } };
  const tall = { area: { x: 30, y: 30, w: 270, h: 172 }, slots: [{ x: 304, y: 30, w: 104, h: 72 }, { x: 304, y: 104, w: 104, h: 72 }, { x: 304, y: 178, w: 104, h: 70 }], table: { x: 30, y: 210, rows: 7 } };
  const sWide = pickScale(p.L, p.W, wide.area.w - 44, wide.area.h - 40);
  const sTall = pickScale(p.L, p.W, tall.area.w - 44, tall.area.h - 40);
  const lay = sTall < sWide ? tall : wide;
  const { area } = lay;
  const scale = Math.min(sWide, sTall);
  const k = 1 / scale;
  const ox = area.x + 26 + (area.w - 44 - p.L * k) / 2;
  const oy = area.y + area.h - 22 - (area.h - 40 - p.W * k) / 2;
  const U = (u) => ox + u * k;
  const V = (v) => oy - v * k;
  let g = `<text class="d-vt" x="30" y="19">${esc(`${p.id} · ${p.name}`)} — лице А нагоре (обработваната страна)</text>`;
  g += `<text class="d-note" x="30" y="24.5">Координати от ъгъла u = 0 (ръб „${esc(edges.u0)}“), v = 0 (ръб „${esc(edges.v0)}“), от готовия ръб; CNC ги отмества с дебелината на канта.</text>`;
  g += `<rect class="d-out" x="${U(0)}" y="${V(p.W)}" width="${p.L * k}" height="${p.W * k}"/>`;
  // edge banding: thick line just outside every banded edge
  const b = (dir) => p.bands[dir] || 0;
  const off = 0.9;
  if (b(neg(p.frame.ev))) g += `<line class="d-band" x1="${U(0)}" y1="${V(0) + off}" x2="${U(p.L)}" y2="${V(0) + off}"/>`;
  if (b(p.frame.ev)) g += `<line class="d-band" x1="${U(0)}" y1="${V(p.W) - off}" x2="${U(p.L)}" y2="${V(p.W) - off}"/>`;
  if (b(neg(p.frame.eu))) g += `<line class="d-band" x1="${U(0) - off}" y1="${V(0)}" x2="${U(0) - off}" y2="${V(p.W)}"/>`;
  if (b(p.frame.eu)) g += `<line class="d-band" x1="${U(p.L) + off}" y1="${V(0)}" x2="${U(p.L) + off}" y2="${V(p.W)}"/>`;
  // edge names
  g += `<text class="d-small" x="${U(p.L / 2)}" y="${V(p.W) - 2.2}" text-anchor="middle">ръб: ${esc(edges.v1)}</text>`;
  g += `<text class="d-small" x="${U(p.L / 2)}" y="${V(0) + 3.6}" text-anchor="middle">ръб: ${esc(edges.v0)}</text>`;
  g += `<text class="d-small" x="${U(0) - 2}" y="${V(p.W / 2)}" text-anchor="middle" transform="rotate(-90 ${U(0) - 2} ${V(p.W / 2)})">ръб: ${esc(edges.u0)}</text>`;
  g += `<text class="d-small" x="${U(p.L) + 3.4}" y="${V(p.W / 2)}" text-anchor="middle" transform="rotate(90 ${U(p.L) + 3.4} ${V(p.W / 2)})">ръб: ${esc(edges.u1)}</text>`;
  // grooves
  for (const gr of p.features.filter((f) => f.type === 'groove')) {
    const alongU = Math.abs(gr.v1 - gr.v2) < 0.01;
    const [u0, u1] = alongU ? [Math.min(gr.u1, gr.u2), Math.max(gr.u1, gr.u2)] : [gr.u1 - gr.w / 2, gr.u1 + gr.w / 2];
    const [v0, v1] = alongU ? [gr.v1 - gr.w / 2, gr.v1 + gr.w / 2] : [Math.min(gr.v1, gr.v2), Math.max(gr.v1, gr.v2)];
    g += `<rect class="d-groove" x="${U(u0)}" y="${V(v1)}" width="${(u1 - u0) * k}" height="${(v1 - v0) * k}"/>`;
  }
  // horizontal holes in the edges: hidden outline of the bore, depth into the part
  for (const op of p.edgeOps) {
    for (const [u, v] of op.at) {
      const into = op.depth;
      const r = op.d / 2;
      let rect;
      if (op.edge === p.frame.eu) rect = [u - into, v - r, into, op.d];
      else if (op.edge === neg(p.frame.eu)) rect = [u, v - r, into, op.d];
      else if (op.edge === p.frame.ev) rect = [u - r, v - into, op.d, into];
      else rect = [u - r, v, op.d, into];
      g += `<rect class="d-edgeop" x="${U(rect[0])}" y="${V(rect[1] + rect[3])}" width="${rect[2] * k}" height="${rect[3] * k}" stroke-dasharray="1 .6"/>`;
    }
  }
  // holes and their letters (system holes: one letter per row)
  const taggedRows = new Set();
  for (const h of holes) {
    const x = U(h.u);
    const y = V(h.v);
    if (h.mark) {
      g += `<path class="d-mark" d="M${x - 1} ${y}h2M${x} ${y - 1}v2"/>`;
      continue;
    }
    const r = Math.max(0.55, (h.d / 2) * k);
    g += `<circle class="${KEY.has(h.kind) ? 'd-key' : h.through ? 'd-thru' : 'd-hole'}" cx="${x}" cy="${y}" r="${r}"/>`;
    const rowKey = `${h.letter}|${h.v}`;
    if (h.kind !== 'cup-dowel' && (h.kind !== 'system' || !taggedRows.has(rowKey))) {
      taggedRows.add(rowKey);
      g += `<text class="d-tag" x="${x + r + 0.5}" y="${y - r - 0.4}">${h.letter}</text>`;
    }
  }
  // ordinate dimensions: key holes and edge holes, plus first/last system hole
  const ordU = new Map();
  const ordV = new Map();
  const addOrd = (u, v) => {
    if (!ordU.has(u)) ordU.set(u, { at: U(u), from: V(v), label: fmt(u) });
    if (!ordV.has(v)) ordV.set(v, { at: V(v), from: U(u), label: fmt(v) });
  };
  for (const h of holes) if (KEY.has(h.kind) && !h.mark && h.kind !== 'cup-dowel') addOrd(h.u, h.v);
  for (const op of p.edgeOps) for (const [u, v] of op.at) addOrd(u, v);
  const sys = holes.filter((h) => h.kind === 'system');
  if (sys.length) {
    const us = sys.map((h) => h.u);
    const vs = [...new Set(sys.map((h) => h.v))];
    addOrd(Math.min(...us), vs[0]);
    addOrd(Math.max(...us), vs[0]);
    for (const v of vs) addOrd(Math.min(...us), v);
  }
  g += ordinates([...ordU.values()], { axis: 'x', base: V(0) + 1.5, line: V(0) + 9, dir: 1 });
  g += ordinates([...ordV.values()], { axis: 'y', base: U(0) - 1.5, line: U(0) - 9, dir: -1 });
  g += `<text class="d-dt" x="${U(0) - 1}" y="${V(0) + 3}" text-anchor="end">0</text>`;
  g += dimH(U(0), U(p.L), V(p.W) - 7, fmt(p.L), { ext: [[U(0), V(p.W)], [U(p.L), V(p.W)]] });
  g += dimV(V(0), V(p.W), U(p.L) + 11, fmt(p.W), { ext: [[U(p.L), V(0)], [U(p.L), V(p.W)]] });
  if (p.grain) {
    const ay = V(p.W / 2);
    g += `<line class="d-grain" x1="${U(p.L * 0.42)}" y1="${ay}" x2="${U(p.L * 0.58)}" y2="${ay}" marker-start="url(#ARW)" marker-end="url(#ARW)"/><text class="d-small" x="${U(p.L / 2)}" y="${ay - 1.2}" text-anchor="middle">шарка</text>`;
  }

  // grouped hole table
  const tx = lay.table.x;
  let ty = lay.table.y;
  g += `<text class="d-vt" x="${tx}" y="${ty}">Отвори</text>`;
  ty += 5;
  g += `<text class="d-tl" x="${tx}" y="${ty}">Бук.</text><text class="d-tl" x="${tx + 9}" y="${ty}">Ø × дълбочина</text><text class="d-tl" x="${tx + 42}" y="${ty}">Бр.</text><text class="d-tl" x="${tx + 52}" y="${ty}">Предназначение · обков</text>`;
  const rows = [...groups.map((gr) => [gr.letter, gr.mark ? 'без отвор' : `Ø${fmt(gr.d)} × ${gr.through ? `${fmt(gr.depth)} (проходен)` : fmt(gr.depth)}`, gr.count, `${gr.purpose}${gr.label ? ` · ${gr.label}` : ''}`])];
  for (const op of p.edgeOps) rows.push(['Ч', `Ø${fmt(op.d)} × ${fmt(op.depth)}`, op.count, `хоризонтален в ръб „${edges[edgeKey(p, op.edge)]}“`]);
  for (const gr of p.features.filter((f) => f.type === 'groove')) {
    const alongU = Math.abs(gr.v1 - gr.v2) < 0.01;
    const at = alongU ? `${fmt(gr.v1 - gr.w / 2)} от ръб „${edges.v0}“` : `${fmt(gr.u1 - gr.w / 2)} от ръб „${edges.u0}“`;
    rows.push(['—', `канал ${fmt(gr.w)} × ${fmt(gr.depth)}`, 1, `L = ${fmt(Math.hypot(gr.u2 - gr.u1, gr.v2 - gr.v1))}, на ${at}`]);
  }
  const maxRows = lay.table.rows;
  rows.slice(0, maxRows).forEach((r, i) => {
    const y = ty + 5 + i * 4.6;
    g += `<text class="d-tag" x="${tx}" y="${y}">${esc(r[0])}</text><text class="d-note" x="${tx + 9}" y="${y}">${esc(r[1])}</text><text class="d-note" x="${tx + 42}" y="${y}">${r[2]}</text><text class="d-note" x="${tx + 52}" y="${y}">${esc(String(r[3]).slice(0, 62))}</text>`;
  });
  if (rows.length > maxRows) g += `<text class="d-small" x="${tx}" y="${ty + 5 + maxRows * 4.6}">още ${rows.length - maxRows} реда — пълната таблица е в раздел „Пробиване“ и в CSV.</text>`;
  // details
  pickDetails(p, holes, edges).slice(0, lay.slots.length).forEach((d, i) => {
    g += d(lay.slots[i]);
  });
  const cut = cutSize(p, model.spec.bandCompensation);
  const bandsTxt = Object.values(p.bands).filter(Boolean);
  g += `<text class="d-note" x="30" y="262">Готов размер ${fmt(p.L)} × ${fmt(p.W)} × ${fmt(p.T)}; разкрой ${fmt(cut.L)} × ${fmt(cut.W)}${model.spec.bandCompensation ? ' (компенсиран кант)' : ''}.</text>`;
  g += `<text class="d-note" x="30" y="267">Кант: ${bandsTxt.length ? `${bandsTxt.map(fmt).join(' / ')} mm ABS — дебелата линия` : 'няма'}. Хоризонталните отвори „Ч“ не са в G-кода.</text>`;
  g += `<text class="d-note" x="30" y="272">Отворите с буква A… са пробиване отгоре; пълните кръгове са проходни.</text>`;
  const material = `${STOCK[p.stock].name} ${fmt(p.T)} · ${decorName(p.decor)}`;
  return svgDoc(g + frame(`${p.id} ${p.name} ${fmt(p.L)}×${fmt(p.W)}`, meta, scale, sheetNo, sheetCount, material), `Чертеж с карта за пробиване: ${p.name}`);
}

function edgeKey(p, dir) {
  if (dir === p.frame.eu) return 'u1';
  if (dir === neg(p.frame.eu)) return 'u0';
  if (dir === p.frame.ev) return 'v1';
  return 'v0';
}

// Which enlarged details the part needs, most useful first.
function pickDetails(p, holes, edges) {
  const out = [];
  const cup = holes.find((h) => h.kind === 'cup');
  if (cup) {
    const fix = holes.filter((h) => (h.kind === 'cup-dowel' || h.kind === 'cup-screw') && Math.abs(h.u - cup.u) < 40);
    out.push((b) => hingeDetail(p, cup, fix, b));
  }
  const hand = holes.filter((h) => h.kind === 'handle');
  if (hand.length) out.push((b) => handleDetail(p, hand, edges, b));
  const front = p.role === 'side' || p.role === 'partition' ? frontEdgeV(p) : null;
  const plates = holes.filter((h) => h.kind === 'plate');
  if (plates.length >= 2 && front !== null) {
    const first = plates.sort((a, c) => a.u - c.u).slice(0, 2);
    out.push((b) => plateDetail(p, first, front, b));
  }
  const slides = holes.filter((h) => h.kind === 'slide');
  if (slides.length && front !== null) {
    const u0 = Math.min(...slides.map((h) => h.u));
    out.push((b) => slideDetail(p, slides.filter((h) => h.u === u0), front, b));
  }
  return out;
}

// v of the front edge of a side or partition (their v axis runs along the depth).
function frontEdgeV(p) {
  if (p.frame.ev === '+z') return p.W;
  if (p.frame.ev === '-z') return 0;
  return null;
}
