// Furniture types: parameter schema (drives the form), defaults, limits and the builder that turns the spec
// into carcasses, beds or compositions of modules.
import { buildCarcass } from './carcass.js';
import { buildBed } from './bed.js';
import { buildDesk } from './desk.js';
import { holeThrough, mark } from './panel.js';
import { STOCK, frontStock } from './materials.js';
import { clamp, r1 } from './util.js';

const R = (key, label, min, max, step, unit = 'mm') => ({ key, label, type: 'range', min, max, step, unit });
const S = (key, label, options) => ({ key, label, type: 'seg', options });

const FRONTS = S('fronts', 'Фронт', [['doors', 'Врати'], ['drawers', 'Чекмеджета'], ['mixed', 'Чекмедже + врати']]);
const DOORS = S('doors', 'Врати', [[1, '1'], [2, '2']]);

export const TYPES = {
  base: {
    label: 'Долен шкаф', group: 'Кухня и шкафове',
    params: [R('width', 'Ширина', 300, 1200, 1), R('height', 'Височина с крачетата', 600, 1000, 1), R('depth', 'Дълбочина', 300, 650, 1), R('legs', 'Крачета', 0, 150, 5), FRONTS, DOORS, R('drawers', 'Чекмеджета', 1, 5, 1, ''), R('shelves', 'Рафтове', 0, 4, 1, '')],
    defaults: { width: 600, height: 820, depth: 560, legs: 100, fronts: 'doors', doors: 1, drawers: 3, shelves: 1 },
  },
  wall: {
    label: 'Горен шкаф', group: 'Кухня и шкафове',
    params: [R('width', 'Ширина', 300, 1200, 1), R('height', 'Височина', 300, 1000, 1), R('depth', 'Дълбочина', 250, 400, 1), R('mount', 'Монтаж от пода (долен ръб)', 1300, 1800, 10), DOORS, R('shelves', 'Рафтове', 0, 4, 1, '')],
    defaults: { width: 600, height: 720, depth: 320, mount: 1450, doors: 1, shelves: 2 },
  },
  tall: {
    label: 'Колона', group: 'Кухня и шкафове',
    params: [R('width', 'Ширина', 300, 1200, 1), R('height', 'Височина с крачетата', 1200, 2500, 1), R('depth', 'Дълбочина', 300, 650, 1), R('legs', 'Крачета', 0, 150, 5), DOORS, R('drawers', 'Чекмеджета отдолу', 0, 4, 1, ''), R('shelves', 'Рафтове', 0, 8, 1, '')],
    defaults: { width: 600, height: 2100, depth: 580, legs: 100, doors: 1, drawers: 0, shelves: 4 },
  },
  kitchen: {
    label: 'Кухня (ред)', group: 'Кухня и шкафове',
    params: [R('modules', 'Модули', 2, 6, 1, ''), R('moduleWidth', 'Ширина на модул', 400, 900, 10), R('height', 'Долни шкафове с крачетата', 820, 900, 1), R('depth', 'Дълбочина долни', 500, 600, 1), R('wallHeight', 'Горни шкафове', 500, 900, 10), R('mount', 'Горни от пода', 1350, 1700, 10)],
    defaults: { modules: 4, moduleWidth: 600, height: 860, depth: 560, wallHeight: 720, mount: 1450 },
  },
  wardrobe: {
    label: 'Гардероб', group: 'Спалня',
    params: [R('width', 'Ширина', 800, 3000, 10), R('height', 'Височина с крачетата', 1800, 2600, 10), R('depth', 'Дълбочина', 450, 650, 10), R('legs', 'Цокъл', 0, 150, 5), R('columns', 'Колони', 2, 5, 1, ''), S('layout', 'Разпределение', [['mixed', 'Смесено'], ['hanging', 'Закачалки'], ['shelves', 'Рафтове']]), S('doorsPerColumn', 'Врати на колона', [[0, 'Авто'], [1, '1'], [2, '2']])],
    defaults: { width: 2000, height: 2400, depth: 600, legs: 100, columns: 3, layout: 'mixed', doorsPerColumn: 0 },
  },
  chest: {
    label: 'Скрин', group: 'Спалня',
    params: [R('width', 'Ширина', 400, 1600, 10), R('height', 'Височина с крачетата', 500, 1300, 10), R('depth', 'Дълбочина', 350, 600, 10), R('legs', 'Крачета', 0, 150, 5), R('columns', 'Колони', 1, 2, 1, ''), R('drawers', 'Чекмеджета в колона', 2, 8, 1, '')],
    defaults: { width: 800, height: 850, depth: 450, legs: 60, columns: 1, drawers: 4 },
  },
  nightstand: {
    label: 'Нощно шкафче', group: 'Спалня',
    params: [R('width', 'Ширина', 350, 650, 5), R('height', 'Височина с крачетата', 400, 750, 5), R('depth', 'Дълбочина', 300, 500, 5), R('legs', 'Крачета', 0, 150, 5), R('drawers', 'Чекмеджета', 1, 3, 1, '')],
    defaults: { width: 450, height: 550, depth: 400, legs: 60, drawers: 2 },
  },
  bed: {
    label: 'Легло', group: 'Спалня',
    params: [
      S('mattressW', 'Матрак, ширина', [[900, '90'], [1200, '120'], [1400, '140'], [1600, '160'], [1800, '180'], [2000, '200']]),
      S('mattressL', 'Матрак, дължина', [[1900, '190'], [2000, '200']]),
      R('headHeight', 'Табла глава', 700, 1300, 10), R('footHeight', 'Табла крака (0 = само царга)', 0, 700, 10), R('railHeight', 'Височина на царгата', 200, 350, 5), R('railBottom', 'Царга от пода', 100, 300, 5),
    ],
    defaults: { mattressW: 1600, mattressL: 2000, headHeight: 1000, footHeight: 450, railHeight: 250, railBottom: 150 },
  },
  bookcase: {
    label: 'Етажерка', group: 'Хол и кабинет',
    params: [R('width', 'Ширина', 400, 2400, 10), R('height', 'Височина с крачетата', 800, 2400, 10), R('depth', 'Дълбочина', 250, 450, 5), R('legs', 'Крачета', 0, 150, 5), R('columns', 'Колони', 1, 4, 1, ''), R('shelves', 'Рафтове в отворената част', 1, 8, 1, ''), S('doorZone', 'Долен корпус с врати', [[0, 'Без'], [400, '400'], [600, '600'], [800, '800']])],
    defaults: { width: 900, height: 1900, depth: 300, legs: 60, columns: 2, shelves: 3, doorZone: 800 },
  },
  tv: {
    label: 'ТВ шкаф', group: 'Хол и кабинет',
    params: [R('width', 'Ширина', 1000, 2600, 10), R('height', 'Височина с крачетата', 350, 700, 5), R('depth', 'Дълбочина', 350, 500, 5), R('legs', 'Крачета', 0, 150, 5), R('columns', 'Колони', 2, 4, 1, ''), S('tvFronts', 'Фронт на крайните колони', [['drawers', 'Чекмеджета'], ['doors', 'Врати']])],
    defaults: { width: 1800, height: 480, depth: 420, legs: 100, columns: 3, tvFronts: 'drawers' },
  },
  desk: {
    label: 'Бюро', group: 'Хол и кабинет',
    params: [R('width', 'Ширина', 900, 1800, 10), R('depth', 'Дълбочина', 500, 800, 10), R('height', 'Височина', 720, 780, 5), S('pedestal', 'Шкафче', [['right', 'Вдясно'], ['left', 'Вляво'], ['none', 'Без']]), R('drawers', 'Чекмеджета', 2, 4, 1, '')],
    defaults: { width: 1400, depth: 650, height: 750, pedestal: 'right', drawers: 3 },
  },
  wallunit: {
    label: 'Холна секция', group: 'Хол и кабинет',
    params: [R('width', 'Обща ширина', 2200, 3600, 10), R('height', 'Височина на колоните', 1800, 2400, 10), R('depth', 'Дълбочина на колоните', 350, 450, 5), R('sideWidth', 'Ширина на колона', 400, 700, 10), R('tvHeight', 'ТВ шкаф, височина', 400, 600, 5)],
    defaults: { width: 2800, height: 2000, depth: 400, sideWidth: 500, tvHeight: 480 },
  },
};

export const TYPE_ORDER = ['base', 'wall', 'tall', 'kitchen', 'wardrobe', 'chest', 'nightstand', 'bed', 'bookcase', 'tv', 'desk', 'wallunit'];

export function normalizeParams(type, input) {
  const t = TYPES[type] ?? TYPES.base;
  const s = { ...t.defaults };
  for (const p of t.params) {
    const v = input[p.key];
    if (v === undefined || v === null || v === '') continue;
    if (p.type === 'range') {
      // on the parameter's own step from its minimum: a plinth of 3 mm or a width of 601,5 cannot come in
      const x = clamp(Number(v) || p.min, p.min, p.max);
      s[p.key] = clamp(Math.round(Math.round((x - p.min) / p.step) * p.step * 1000) / 1000 + p.min, p.min, p.max);
    }
    else if (p.type === 'seg') {
      const opt = p.options.find(([ov]) => String(ov) === String(v));
      if (opt) s[p.key] = opt[0];
    }
  }
  return s;
}

const common = (s) => ({
  carcassDecor: s.carcassDecor, frontDecor: s.frontDecor, frontMaterial: s.frontMaterial, frontRal: s.frontRal,
  bands: { carcass: s.bandCarcass, front: s.bandFront }, gap: s.gap, hinge: s.hinge, handle: s.handle, slide: s.slide, kind: s.type,
});

function baseCabinet(ctx, s, at = {}) {
  const fronts = s.fronts;
  const col = { shelves: fronts === 'drawers' ? 0 : s.shelves, doors: fronts === 'drawers' ? 0 : s.doors };
  if (fronts === 'drawers') Object.assign(col, { drawers: s.drawers, drawerZone: s.height - s.legs });
  if (fronts === 'mixed') Object.assign(col, { drawers: 1, drawerZone: 180 });
  return buildCarcass(ctx, { ...common(s), ...at, W: s.width, H: s.height, D: s.depth, plinth: { type: s.legs ? 'legs' : 'none', h: s.legs }, top: 'rails', back: 'groove', columns: [col] });
}

function wallCabinet(ctx, s, at = {}) {
  return buildCarcass(ctx, { ...common(s), kind: 'wall', ...at, W: s.width, H: s.height, D: s.depth, y0: at.y0 ?? s.mount, plinth: { type: 'none', h: 0 }, top: 'between', back: 'groove', mount: 'wall', columns: [{ shelves: s.shelves, doors: s.doors }] });
}

export const BUILDERS = {
  base: (ctx, s) => baseCabinet(ctx, s),
  wall: (ctx, s) => wallCabinet(ctx, s),
  tall: (ctx, s) => buildCarcass(ctx, { ...common(s), W: s.width, H: s.height, D: s.depth, plinth: { type: s.legs ? 'legs' : 'none', h: s.legs }, top: 'between', back: 'groove', visibleTop: true, columns: [{ shelves: s.shelves, doors: s.doors, drawers: s.drawers, drawerZone: s.drawers ? s.drawers * 180 : 0 }] }),
  kitchen: (ctx, s) => {
    const n = s.modules;
    for (let i = 0; i < n; i++) {
      const fronts = i % 3 === 1 ? 'drawers' : 'doors';
      const doors = s.moduleWidth > 500 ? 2 : 1;
      baseCabinet(ctx, { ...s, width: s.moduleWidth, legs: 100, fronts, doors, drawers: 3, shelves: 1 }, { module: `М${i + 1}`, x0: i * s.moduleWidth });
      wallCabinet(ctx, { ...s, width: s.moduleWidth, height: s.wallHeight, depth: 320, doors, shelves: 2 }, { module: `Г${i + 1}`, x0: i * s.moduleWidth, y0: s.mount });
    }
    const wd = worktopDepth(s);
    ctx.hw('worktop', { name: `Работен плот 38 mm, ${n * s.moduleWidth} × ${wd} mm (поръчка)`, qty: 1, unit: 'бр.', group: 'Покупни' });
    ctx.symbols.push({ type: 'worktop', x0: 0, x1: n * s.moduleWidth, y: s.height, z0: 0, z1: wd, t: 38 });
  },
  wardrobe: (ctx, s) => {
    // wide wardrobes become several carcasses side by side (transportable, tops and bottoms fit the sheet); the columns
    // are shared out exactly as asked and every carcass is as wide as its columns
    const m = Math.min(s.columns, Math.ceil(s.width / MAX_CARCASS_W));
    const counts = Array.from({ length: m }, (_, k) => Math.floor(s.columns / m) + (k < s.columns % m ? 1 : 0));
    if (m > 1) ctx.warn('info', `Гардеробът е разделен на ${m} корпуса (${counts.join(' + ')} колони) — по-лесен транспорт, детайлите се побират в листа.`);
    let x0 = 0;
    let ci = 0;
    counts.forEach((n, k) => {
      const W = k === m - 1 ? s.width - x0 : Math.round((s.width * n) / s.columns);
      const doors = s.doorsPerColumn || (columnWidth(W, n) + 24 > 600 ? 2 : 1);
      const cols = Array.from({ length: n }, () => wardrobeColumn(s.layout, ci++, doors));
      buildCarcass(ctx, { ...common(s), module: m > 1 ? `К${k + 1}` : '', x0, W, H: s.height, D: s.depth, plinth: { type: s.legs ? 'panel' : 'none', h: s.legs }, top: 'between', back: 'groove', visibleTop: true, columns: cols });
      x0 += W;
    });
  },
  chest: (ctx, s) => buildCarcass(ctx, { ...common(s), W: s.width, H: s.height, D: s.depth, plinth: { type: s.legs ? 'legs' : 'none', h: s.legs }, top: 'over', back: 'groove', columns: Array.from({ length: s.columns }, () => ({ drawers: s.drawers, drawerZone: s.height - s.legs - 18 })) }),
  nightstand: (ctx, s) => buildCarcass(ctx, { ...common(s), W: s.width, H: s.height, D: s.depth, plinth: { type: s.legs ? 'legs' : 'none', h: s.legs }, top: 'over', back: 'groove', columns: [{ drawers: s.drawers, drawerZone: s.height - s.legs - 18 }] }),
  bed: (ctx, s) => buildBed(ctx, s),
  bookcase: (ctx, s) => {
    const plinth = { type: s.legs ? 'legs' : 'none', h: s.legs };
    const open = (n) => Array.from({ length: s.columns }, () => ({ shelves: n }));
    const zone = s.doorZone > 0 && s.height - s.legs - s.doorZone >= 350 ? s.doorZone : 0;
    if (s.doorZone > 0 && !zone) ctx.warn('info', 'Етажерката е твърде ниска за долен корпус с врати — направена е изцяло отворена.');
    if (!zone) return buildCarcass(ctx, { ...common(s), W: s.width, H: s.height, D: s.depth, plinth, top: 'between', back: 'groove', visibleTop: true, columns: open(s.shelves) });
    // two stacked carcasses: lower one with doors, open upper one screwed onto it (no confirmat clash at partitions)
    const doors = columnWidth(s.width, s.columns) + 24 > 600 ? 2 : 1;
    const lowH = s.legs + zone;
    const lower = buildCarcass(ctx, { ...common(s), module: 'Д', W: s.width, H: lowH, D: s.depth, plinth, top: 'between', back: 'groove', columns: Array.from({ length: s.columns }, (_, i) => ({ shelves: 1, doors, hingeSide: i % 2 === 0 ? 'left' : 'right' })) });
    const upper = buildCarcass(ctx, { ...common(s), module: 'Г', y0: lowH, W: s.width, H: s.height - lowH, D: s.depth, plinth: { type: 'none', h: 0 }, top: 'between', back: 'groove', visibleTop: true, columns: open(s.shelves) });
    joinStacked(ctx, lower, upper);
  },
  tv: (ctx, s) => buildCarcass(ctx, { ...common(s), W: s.width, H: s.height, D: s.depth, plinth: { type: s.legs ? 'legs' : 'none', h: s.legs }, top: 'over', back: 'groove', columns: Array.from({ length: s.columns }, (_, i) => {
    const outer = i === 0 || i === s.columns - 1;
    if (!outer) return { shelves: 1, doors: 0 };
    return s.tvFronts === 'drawers' ? { drawers: 2, drawerZone: s.height - s.legs - 18 } : { shelves: 1, doors: 1, hingeSide: i === 0 ? 'left' : 'right' };
  }) }),
  desk: (ctx, s) => buildDesk(ctx, s, common(s)),
  wallunit: (ctx, s) => {
    const sw = s.sideWidth;
    const mid = s.width - 2 * sw;
    const tall = { ...s, width: sw, height: s.height, depth: s.depth, legs: 100, doors: 1, drawers: 0, shelves: 5 };
    buildCarcass(ctx, { ...common(s), module: 'Л', x0: 0, W: sw, H: s.height, D: s.depth, plinth: { type: 'legs', h: 100 }, top: 'between', back: 'groove', visibleTop: true, columns: [{ shelves: tall.shelves, doors: 1, hingeSide: 'left' }] });
    buildCarcass(ctx, { ...common(s), module: 'Д', x0: s.width - sw, W: sw, H: s.height, D: s.depth, plinth: { type: 'legs', h: 100 }, top: 'between', back: 'groove', visibleTop: true, columns: [{ shelves: tall.shelves, doors: 1, hingeSide: 'right' }] });
    const tvCols = mid > 1600 ? 3 : 2;
    buildCarcass(ctx, { ...common(s), module: 'ТВ', x0: sw, W: mid, H: s.tvHeight, D: s.depth + 20, plinth: { type: 'legs', h: 100 }, top: 'over', back: 'groove', columns: Array.from({ length: tvCols }, (_, i) => (i === 1 && tvCols === 3 ? { shelves: 1 } : { drawers: 2, drawerZone: s.tvHeight - 100 - 18 })) });
    const shelfH = 350;
    buildCarcass(ctx, { ...common(s), module: 'Р', x0: sw, y0: s.height - shelfH - 150, W: mid, H: shelfH, D: 300, plinth: { type: 'none', h: 0 }, top: 'between', back: 'groove', mount: 'wall', visibleTop: true, columns: Array.from({ length: Math.max(2, Math.round(mid / 600)) }, () => ({ shelves: 0 })) });
  },
};

const MAX_CARCASS_W = 2400; // wider wardrobes are split into several carcasses

// Column of a wardrobe: hanging, shelves, or hanging above three drawers (drawer fronts outside, doors above them).
function wardrobeColumn(layout, i, doors) {
  if (layout === 'hanging') return { rail: true, doors };
  if (layout === 'shelves') return { shelves: 5, doors };
  return [{ rail: true, doors }, { shelves: 5, doors }, { rail: true, drawers: 3, drawerZone: 3 * 190, doors }][i % 3];
}

// Inner width of one column of an n-column carcass of outer width W (18 mm sides and partitions).
function columnWidth(W, n, T = STOCK.pb18.thickness) {
  return (W - 2 * T - (n - 1) * T) / n;
}

// Upper carcass standing on a lower one: 4 screws from inside the upper carcass through its bottom (Ø5 clearance)
// into the top of the lower one. 4 × 30 through 18 mm leaves 12 mm in the 18 mm top: the tip stays inside it. The
// pilot in the lower top is drilled on site through the clearance hole, after stacking (from below the CNC would
// have to turn the part), so the drawing marks the place.
function joinStacked(ctx, lower, upper) {
  if (!lower.panels.top) throw new Error('joinStacked: the lower carcass needs a top panel');
  const { x0, W, T, backFront, z0, D } = upper.dims;
  const y = upper.dims.c;
  const pts = [];
  for (const x of [x0 + T + 50, x0 + W - T - 50]) for (const z of [backFront + 50, z0 + D - 50]) pts.push([x, y + T, z]);
  for (const p of pts) {
    holeThrough(upper.panels.bottom, p, 5, 'screw', { hw: 'stack', label: 'винт 4×30 към долния корпус' });
    mark(lower.panels.top, [p[0], y, p[2]], 'stack-pilot', { hw: 'stack', label: 'пилот Ø3 на място' });
  }
  ctx.hw('stackScrews', { name: 'Винт за ПДЧ 4×30 (горен към долен корпус)', qty: pts.length, unit: 'бр.', group: 'Крепежи' });
}

// The kitchen worktop reaches 20–29 mm past the closed fronts (carcass, 1 mm gap, front), in whole centimetres.
const WORKTOP_OVERHANG = 20;
function worktopDepth(s) {
  return Math.ceil((s.depth + 1 + STOCK[frontStock(s).stock].thickness + WORKTOP_OVERHANG) / 10) * 10;
}

export function typeDims(type, s) {
  switch (type) {
    case 'bed':
      return { W: s.mattressW + 10 + 36, H: s.headHeight, D: s.mattressL + 10 + 36 };
    case 'kitchen':
      return { W: s.modules * s.moduleWidth, H: s.mount + s.wallHeight, D: worktopDepth(s) };
    case 'wall':
      return { W: s.width, H: s.mount + s.height, D: s.depth };
    default:
      return { W: s.width, H: s.height, D: s.depth };
  }
}

export const dimsText = (type, s) => {
  const d = typeDims(type, s);
  if (type === 'bed') return `${s.mattressW / 10}×${s.mattressL / 10} см матрак · ${d.W} × ${d.D} mm`;
  return `${r1(d.W)} × ${r1(type === 'wall' ? s.height : d.H)} × ${r1(d.D)} mm`;
};
