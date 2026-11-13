// The constructor tab: the front view of a free carcass (build-svg.js) with a selection — a cell, or several cells
// one above the other in a column for one door — a toolbar (undo, columns, split, merge) and an inspector for the
// selected column and cells. Every edit goes through engine/layout-edit.js and comes back as a new spec (apply); a
// template shows the way to make it a free carcass instead. Pointer, touch and keyboard do the same things.
import { CONVERTIBLE } from '../engine/layout.js';
import {
  addColumn,
  removeColumn,
  splitCell,
  mergeUp,
  dragBoundary,
} from '../engine/layout-edit.js';
import { TYPES } from '../engine/types.js';
import { $ } from './dom.js';
import { frontSvg, builtColumns } from './build-svg.js';
import { bindDrag } from './build-drag.js';
import { showInspector, bindInspector } from './build-inspector.js';

const KEY_STEP = { plain: 1, shift: 10 };

// steps (steps.js): apply(spec, { record, transient }) — the new spec; step(±1) — undo, redo; personalize().
// onSelect(selection): every new selection (the 3D view lights it).
export function bindBuilder({ panel, isReadOnly, steps, onSelect = () => {} }) {
  const { apply, history, personalize } = steps;
  const t = JSON.parse(panel.dataset.text);
  const front = $('#bld-front', panel);
  const insp = $('#bld-insp', panel);
  let sel = { column: 0, from: 0, to: 0 };
  let current = { model: null, spec: null };
  let showFronts = true;
  // the grid drawn (it matches the model) and the grid as it is now, which every edit starts from: an edit of the
  // rail still waiting for its recompute stays in the spec
  const grid = () => current.spec.grid;
  const live = () => steps.spec().grid ?? grid();
  const edit = (g, opts = {}) => {
    if (isReadOnly() || g === live()) return;
    apply({ ...steps.spec(), grid: g }, { record: true, ...opts });
  };
  const built = () => builtColumns(current.model);
  const builtCol = (c) => built().find((x) => x.column === c);
  const cellSize = (c, k) => {
    const cell = builtCol(c)?.cells[k];
    return cell ? cell.y1 - cell.y0 : 0;
  };

  // the columns that are built (the model leaves out those that do not fit): the selection stays in them
  const lastColumn = () => Math.min(grid().columns.length, Math.max(1, built().length)) - 1;
  function clampSel() {
    const cols = grid().columns;
    const column = Math.min(sel.column, lastColumn());
    const n = cols[column].cells.length;
    const from = Math.min(sel.from, n - 1);
    sel = { column, from, to: Math.min(Math.max(sel.to, from), n - 1) };
  }

  // from the 3D view too, before the tab was ever drawn: kept, drawn when it is
  function select(next, focus = false) {
    sel = next;
    if (current.spec?.type !== 'custom') return;
    clampSel();
    draw();
    onSelect({ ...sel });
    if (focus) $(`.c-cell[data-col="${sel.column}"][data-cell="${sel.from}"]`, front)?.focus();
  }

  /* ---------- drawing ---------- */

  function draw() {
    const focused =
      document.activeElement && front.contains(document.activeElement)
        ? keyOf(document.activeElement)
        : null;
    front.innerHTML = frontSvg(current.model, sel, t, { fronts: showFronts });
    if (focused) $(focused, front)?.focus();
    showInspector(ctx);
  }

  const keyOf = (el) =>
    el.classList.contains('c-handle')
      ? `.c-handle[data-axis="${el.dataset.axis}"][data-col="${el.dataset.col}"]${el.dataset.cell ? `[data-cell="${el.dataset.cell}"]` : ''}`
      : `.c-cell[data-col="${el.dataset.col}"][data-cell="${el.dataset.cell}"]`;

  // what the inspector reads and how it edits (build-inspector.js)
  const ctx = {
    t,
    panel,
    insp,
    isReadOnly,
    history,
    edit,
    grid,
    live,
    sel: () => sel,
    builtCol,
    cellSize,
    sizesX: () => sizesX(),
    // the side the engine hung the door over a cell on (its part knows its place)
    doorSide: (c, k) =>
      current.model.parts.find(
        (p) => p.role === 'door' && p.place?.column === c && p.place?.cell === k,
      )?.hingeSide ?? null,
  };

  /* ---------- the view: select, keys, drag ---------- */

  front.addEventListener('click', (ev) => {
    const g = ev.target.closest('.c-cell');
    if (!g) return;
    const column = Number(g.dataset.col);
    const k = Number(g.dataset.cell);
    if (ev.shiftKey && column === sel.column)
      select({ column, from: Math.min(sel.from, k), to: Math.max(sel.to, k) });
    else select({ column, from: k, to: k });
    $(`.c-cell[data-col="${column}"][data-cell="${k}"]`, front)?.focus();
  });

  front.addEventListener('keydown', (ev) => {
    const el = ev.target;
    if (el.classList?.contains('c-cell')) cellKey(ev);
    else if (el.classList?.contains('c-handle')) handleKey(ev, el);
  });

  function cellKey(ev) {
    const cols = grid().columns;
    let next = null;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const column = Math.max(
        0,
        Math.min(lastColumn(), sel.column + (ev.key === 'ArrowLeft' ? -1 : 1)),
      );
      next = { column, from: sel.from, to: sel.from };
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      const up = ev.key === 'ArrowUp';
      const n = cols[sel.column].cells.length;
      if (ev.shiftKey)
        next = up
          ? { ...sel, to: Math.min(n - 1, sel.to + 1) }
          : { ...sel, to: Math.max(sel.from, sel.to - 1) };
      else {
        const k = Math.max(0, Math.min(n - 1, sel.from + (up ? 1 : -1)));
        next = { column: sel.column, from: k, to: k };
      }
    } else if (ev.key === 'Enter' || ev.key === ' ') next = { ...sel };
    else return;
    ev.preventDefault();
    select(next, true);
  }

  let lastKey = { el: null, at: 0 };
  function handleKey(ev, el) {
    const axis = el.dataset.axis;
    const keys = axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowDown: -1, ArrowUp: 1 };
    if (!(ev.key in keys)) return;
    ev.preventDefault();
    const key = keyOf(el);
    // a run of key presses on one handle is one step to undo
    const record = lastKey.el !== key || performance.now() - lastKey.at > 800;
    lastKey = { el: key, at: performance.now() };
    moveBoundary(el, keys[ev.key] * (ev.shiftKey ? KEY_STEP.shift : KEY_STEP.plain), { record });
  }

  function boundary(el) {
    const column = Number(el.dataset.col);
    if (el.dataset.axis === 'x') return { axis: 'x', column, sizes: sizesX() };
    const cell = Number(el.dataset.cell);
    return { axis: 'y', column, cell, sizes: builtCol(column).cells.map((c) => c.y1 - c.y0) };
  }
  // the widths as built, by grid index (a column not built has none: its boundary does not move)
  const sizesX = () => {
    const out = [];
    for (const c of built()) out[c.column] = c.x1 - c.x0;
    return out;
  };

  function moveBoundary(el, delta, opts) {
    edit(dragBoundary(live(), boundary(el), delta), opts);
  }

  bindDrag(front, {
    start: (el) => (isReadOnly() ? null : { from: live(), at: boundary(el) }),
    move: (s, delta, first) =>
      edit(dragBoundary(s.from, s.at, delta), { record: first, transient: true }),
    end: () => {},
  });

  /* ---------- toolbar and inspector ---------- */

  const on = (id, fn) => $(id, panel).addEventListener('click', fn);
  on('#bld-undo', () => steps.step(-1));
  on('#bld-redo', () => steps.step(1));
  on('#bld-add-left', () => {
    edit(addColumn(live(), sel.column));
    select({ column: sel.column, from: 0, to: 0 });
  });
  on('#bld-add-right', () => {
    edit(addColumn(live(), sel.column + 1));
    select({ column: sel.column + 1, from: 0, to: 0 });
  });
  on('#bld-remove', () => edit(removeColumn(live(), sel.column)));
  on('#bld-split', () =>
    edit(splitCell(live(), sel.column, sel.from, cellSize(sel.column, sel.from))),
  );
  on('#bld-merge', () => {
    let g = live();
    for (let k = sel.from === sel.to ? 1 : sel.to - sel.from; k > 0; k -= 1)
      g = mergeUp(g, sel.column, sel.from);
    edit(g);
    select({ column: sel.column, from: sel.from, to: sel.from });
  });
  $('#bld-fronts', panel).addEventListener('change', (ev) => {
    showFronts = ev.target.checked;
    draw();
  });

  bindInspector(ctx);

  // a template: the way to make it a free carcass (personalize: the same outside, columns, fills and fronts)
  $('#bld-personalize', panel).addEventListener('click', () => {
    if (!isReadOnly()) personalize();
  });

  return {
    // every new model, whatever tab is shown (a pick in 3D selects in it)
    update(model, spec) {
      current = { model, spec };
    },
    render(model, spec) {
      current = { model, spec };
      const free = spec.type === 'custom';
      $('#bld-template', panel).hidden = free;
      $('#bld-main', panel).hidden = !free;
      if (!free) {
        const convertible = CONVERTIBLE.includes(spec.type);
        $('#bld-template-text', panel).textContent = (
          convertible ? t.templateText : t.otherText
        ).replace('{type}', TYPES[spec.type].label);
        $('#bld-personalize', panel).textContent = convertible ? t.personalize : t.startFree;
        $('#bld-personalize', panel).disabled = isReadOnly();
        return;
      }
      clampSel();
      draw();
    },
    // what is selected (the 3D view lights it)
    get selection() {
      return { ...sel };
    },
    select,
  };
}
