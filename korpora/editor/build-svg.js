// The constructor's front view of a free carcass, drawn from the model as built (model.cells and the parts): the
// boards, every cell a button (its fill and its height), the shelves and rails in it, the fronts over the cells with
// the opening of the doors dashed, and a handle on every partition and fixed shelf that can be dragged. World x goes
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
  const out = [];
  const labels = [];

  // cells: the clear inside, a button each (the selected one is the tab stop); their words go over the fronts
  for (const col of cols) {
    for (const c of col.cells) {
      const on = inSel(c);
      const auto = c.auto ? ` · ${t.auto}` : '';
      const what =
        c.fill === 'shelves' || c.fill === 'drawers'
          ? `${t.fill[c.fill]} × ${c.n}`
          : t.fill[c.fill];
      const label = `${t.column} ${c.column + 1}, ${t.cell} ${c.cell + 1}: ${what}, ${Math.round(c.y1 - c.y0)} mm${auto}`;
      const x = r(c.x0);
      const y = Y(c.y1);
      const w = r(c.x1 - c.x0);
      const h = r(c.y1 - c.y0);
      out.push(
        `<g class="c-cell f-${c.fill}${on ? ' is-sel' : ''}" role="button" tabindex="${sel && c.column === sel.column && c.cell === sel.from ? 0 : -1}" aria-pressed="${on}" aria-label="${esc(label)}" data-col="${c.column}" data-cell="${c.cell}">`,
      );
      out.push(`<rect class="c-in" x="${x}" y="${y}" width="${w}" height="${h}"/>`, '</g>');
      labels.push(...cellWords({ x, y, w, h }, what, `${Math.round(h)}${auto}`, fs));
    }
  }
  // what is inside the cells: adjustable shelves, hanging rails
  for (const p of model.parts)
    if (p.role === 'shelf' && p.place) {
      const b = box(p.box);
      out.push(`<rect class="c-shelf" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`);
    }
  for (const s of model.symbols)
    if (s.type === 'rail' && s.place)
      out.push(
        `<line class="c-rail" x1="${r(s.x0)}" y1="${Y(s.y)}" x2="${r(s.x1)}" y2="${Y(s.y)}" stroke-width="${r(s.h ?? 25)}"/>`,
      );
  // the boards
  for (const p of model.parts)
    if (BOARDS.has(p.role)) {
      const b = box(p.box);
      out.push(
        `<rect class="c-board${p.role === 'divider' ? ' is-fixed' : ''}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`,
      );
    }
  // the fronts, the opening of a door dashed from its hinge edge
  if (fronts) {
    for (const p of model.parts)
      if (FRONTS.has(p.role)) {
        const b = box(p.box);
        out.push(
          `<rect class="c-front${p.role === 'door' ? '' : ' is-drawer'}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`,
        );
        if (p.role === 'door') {
          const hx = p.hingeSide === 'left' ? b.x : b.x + b.w;
          const ox = p.hingeSide === 'left' ? b.x + b.w : b.x;
          out.push(
            `<path class="c-swing" d="M${hx} ${b.y}L${ox} ${r(b.y + b.h / 2)}L${hx} ${r(b.y + b.h)}"/>`,
          );
        }
      }
  }
  out.push(...labels);
  // the selection, over everything it is under
  const sc = sel && cols.find((c) => c.column === sel.column);
  const [lo, hi] = sc ? [sc.cells[sel.from], sc.cells[sel.to]] : [];
  if (lo && hi)
    out.push(
      `<rect class="c-sel" x="${r(sc.x0)}" y="${Y(hi.y1)}" width="${r(sc.x1 - sc.x0)}" height="${r(hi.y1 - lo.y0)}"/>`,
    );
  out.push(...handles(cols, t, Y, sel));
  out.push(...dims(cols, ext, fs, Y));
  const vb = `${r(ext.x0 - pad.l)} ${r(-pad.t)} ${r(W + pad.l + pad.r)} ${r(H + pad.t + pad.b)}`;
  return `<svg class="c-svg" viewBox="${vb}" role="group" aria-label="${esc(t.view)}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}

// What a cell holds and its height, in its middle, as large as the cell lets the words be (about 0,56 em a letter);
// too narrow even at half the size: the height only.
function cellWords({ x, y, w, h }, what, size, fs) {
  if (h < fs * 1.6 || w < fs * 1.6) return [];
  const fit = (text, max) => Math.min(max, (w * 0.86) / (text.length * 0.56));
  const big = fit(what, fs);
  const small = fit(size, fs * 0.85);
  const cx = r(x + w / 2);
  const cy = r(y + h / 2);
  const out = [];
  const both = big >= fs * 0.5 && h > fs * 2.6;
  if (both)
    out.push(
      `<text class="c-what" x="${cx}" y="${r(cy - big * 0.2)}" font-size="${r(big)}">${esc(what)}</text>`,
    );
  out.push(
    `<text class="c-size" x="${cx}" y="${r(both ? cy + small * 1.25 : cy + small * 0.35)}" font-size="${r(small)}">${esc(size)}</text>`,
  );
  return out;
}

// A handle on every boundary that can move: between two columns (the partition, or the two sides where a wide
// furniture is split into carcasses) and between two cells of a column (the fixed shelf). The ones by the selected
// cell are tab stops; the arrows move them (aria: the size before the boundary).
function handles(cols, t, Y, sel) {
  const out = [];
  const near = (col, k) =>
    sel && sel.column === col && (k === undefined || k === sel.from - 1 || k === sel.to);
  for (let i = 0; i + 1 < cols.length; i++) {
    const [a, b] = [cols[i], cols[i + 1]];
    const lo = Math.min(a.cells[0].y0, b.cells[0].y0);
    const hi = Math.max(a.cells.at(-1).y1, b.cells.at(-1).y1);
    const w = Math.round(a.x1 - a.x0);
    const range = `aria-valuemin="${LAYOUT_LIMITS.minColumn}" aria-valuemax="${Math.round(w + b.x1 - b.x0 - LAYOUT_LIMITS.minColumn)}"`;
    const stop = near(a.column) || near(b.column);
    out.push(
      `<rect class="c-handle is-x" x="${r(a.x1)}" y="${Y(hi)}" width="${r(b.x0 - a.x1)}" height="${r(hi - lo)}" role="slider" tabindex="${stop ? 0 : -1}" aria-orientation="horizontal" aria-label="${esc(`${t.between} ${a.column + 1} ${t.and} ${b.column + 1}`)}" aria-valuenow="${w}" ${range} aria-valuetext="${w}\u00a0mm" data-axis="x" data-col="${a.column}"/>`,
    );
  }
  for (const col of cols) {
    for (let k = 0; k + 1 < col.cells.length; k++) {
      const [a, b] = [col.cells[k], col.cells[k + 1]];
      const h = Math.round(a.y1 - a.y0);
      const range = `aria-valuemin="${LAYOUT_LIMITS.minCell}" aria-valuemax="${Math.round(h + b.y1 - b.y0 - LAYOUT_LIMITS.minCell)}"`;
      out.push(
        `<rect class="c-handle is-y" x="${r(col.x0)}" y="${Y(b.y0)}" width="${r(col.x1 - col.x0)}" height="${r(b.y0 - a.y1)}" role="slider" tabindex="${near(col.column, k) ? 0 : -1}" aria-orientation="vertical" aria-label="${esc(`${t.fixed} ${col.column + 1}.${k + 1}`)}" aria-valuenow="${h}" ${range} aria-valuetext="${h}\u00a0mm" data-axis="y" data-col="${col.column}" data-cell="${k}"/>`,
      );
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
  out.push(
    `<text class="c-dim is-total" x="${xr}" y="${r(Y((ext.y0 + ext.y1) / 2))}" font-size="${fs}" transform="rotate(-90 ${xr} ${r(Y((ext.y0 + ext.y1) / 2))})">${Math.round(ext.y1 - ext.y0)} mm</text>`,
  );
  return out;
}
