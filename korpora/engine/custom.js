// The free carcass („Свободен корпус“): the columns of spec.grid (layout.js) at the widths asked for — „авто“ ones share
// the rest — in one carcass, or in several side by side when it is wider than MAX_CARCASS_W, split only between columns.
// Each column goes to buildCarcass with its cells and fronts (cells.js).
import { buildCarcass } from './carcass.js';
import { STOCK } from './materials.js';
import { r1, dimTxt } from './util.js';
import { resolveSizes, splitCarcasses, fitCount, MAX_CARCASS_W, LAYOUT_LIMITS } from './layout.js';

const T = STOCK.pb18.thickness;

// The carcasses of these columns (the widths of one carcass decide where to split) and the width left to the columns:
// each carcass has a side more than its columns.
function carcassesOf(asked, W, min) {
  const groups = W > MAX_CARCASS_W ? splitCarcasses(resolveSizes(asked, Math.max(W - (asked.length + 1) * T, asked.length * min), min).sizes) : [asked.map((_, i) => i)];
  return { groups, avail: W - groups.reduce((a, g) => a + (g.length + 1) * T, 0) };
}

export function buildCustom(ctx, s, common) {
  const W = s.width;
  const min = LAYOUT_LIMITS.minColumn;
  // the columns that fit at their minimum width (a 300 mm carcass takes one); the others are not built — an error
  const k = fitCount(s.grid.columns.length, (n) => carcassesOf(s.grid.columns.slice(0, n).map((c) => c.w), W, min).avail, min);
  if (k < s.grid.columns.length) ctx.warn('error', ctx.t('w.columnsNoFit', { W: ctx.t.num(W), n: s.grid.columns.length, min, k }));
  const cols = s.grid.columns.slice(0, k);
  const asked = cols.map((c) => c.w);
  const { groups, avail } = carcassesOf(asked, W, min);
  const res = resolveSizes(asked, avail, min);
  if (res.over) ctx.warn('warn', ctx.t('w.columnsOver', { sum: ctx.t.num(r1(asked.reduce((a, w) => a + (w ?? min), 0))), avail: ctx.t.num(r1(avail)) }));
  if (groups.length > 1) ctx.warn('info', ctx.t('w.split', { n: groups.length, cols: groups.map((g) => g.length).join(' + ') }));
  const wall = s.placement === 'wall';
  const plinth = wall || !s.legs ? { type: 'none', h: 0 } : { type: s.plinth, h: s.legs };
  let x0 = 0;
  groups.forEach((g, gi) => {
    const Wg = gi === groups.length - 1 ? W - x0 : r1(g.reduce((a, i) => a + res.sizes[i], 0) + (g.length + 1) * T);
    buildCarcass(ctx, {
      ...common, kind: wall ? 'wall' : 'custom', module: groups.length > 1 ? ctx.t('mod.carcass', { n: gi + 1 }) : '', x0, y0: wall ? s.mount : 0,
      W: Wg, H: s.height, D: s.depth, plinth, top: s.top, visibleTop: s.top === 'between', mount: wall ? 'wall' : undefined,
      columns: g.map((i) => ({ weight: res.sizes[i], cells: cols[i].cells, fronts: cols[i].fronts, layoutIndex: i, carcassIndex: gi })),
    });
    x0 += Wg;
  });
}
