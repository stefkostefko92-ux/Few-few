// The constructor's front view of a free carcass, drawn from the model as built (model.cells and the parts), in
// layers: the tint of every cell by its fill, the shelves and rails, the boards, the fronts with the opening of the
// doors dashed, the words of the cells, the selection's frame — and over all of it what the hand and the keyboard
// take: every cell a button (its focus ring on top), every boundary that moves a slider with a grip. World x goes
// right, y up; the SVG is in millimetres, y turned over.
import { esc } from '../engine/util.js';
import { LAYOUT_LIMITS } from '../engine/layout.js';

const BOARDS = new Set(['side', 'top', 'bottom', 'partition', 'divider', 'rail', 'plinth']);
const FRONTS = new Set(['door', 'drawer-front']);
const r = (v) => Math.round(v * 10) / 10;

// The columns as built, left to right: [{ column, carcass, x0, x1, cells: [cell…] }].
export function builtColumns(model) {
  const cols = new Map();
  for (const c of model.cells ?? []) {
    if (!cols.has(c.column))
      cols.set(c.column, { column: c.column, carcass: c.carcass, x0: c.x0, x1: c.x1, cells: [] });
    cols.get(c.column).cells.push(c);
  }
  return [...cols.values()].sort((a, b) => a.column - b.column);
}

function extents(model) {
  const xs = [];
  const ys = [0];
  for (const p of model.parts) {
    if (p.role === 'back') continue;
    xs.push(p.box.min[0], p.box.max[0]);
    ys.push(p.box.min[1], p.box.max[1]);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const rect = (cls, b, extra = '') =>
  `<rect class="${cls}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"${extra}/>`;

// t: the words (fill names, „авто“, the names of things for screen readers); sel: { column, from, to } or null.
export function frontSvg(model, sel, t, { fronts = true } = {}) {
  const ext = extents(model);
  const W = ext.x1 - ext.x0;
  const H = ext.y1 - ext.y0;
  const fs = r(Math.max(W, H) / 42); // text: about the same size on the screen whatever the furniture
  const pad = { l: fs * 1.5, r: fs * 3.5, t: fs * 3, b: fs * 3.2 };
  const Y = (y) => r(ext.y1 - y);
  const box = (b) => ({
    x: r(b.min[0]),
    y: Y(b.max[1]),
    w: r(b.max[0] - b.min[0]),
    h: r(b.max[1] - b.min[1]),
  });
  const cols = builtColumns(model);
  const inSel = (c) => sel && c.column === sel.column && c.cell >= sel.from && c.cell <= sel.to;
  const tints = [];
  const words = [];
  const buttons = [];
  for (const col of cols) {
    for (const c of col.cells) {
      const on = inSel(c);
      const auto = c.auto ? ` · ${t.auto}` : '';
      const what =
        c.fill === 'shelves' || c.fill === 'drawers'
          ? `${t.fill[c.fill]} × ${c.n}`
          : t.fill[c.fill];
      const label = `${t.column} ${c.column + 1}, ${t.cell} ${c.cell + 1}: ${what}, ${Math.round(c.y1 - c.y0)} mm${auto}`;
      const b = { x: r(c.x0), y: Y(c.y1), w: r(c.x1 - c.x0), h: r(c.y1 - c.y0) };
      tints.push(rect(`c-tint f-${c.fill}${on ? ' is-sel' : ''}`, b));
      words.push(...cellWords(b, what, `${Math.round(b.h)}${auto}`, fs));
      // the selected one is the tab stop
      const stop = sel && c.column === sel.column && c.cell === sel.from;
      buttons.push(
        `<g class="c-cell" role="button" tabindex="${stop ? 0 : -1}" aria-pressed="${on}" aria-label="${esc(label)}" data-col="${c.column}" data-cell="${c.cell}">${rect('c-hit', b)}</g>`,
      );
    }
  }
  const out = [...tints];
  // what is inside the cells: adjustable shelves, hanging rails; then the boards
  for (const p of model.parts)
    if (p.role === 'shelf' && p.place) out.push(rect('c-shelf', box(p.box)));
  for (const s of model.symbols)
    if (s.type === 'rail' && s.place)
      out.push(
        `<line class="c-rail" x1="${r(s.x0)}" y1="${Y(s.y)}" x2="${r(s.x1)}" y2="${Y(s.y)}" stroke-width="${r(s.h ?? 25)}"/>`,
      );
  for (const p of model.parts)
    if (BOARDS.has(p.role))
      out.push(rect(`c-board${p.role === 'divider' ? ' is-fixed' : ''}`, box(p.box)));
  // the fronts, the opening of a door dashed from its hinge edge
  if (fronts) {
    for (const p of model.parts) {
      if (!FRONTS.has(p.role)) continue;
      const b = box(p.box);
      out.push(rect(`c-front${p.role === 'door' ? '' : ' is-drawer'}`, b));
      if (p.role !== 'door') continue;
      const hx = p.hingeSide === 'left' ? b.x : b.x + b.w;
      const ox = p.hingeSide === 'left' ? b.x + b.w : b.x;
      out.push(
        `<path class="c-swing" d="M${hx} ${b.y}L${ox} ${r(b.y + b.h / 2)}L${hx} ${r(b.y + b.h)}"/>`,
      );
    }
  }
  out.push(...words);
  // the selection, over everything it is under
  const sc = sel && cols.find((c) => c.column === sel.column);
  const [lo, hi] = sc ? [sc.cells[sel.from], sc.cells[sel.to]] : [];
  if (lo && hi)
    out.push(rect('c-sel', { x: r(sc.x0), y: Y(hi.y1), w: r(sc.x1 - sc.x0), h: r(hi.y1 - lo.y0) }));
  out.push(...buttons, ...handles(cols, t, Y, sel, fs), ...dims(cols, ext, fs, Y));
  const vb = `${r(ext.x0 - pad.l)} ${r(-pad.t)} ${r(W + pad.l + pad.r)} ${r(H + pad.t + pad.b)}`;
  return `<svg class="c-svg" viewBox="${vb}" role="group" aria-label="${esc(t.view)}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}

// What a cell holds and its height, in its middle, as large as the cell lets the words be (about 0,56 em a letter).
// Words that would be smaller than about ¾ of the drawing's text are left out: the inspector and the cell's name
// for a screen reader still say them.
function cellWords({ x, y, w, h }, what, size, fs) {
  const fit = (text, max) => Math.min(max, (w * 0.86) / (text.length * 0.56));
  const big = fit(what, fs);
  const small = fit(size, fs * 0.85);
  const cx = r(x + w / 2);
  const cy = r(y + h / 2);
  const out = [];
  const both = big >= fs * 0.75 && h > fs * 2.6;
  if (both)
    out.push(
      `<text class="c-what" x="${cx}" y="${r(cy - big * 0.2)}" font-size="${r(big)}">${esc(what)}</text>`,
    );
  if (small >= fs * 0.7 && h > small * 1.4)
    out.push(
      `<text class="c-size" x="${cx}" y="${r(both ? cy + small * 1.25 : cy + small * 0.35)}" font-size="${r(small)}">${esc(size)}</text>`,
    );
  return out;
}

// A boundary that moves: a slider with a wide invisible zone for the finger, the board lit when it has the focus or
// the pointer, and a grip of three dots in its middle that says it can be dragged.
function handle(axis, b, grip, attrs) {
  const dot = (cx, cy) => `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(grip.r)}"/>`;
  const dots = [-1, 0, 1].map((k) =>
    axis === 'x' ? dot(grip.x, grip.y + k * grip.step) : dot(grip.x + k * grip.step, grip.y),
  );
  return `<g class="c-handle is-${axis}" role="slider" ${attrs}>${rect('c-zone', b)}${rect('c-bar', b)}<g class="c-grip">${dots.join('')}</g></g>`;
}

// One between two columns (the partition, or the two sides where a wide furniture is split into carcasses) and one
// between two cells of a column (the fixed shelf). The ones by the selected cell are tab stops; the arrows move them
// (aria: the size before the boundary).
function handles(cols, t, Y, sel, fs) {
  const out = [];
  const g = { r: fs * 0.11, step: fs * 0.38 };
  const near = (col, k) =>
    sel && sel.column === col && (k === undefined || k === sel.from - 1 || k === sel.to);
  for (let i = 0; i + 1 < cols.length; i++) {
    const [a, b] = [cols[i], cols[i + 1]];
    const lo = Math.min(a.cells[0].y0, b.cells[0].y0);
    const hi = Math.max(a.cells.at(-1).y1, b.cells.at(-1).y1);
    const w = Math.round(a.x1 - a.x0);
    const max = Math.round(w + b.x1 - b.x0 - LAYOUT_LIMITS.minColumn);
    const stop = near(a.column) || near(b.column);
    const attrs = `tabindex="${stop ? 0 : -1}" aria-orientation="horizontal" aria-label="${esc(`${t.between} ${a.column + 1} ${t.and} ${b.column + 1}`)}" aria-valuenow="${w}" aria-valuemin="${LAYOUT_LIMITS.minColumn}" aria-valuemax="${max}" aria-valuetext="${w} mm" data-axis="x" data-col="${a.column}"`;
    const bx = { x: r(a.x1), y: Y(hi), w: r(b.x0 - a.x1), h: r(hi - lo) };
    out.push(handle('x', bx, { ...g, x: (a.x1 + b.x0) / 2, y: Y((lo + hi) / 2) }, attrs));
  }
  for (const col of cols) {
    for (let k = 0; k + 1 < col.cells.length; k++) {
      const [a, b] = [col.cells[k], col.cells[k + 1]];
      const h = Math.round(a.y1 - a.y0);
      const max = Math.round(h + b.y1 - b.y0 - LAYOUT_LIMITS.minCell);
      const attrs = `tabindex="${near(col.column, k) ? 0 : -1}" aria-orientation="vertical" aria-label="${esc(`${t.fixed} ${col.column + 1}.${k + 1}`)}" aria-valuenow="${h}" aria-valuemin="${LAYOUT_LIMITS.minCell}" aria-valuemax="${max}" aria-valuetext="${h} mm" data-axis="y" data-col="${col.column}" data-cell="${k}"`;
      const by = { x: r(col.x0), y: Y(b.y0), w: r(col.x1 - col.x0), h: r(b.y0 - a.y1) };
      out.push(handle('y', by, { ...g, x: (col.x0 + col.x1) / 2, y: Y((a.y1 + b.y0) / 2) }, attrs));
    }
  }
  return out;
}

// The widths of the columns under the furniture, the whole width over it, the whole height on the right.
function dims(cols, ext, fs, Y) {
  const out = [];
  const yb = r(Y(ext.y0) + fs * 1.6);
  for (const c of cols)
    out.push(
      `<text class="c-dim" x="${r((c.x0 + c.x1) / 2)}" y="${yb}" font-size="${r(fs * 0.9)}">${Math.round(c.x1 - c.x0)}</text>`,
    );
  out.push(
    `<text class="c-dim is-total" x="${r((ext.x0 + ext.x1) / 2)}" y="${r(-fs * 1.1)}" font-size="${fs}">${Math.round(ext.x1 - ext.x0)} mm</text>`,
  );
  const xr = r(ext.x1 + fs * 1.8);
  const ym = r(Y((ext.y0 + ext.y1) / 2));
  out.push(
    `<text class="c-dim is-total" x="${xr}" y="${ym}" font-size="${fs}" transform="rotate(-90 ${xr} ${ym})">${Math.round(ext.y1 - ext.y0)} mm</text>`,
  );
  return out;
}
