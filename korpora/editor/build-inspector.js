// The constructor's inspector and toolbar state: the selected column (its width) and cells (height, fill, count,
// front, hinges), and which tools can act on them. ctx (build-panel.js): the words, the panel, the grid, the
// selection, the sizes as built and edit(grid) — every change goes back through it as a new grid.
import { LAYOUT_LIMITS } from '../engine/layout.js';
import {
  setWidth,
  setHeight,
  setFill,
  setCount,
  setFront,
  frontAt,
} from '../engine/layout-edit.js';
import { $, $$ } from './dom.js';

const T = 18;

export function showInspector(ctx) {
  const { t, panel, insp, isReadOnly, history } = ctx;
  const sel = ctx.sel();
  const g = ctx.grid();
  const col = g.columns[sel.column];
  const one = sel.from === sel.to;
  const cells = col.cells.slice(sel.from, sel.to + 1);
  const b = ctx.builtCol(sel.column);
  $('#bld-col-title', insp).textContent = t.colTitle.replace('{n}', sel.column + 1);
  $('#bld-cell-title', insp).textContent = one
    ? t.cellTitle.replace('{n}', sel.from + 1)
    : t.cellsTitle.replace('{from}', sel.from + 1).replace('{to}', sel.to + 1);
  field(
    ctx,
    '#bld-w',
    col.w,
    b ? b.x1 - b.x0 : null,
    LAYOUT_LIMITS.minColumn,
    LAYOUT_LIMITS.maxColumn,
  );
  field(
    ctx,
    '#bld-h',
    one ? col.cells[sel.from].h : null,
    one ? ctx.cellSize(sel.column, sel.from) : null,
    LAYOUT_LIMITS.minCell,
    LAYOUT_LIMITS.maxCell,
    !one,
  );
  const fills = new Set(cells.map((c) => c.fill));
  for (const r of $$('input[name="bld-fill"]', insp)) {
    r.checked = fills.size === 1 && fills.has(r.value);
    r.disabled = isReadOnly();
  }
  const counted = fills.size === 1 && (fills.has('shelves') || fills.has('drawers'));
  $('#bld-n-row', insp).hidden = !counted;
  if (counted) {
    const n = $('#bld-n', insp);
    n.min = fills.has('drawers') ? '1' : '0';
    n.max = String(fills.has('drawers') ? LAYOUT_LIMITS.drawers : LAYOUT_LIMITS.shelves);
    n.disabled = isReadOnly();
    if (document.activeElement !== n) n.value = String(cells[0].n);
  }
  // the front over the selected cells: theirs exactly, another one over some of them (mixed), or none
  const drawers = cells.some((c) => c.fill === 'drawers');
  const f = frontAt(col, sel.from);
  const exact = f && f.from === sel.from && f.to === sel.to;
  const kind = drawers ? 'none' : exact ? f.kind : f ? 'mixed' : 'none';
  for (const r of $$('input[name="bld-front"]', insp)) {
    r.checked = r.value === kind;
    r.disabled = drawers || isReadOnly();
  }
  $('#bld-front-note', insp).textContent = drawers
    ? t.drawersOwn
    : kind === 'mixed'
      ? t.frontOther.replace('{from}', f.from + 1).replace('{to}', f.to + 1)
      : '';
  $('#bld-hinge-row', insp).hidden = kind !== 'door';
  // a door without a side asked for hangs where the engine hung it (its own rule, by the column)
  const hinge = kind === 'door' ? (f.hinge ?? ctx.doorSide(sel.column, f.from)) : null;
  for (const r of $$('input[name="bld-hinge"]', insp)) {
    r.checked = hinge === r.value;
    r.disabled = isReadOnly();
  }
  const cols = g.columns.length;
  const tool = (id, ok) => {
    $(id, panel).disabled = isReadOnly() || !ok;
  };
  tool('#bld-undo', history.canUndo);
  tool('#bld-redo', history.canRedo);
  tool('#bld-add-left', cols < LAYOUT_LIMITS.columns);
  tool('#bld-add-right', cols < LAYOUT_LIMITS.columns);
  tool('#bld-remove', cols > 1);
  const roomToSplit = ctx.cellSize(sel.column, sel.from) >= 2 * LAYOUT_LIMITS.minCell + T;
  tool('#bld-split', one && col.cells.length < LAYOUT_LIMITS.cells && roomToSplit);
  tool('#bld-merge', !one || sel.from + 1 < col.cells.length);
  $('#bld-merge', panel).textContent = one ? t.merge : t.mergeRange;
}

// A size field: the asked size, or the built one under „авто“ (shown, not editable); off: not for this selection.
function field(ctx, id, asked, builtSize, min, max, off = false) {
  const input = $(id, ctx.insp);
  const auto = $(`${id}-auto`, ctx.insp);
  input.min = String(min);
  input.max = String(max);
  auto.checked = asked === null && !off;
  auto.disabled = off || ctx.isReadOnly();
  input.disabled = off || asked === null || ctx.isReadOnly();
  if (document.activeElement !== input)
    input.value = off || builtSize === null ? '' : String(Math.round(asked ?? builtSize));
}

export function bindInspector(ctx) {
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
  ctx.insp.addEventListener('change', (ev) => {
    const el = ev.target;
    const g = ctx.live();
    const sel = ctx.sel();
    const c = sel.column;
    const each = (fn) => {
      let out = g;
      for (let k = sel.from; k <= sel.to; k++) out = fn(out, k);
      return out;
    };
    const hinge = () =>
      frontAt(g.columns[c], sel.from)?.hinge ?? ctx.doorSide(c, sel.from) ?? 'left';
    let next = null;
    if (el.id === 'bld-w')
      next = setWidth(g, c, num(el.value, LAYOUT_LIMITS.minColumn, LAYOUT_LIMITS.maxColumn));
    else if (el.id === 'bld-w-auto')
      next = setWidth(
        g,
        c,
        el.checked ? null : Math.round(ctx.sizesX()[c] ?? LAYOUT_LIMITS.minColumn),
      );
    else if (el.id === 'bld-h')
      next = setHeight(g, c, sel.from, num(el.value, LAYOUT_LIMITS.minCell, LAYOUT_LIMITS.maxCell));
    else if (el.id === 'bld-h-auto')
      next = setHeight(g, c, sel.from, el.checked ? null : Math.round(ctx.cellSize(c, sel.from)));
    else if (el.name === 'bld-fill') next = each((x, k) => setFill(x, c, k, el.value));
    else if (el.id === 'bld-n')
      next = each((x, k) => setCount(x, c, k, Math.round(Number(el.value)) || 0));
    else if (el.name === 'bld-front') next = setFront(g, c, sel.from, sel.to, el.value, hinge());
    else if (el.name === 'bld-hinge') next = setFront(g, c, sel.from, sel.to, 'door', el.value);
    if (next) ctx.edit(next);
  });
}
