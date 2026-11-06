// The free carcass („Свободен корпус“): the columns of spec.grid (layout.js) at the widths asked for — „авто“ ones share
// the rest — in one carcass, or in several side by side when it is wider than MAX_CARCASS_W, split only between columns.
// Each column goes to buildCarcass with its cells and fronts (cells.js).
import { buildCarcass } from './carcass.js';
import { STOCK } from './materials.js';
import { r1, dimTxt } from './util.js';
import { resolveSizes, splitCarcasses, MAX_CARCASS_W, LAYOUT_LIMITS } from './layout.js';

const T = STOCK.pb18.thickness;

export function buildCustom(ctx, s, common) {
  const cols = s.grid.columns;
  const W = s.width;
  const asked = cols.map((c) => c.w);
  const min = LAYOUT_LIMITS.minColumn;
  // the carcasses from the widths of one carcass; then the widths again, each split adds a side
  const groups = W > MAX_CARCASS_W ? splitCarcasses(resolveSizes(asked, W - (cols.length + 1) * T, min).sizes) : [cols.map((_, i) => i)];
  const avail = W - groups.reduce((a, g) => a + (g.length + 1) * T, 0);
  const res = resolveSizes(asked, avail, min);
  if (res.over) ctx.warn('warn', `Зададените ширини на колоните (${dimTxt(r1(asked.reduce((a, w) => a + (w ?? min), 0)))} mm) не се побират в ${dimTxt(r1(avail))} mm — разпределени са пропорционално.`);
  if (groups.length > 1) ctx.warn('info', `Мебелта е разделена на ${groups.length} корпуса (${groups.map((g) => g.length).join(' + ')} колони) — по-лесен транспорт, детайлите се побират в листа.`);
  const wall = s.placement === 'wall';
  const plinth = wall || !s.legs ? { type: 'none', h: 0 } : { type: s.plinth, h: s.legs };
  let x0 = 0;
  groups.forEach((g, gi) => {
    const Wg = gi === groups.length - 1 ? W - x0 : r1(g.reduce((a, i) => a + res.sizes[i], 0) + (g.length + 1) * T);
    buildCarcass(ctx, {
      ...common, kind: wall ? 'wall' : 'custom', module: groups.length > 1 ? `К${gi + 1}` : '', x0, y0: wall ? s.mount : 0,
      W: Wg, H: s.height, D: s.depth, plinth, top: s.top, visibleTop: s.top === 'between', mount: wall ? 'wall' : undefined,
      columns: g.map((i) => ({ weight: res.sizes[i], cells: cols[i].cells, fronts: cols[i].fronts, layoutIndex: i, carcassIndex: gi })),
    });
    x0 += Wg;
  });
}
