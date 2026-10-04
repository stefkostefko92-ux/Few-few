// Carcass furniture: sides, bottom, top (between / over / rails), partitions, a back per column, plinth or legs,
// then the column interiors in two passes — fronts first (slide pilots, hinge plates), then the 32 mm system holes
// that avoid them and the shelves that sit on those holes.
import { panel, groove, holeThrough } from './panel.js';
import { r1, clamp } from './util.js';
import { hasGrain, frontStock, STOCK } from './materials.js';
import { GROOVE, HDF_T, SYSTEM, confirmat, confirmatZs, addHoleOnce, hasHole, clashes, systemRows } from './joinery.js';
import { buildDoors } from './fronts.js';
import { buildDrawers } from './drawers.js';

const WORKTOP_SCREW = { d: 5, label: 'винт за плота 4×30', bom: 'Винт за ПДЧ 4×30 (плот през траверсите)' };
const RAIL_W = 100; // top rails of base cabinets
const HINGE_CLEAR = 45; // shelves keep this distance (centre to centre) from hinges and their plates
const RAIL_DROP = 90; // no shelves in the top 90 mm of a column with a hanging rail
const MIN_PLINTH = 40; // lowest plinth board or legs the generator makes
const PIN_RISE = 4; // a shelf rests on its pins, this far above the axis of the pin holes
const CARCASS = STOCK.pb18; // every carcass board; the back is HDF in grooves

export function buildCarcass(ctx, o) {
  const T = CARCASS.thickness;
  const x0 = o.x0 ?? 0;
  const y0 = o.y0 ?? 0;
  const z0 = o.z0 ?? 0;
  const { W, H, D } = o;
  const mod = o.module ?? '';
  const nm = (s) => (mod ? `${mod} ${s}` : s);
  const key = (s) => `${mod}${s}`;
  let plinth = o.plinth ?? { type: 'none', h: 0 };
  if ((plinth.type === 'panel' || plinth.type === 'legs') && plinth.h > 0 && plinth.h < MIN_PLINTH) {
    const what = plinth.type === 'panel' ? `${nm('Цокъл')} под ${MIN_PLINTH} mm не се прави` : `${nm('Крачета')} под ${MIN_PLINTH} mm не се слагат`;
    ctx.warn('info', `${what} — корпусът стъпва направо на пода.`);
    plinth = { type: 'none', h: 0 };
  }
  const plinthH = plinth.type !== 'none' ? plinth.h : 0;
  const c = y0 + plinthH;
  const Hc = H - plinthH;
  const top = o.top ?? 'between';
  const sideTop = top === 'over' ? c + Hc - T : c + Hc;
  const bc = o.bands?.carcass ?? 1;
  const backFront = z0 + GROOVE.inset + HDF_T;
  const zEnd = z0 + D;
  const carc = { stock: CARCASS.id, decor: o.carcassDecor, grain: hasGrain(o.carcassDecor), module: mod };
  const out = { panels: {}, columns: [], dims: { x0, y0, z0, W, H, D, T, c, Hc, plinthH, backFront } };
  const sideBands = { '+z': bc, ...(top === 'over' ? {} : { '+y': o.visibleTop ? bc : 0 }) };

  const sideL = panel(ctx, { ...carc, key: key('sideL'), name: nm('Страница лява'), role: 'side', box: { min: [x0, c, z0], max: [x0 + T, sideTop, zEnd] }, n: '+x', L: 'y', bands: sideBands, explode: [-1, 0, 0] });
  const sideR = panel(ctx, { ...carc, key: key('sideR'), name: nm('Страница дясна'), role: 'side', box: { min: [x0 + W - T, c, z0], max: [x0 + W, sideTop, zEnd] }, n: '-x', L: 'y', bands: sideBands, explode: [1, 0, 0] });
  const bottom = panel(ctx, { ...carc, key: key('bottom'), name: nm('Дъно'), role: 'bottom', box: { min: [x0 + T, c, z0], max: [x0 + W - T, c + T, zEnd] }, n: '+y', L: 'x', bands: { '+z': bc }, explode: [0, -0.6, 0] });
  out.panels = { sideL, sideR, bottom };
  const horizontals = [{ part: bottom, y: c + T / 2, zs: confirmatZs(z0 + 50, zEnd - 50) }];

  let topPart = null;
  const rails = [];
  if (top === 'between' || top === 'over') {
    const over = top === 'over';
    topPart = panel(ctx, {
      ...carc, key: key('top'), name: nm(over ? 'Плот' : 'Таван'), role: 'top',
      box: { min: [over ? x0 : x0 + T, c + Hc - T, z0], max: [over ? x0 + W : x0 + W - T, c + Hc, zEnd] },
      n: '-y', L: 'x', bands: over ? { '+z': bc, '-x': bc, '+x': bc } : { '+z': bc }, explode: [0, 1, 0],
    });
    if (!over) horizontals.push({ part: topPart, y: c + Hc - T / 2, zs: confirmatZs(z0 + 50, zEnd - 50) });
    out.panels.top = topPart;
  } else if (top === 'rails') {
    const rf = panel(ctx, { ...carc, key: key('railF'), name: nm('Траверса предна'), role: 'rail', box: { min: [x0 + T, c + Hc - T, zEnd - RAIL_W], max: [x0 + W - T, c + Hc, zEnd] }, n: '-y', L: 'x', explode: [0, 1, 0.4] });
    const rb = panel(ctx, { ...carc, key: key('railB'), name: nm('Траверса задна'), role: 'rail', box: { min: [x0 + T, c + Hc - T, backFront], max: [x0 + W - T, c + Hc, backFront + RAIL_W] }, n: '-y', L: 'x', explode: [0, 1, -0.4] });
    rails.push(rf, rb);
    horizontals.push({ part: rf, y: c + Hc - T / 2, zs: [zEnd - RAIL_W + 25, zEnd - 25] });
    horizontals.push({ part: rb, y: c + Hc - T / 2, zs: [backFront + 25, backFront + RAIL_W - 25] });
    // the worktop (or desk top) is screwed from below through the rails
    out.topScrews = [];
    for (const r of rails) {
      const zc = (r.box.min[2] + r.box.max[2]) / 2;
      for (const sx of [x0 + T + 60, x0 + W - T - 60]) {
        holeThrough(r, [sx, c + Hc - T, zc], WORKTOP_SCREW.d, 'screw', { hw: 'worktop', label: WORKTOP_SCREW.label });
        out.topScrews.push([sx, c + Hc, zc]);
      }
    }
    ctx.hw('worktopScrews', { name: WORKTOP_SCREW.bom, qty: out.topScrews.length, unit: 'бр.', group: 'Крепежи' });
    Object.assign(out.panels, { railF: rf, railB: rb });
  }
  for (const h of horizontals) {
    confirmat(ctx, sideL, h.part, '-x', h.zs.map((z) => [x0 + T, h.y, z]));
    confirmat(ctx, sideR, h.part, '+x', h.zs.map((z) => [x0 + W - T, h.y, z]));
  }
  if (top === 'over') {
    // the top sits on the sides: confirmat through the top into the side ends
    const zs = confirmatZs(z0 + 50, zEnd - 50);
    confirmat(ctx, topPart, sideL, '+y', zs.map((z) => [x0 + T / 2, c + Hc - T, z]));
    confirmat(ctx, topPart, sideR, '+y', zs.map((z) => [x0 + W - T / 2, c + Hc - T, z]));
  }

  // columns and partitions
  const cols = o.columns?.length ? o.columns : [{}];
  const n = cols.length;
  const inner0 = x0 + T;
  const inner1 = x0 + W - T;
  const avail = inner1 - inner0 - (n - 1) * T;
  const wsum = cols.reduce((a, cw) => a + (cw.weight ?? 1), 0);
  const yInnerTop = c + Hc - T;
  const yInnerBottom = c + T;
  const partitions = [];
  let x = inner0;
  cols.forEach((cw, i) => {
    const xb = i === n - 1 ? inner1 : r1(x + (avail * (cw.weight ?? 1)) / wsum);
    out.columns.push({ ...cw, index: i, xa: x, xb, left: i === 0 ? sideL : null, right: i === n - 1 ? sideR : null });
    x = xb;
    if (i < n - 1) {
      const p = panel(ctx, { ...carc, key: key(`part${i + 1}`), name: nm(`Делител ${i + 1}`), role: 'partition', box: { min: [x, yInnerBottom, backFront], max: [x + T, yInnerTop, zEnd] }, n: '+x', L: 'y', bands: { '+z': bc }, explode: [0, 0, 0.35] });
      partitions.push(p);
      out.columns[i].right = p;
      x += T;
    }
  });
  out.columns.forEach((col, i) => {
    if (!col.left) col.left = partitions[i - 1];
  });
  for (const p of partitions) {
    const pc = p.box.min[0] + T / 2;
    const zs = confirmatZs(Math.max(backFront + 30, z0 + 50), zEnd - 50);
    confirmat(ctx, bottom, p, '-y', zs.map((z) => [pc, c + T, z]));
    if (topPart) confirmat(ctx, topPart, p, '+y', zs.map((z) => [pc, c + Hc - T, z]));
    else for (const r of rails) confirmat(ctx, r, p, '+y', [[pc, c + Hc - T, (r.box.min[2] + r.box.max[2]) / 2]]);
  }

  buildBacks(ctx, { x0, W, T, c, Hc, z0, sideTop, sideL, sideR, bottom, topPart, top, partitions, n, mod, key, nm });
  buildPlinth(ctx, { ...o, plinth }, { x0, y0, W, T, zEnd, plinthH, bc, mod, key, nm });
  if (o.mount === 'wall') ctx.hw('hangers', { name: 'Окачвач за горен шкаф (чифт)', qty: 1, unit: 'чифт', group: 'Обков' });

  // interiors, pass 1: drawers and doors (slide pilots and hinge plates claim their holes first)
  const gap = o.gap ?? 3;
  const fs = frontStock(o);
  const front = { gap, fs, frontGrain: hasGrain(fs.decor), bf: fs.banded ? o.bands?.front ?? 2 : 0, fT: STOCK[fs.stock].thickness };
  const hingeSides = [];
  for (const [i, col] of out.columns.entries()) {
    col.fl = i === 0 ? x0 : partitions[i - 1].box.min[0] + T / 2;
    col.fr = i === n - 1 ? x0 + W : partitions[i].box.min[0] + T / 2;
    col.drawers = Math.max(0, col.drawers ?? 0);
    col.dzH = col.drawers ? clamp(col.drawerZone ?? col.drawers * 180, 100, Hc) : 0;
    col.doors = col.drawers && col.dzH >= Hc - 1 ? 0 : col.doors ?? 0;
    const a = { i, n, col, xa: col.xa, xb: col.xb, fl: col.fl, fr: col.fr, c, zEnd, backFront, T, nm, key, mod, left: col.left, right: col.right, ...front };
    if (col.drawers) buildDrawers(ctx, o, { ...a, dzH: col.dzH, drawers: col.drawers });
    col.hingeYs = col.doors ? buildDoors(ctx, o, { ...a, dy0: c + col.dzH + gap / 2, dy1: c + Hc - gap / 2, hingeSides }) : [];
  }
  // pass 2: system holes where they do not clash, shelves on holes present on both sides, hanging rails
  const rows = systemRows(zEnd, backFront);
  for (const [i, col] of out.columns.entries()) {
    const zoneBottom = c + col.dzH + (col.drawers ? 0 : T);
    const zoneTop = yInnerTop - (col.rail ? RAIL_DROP : 0);
    const holeYs = [];
    for (let y = c + SYSTEM.start; y <= yInnerTop - SYSTEM.start + 0.01; y += SYSTEM.pitch) if (y >= zoneBottom + 30 && y <= zoneTop) holeYs.push(r1(y));
    const shelves = Math.max(0, col.shelves ?? 0);
    if (shelves) {
      for (const y of holeYs) {
        for (const z of rows) {
          for (const [p, fx] of [[col.left, col.xa], [col.right, col.xb]]) {
            if (!clashes(p, [fx, y, z], SYSTEM.d)) addHoleOnce(p, [fx, y, z], SYSTEM.d, SYSTEM.depth, 'system', { hw: 'system' }, p.role === 'partition');
          }
        }
      }
    }
    placeShelves(ctx, { col, i, n, shelves, holeYs, rows, zoneBottom, zoneTop, T, backFront, zEnd, bc, carc, key, nm });
    if (col.rail) {
      ctx.symbols.push({ type: 'rail', x0: col.xa + 1, x1: col.xb - 1, y: yInnerTop - 60, z: (backFront + zEnd) / 2, module: mod });
      ctx.hw(`rail${Math.round(col.xb - col.xa)}`, { name: `Лост за закачалки, овален, L=${Math.round(col.xb - col.xa - 2)} mm`, qty: 1, unit: 'бр.', group: 'Обков' });
      ctx.hw('railHolders', { name: 'Държач за лост', qty: 2, unit: 'бр.', group: 'Обков' });
    }
  }
  return out;
}

function placeShelves(ctx, a) {
  const { col, i, n, shelves, holeYs, rows, zoneBottom, zoneTop, T, backFront, zEnd, bc, carc, key, nm } = a;
  // pins only go into plain system holes (a hole taken by a hinge plate screw, from either face, is not usable)
  const usable = holeYs.filter((y) => rows.every((z) => hasHole(col.left, [col.xa, y, z], SYSTEM.d, 'system') && hasHole(col.right, [col.xb, y, z], SYSTEM.d, 'system')));
  const used = [];
  for (let k = 1; k <= shelves; k++) {
    const target = zoneBottom + ((zoneTop - zoneBottom) * k) / (shelves + 1) - T / 2;
    let best = null;
    for (const y of usable) {
      if (y + PIN_RISE + T > zoneTop - 40 || y < zoneBottom + 40) continue;
      if (used.some((u) => Math.abs(u - y) < T + 60)) continue;
      if (col.hingeYs.some((hy) => Math.abs(y + PIN_RISE + T / 2 - hy) < HINGE_CLEAR)) continue;
      if (best === null || Math.abs(y + PIN_RISE - target) < Math.abs(best + PIN_RISE - target)) best = y;
    }
    if (best === null) {
      ctx.warn('warn', `${nm(`Колона ${i + 1}`)}: няма място за рафт ${k}.`);
      continue;
    }
    used.push(best);
    const y = best + PIN_RISE;
    panel(ctx, { ...carc, key: key(`c${i + 1}shelf${k}`), name: nm(n > 1 ? `Рафт ${i + 1}.${k}` : `Рафт ${k}`), role: 'shelf', box: { min: [col.xa + 1, y, backFront + 1], max: [col.xb - 1, y + T, zEnd - 20] }, n: '+y', L: 'x', bands: { '+z': bc }, explode: [0, 0, 0.9], pinY: best });
    ctx.hw('pins', { name: 'Рафтоносач Ø5', qty: 4, unit: 'бр.', group: 'Обков' });
  }
}

function buildBacks(ctx, a) {
  const { x0, W, T, c, Hc, z0, sideTop, sideL, sideR, bottom, topPart, top, partitions, n, mod, key, nm } = a;
  const into = GROOVE.depth - GROOVE.clearance;
  const gzc = z0 + GROOVE.inset + GROOVE.width / 2;
  groove(sideL, [x0 + T, c, gzc], [x0 + T, sideTop, gzc], GROOVE.width, GROOVE.depth, 'back-groove');
  groove(sideR, [x0 + W - T, c, gzc], [x0 + W - T, sideTop, gzc], GROOVE.width, GROOVE.depth, 'back-groove');
  groove(bottom, [x0 + T, c + T, gzc], [x0 + W - T, c + T, gzc], GROOVE.width, GROOVE.depth, 'back-groove');
  if (topPart) {
    const over = top === 'over';
    groove(topPart, [over ? x0 : x0 + T, c + Hc - T, gzc], [over ? x0 + W : x0 + W - T, c + Hc - T, gzc], GROOVE.width, GROOVE.depth, 'back-groove');
  }
  const yb0 = c + T - into;
  const yb1 = topPart ? c + Hc - T + into : c + Hc - 2; // under top rails the back ends just below them
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? x0 + T - into : partitions[i - 1].box.min[0] + T / 2 + 1;
    const right = i === n - 1 ? x0 + W - T + into : partitions[i].box.min[0] + T / 2 - 1;
    const zb = [z0 + GROOVE.inset, z0 + GROOVE.inset + HDF_T];
    panel(ctx, { stock: 'hdf3', decor: 'demo:white', grain: false, module: mod, key: key(`back${i + 1}`), name: nm(n > 1 ? `Гръб HDF ${i + 1}` : 'Гръб HDF'), role: 'back', box: { min: [left, yb0, zb[0]], max: [right, yb1, zb[1]] }, n: '+z', L: 'y', explode: [0, 0, -1.2] });
    // backs of several columns meet behind a partition and are nailed to it every 150 mm; other edges sit in grooves
    const partitionEdges = (i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0);
    if (partitionEdges) ctx.hw('nails', { name: 'Скоби/пирони за гръб HDF', qty: Math.ceil((partitionEdges * (yb1 - yb0)) / 150), unit: 'бр.', group: 'Крепежи' });
  }
}

function buildPlinth(ctx, o, a) {
  const { x0, y0, W, T, zEnd, plinthH, bc, mod, key, nm } = a;
  if (o.plinth?.type !== 'legs' && o.plinth?.type !== 'panel') return;
  const xs = W > 900 ? [x0 + 60, x0 + W / 2, x0 + W - 60] : [x0 + 60, x0 + W - 60];
  ctx.hw(`legs${plinthH}`, { name: `Краче регулируемо ${plinthH} mm`, qty: xs.length * 2, unit: 'бр.', group: 'Обков' });
  for (const lx of xs) for (const lz of [(o.z0 ?? 0) + 60, zEnd - (o.plinth.type === 'panel' ? 90 : 70)]) ctx.symbols.push({ type: 'leg', x: lx, z: lz, y0, h: plinthH, module: mod });
  if (o.plinth.type === 'panel') {
    const fs = frontStock(o);
    // banded at the ends and along the floor (moisture); the top edge is hidden under the carcass
    panel(ctx, { stock: fs.stock, decor: fs.decor, grain: hasGrain(fs.decor), module: mod, key: key('plinth'), name: nm('Цокъл'), role: 'plinth', box: { min: [x0, y0, zEnd - 50 - T], max: [x0 + W, y0 + plinthH - 3, zEnd - 50] }, n: '-z', L: 'x', bands: fs.banded ? { '+x': bc, '-x': bc, '-y': bc } : {}, explode: [0, -1, 1] });
    ctx.hw('plinthClips', { name: 'Клипс за цокъл', qty: 4, unit: 'бр.', group: 'Обков' });
  }
}
