// Desk: 25 mm top on a gable and a drawer pedestal (or two gables), modesty panel at the back.
import { buildCarcass } from './carcass.js';
import { panel, hole, holeThrough, edgeHoles } from './panel.js';
import { hasGrain, STOCK } from './materials.js';

const PILOT = { d: 3, depth: 10 };
const CONFIRMAT = { face: 7, edge: 5, edgeDepth: 50 };
const MODESTY = { h: 350, z: 60 };
const INSET = 30; // gables and pedestal set back from the top edges

export function buildDesk(ctx, s, common) {
  const T = STOCK.pb18.thickness;
  const TT = STOCK.pb25.thickness;
  const { width: W, depth: D, height: H } = s;
  const body = { stock: 'pb18', decor: s.carcassDecor, grain: hasGrain(s.carcassDecor) };
  const topDecor = s.frontMaterial === 'ral' ? s.carcassDecor : s.frontDecor;
  const bf = s.bandFront;
  const top = panel(ctx, { stock: 'pb25', decor: topDecor, grain: hasGrain(topDecor), key: 'deskTop', name: 'Плот на бюрото', role: 'top', box: { min: [0, H - TT, 0], max: [W, H, D] }, n: '-y', L: 'x', bands: { '+z': bf, '-z': bf, '-x': bf, '+x': bf }, explode: [0, 1, 0] });
  const pedW = s.pedestal === 'none' ? 0 : 450;
  const gables = [];
  const mkGable = (x, name, nDir) => {
    const g = panel(ctx, { ...body, key: `gable${gables.length + 1}`, name, role: 'side', box: { min: [x, 0, INSET], max: [x + T, H - TT, D - INSET] }, n: nDir, L: 'y', bands: { '+z': s.bandCarcass, '-z': s.bandCarcass }, explode: [x < W / 2 ? -1 : 1, 0, 0] });
    gables.push(g);
    return g;
  };
  let pedestal = null;
  if (s.pedestal === 'none') {
    mkGable(0, 'Страница лява', '+x');
    mkGable(W - T, 'Страница дясна', '-x');
  } else {
    const left = s.pedestal === 'left';
    mkGable(left ? W - T : 0, left ? 'Страница дясна' : 'Страница лява', left ? '-x' : '+x');
    pedestal = buildCarcass(ctx, { ...common, module: 'Ш', x0: left ? 0 : W - pedW, z0: INSET, W: pedW, H: H - TT, D: D - 2 * INSET, plinth: { type: 'none', h: 0 }, top: 'rails', back: 'groove', columns: [{ drawers: s.drawers, drawerZone: H - TT }] });
  }

  // desk top ↔ gables: steel corner brackets, pilots on the top underside and on the gable inner face
  let brackets = 0;
  for (const g of gables) {
    const inner = g.frame.n === '+x' ? g.box.max[0] : g.box.min[0];
    const sgn = g.frame.n === '+x' ? 1 : -1;
    for (const z of [INSET + 70, D - INSET - 70]) {
      hole(top, [inner + sgn * 20, H - TT, z], PILOT.d, PILOT.depth, 'pilot', { hw: 'bracket', label: 'ъгълче 40×40' });
      hole(g, [inner, H - TT - 20, z], PILOT.d, PILOT.depth, 'pilot', { hw: 'bracket', label: 'ъгълче 40×40' });
      brackets += 1;
    }
  }
  ctx.hw('brackets', { name: 'Ъгълче метално 40×40 с винтове', qty: brackets, unit: 'бр.', group: 'Обков' });
  // desk top ↔ pedestal: screws from below through the pedestal rails, pilots in the top
  if (pedestal) {
    for (const p of pedestal.topScrews) hole(top, p, PILOT.d, PILOT.depth, 'pilot', { hw: 'worktop', label: 'винт 4×30' });
  }

  // modesty panel between the gable and the pedestal (or the two gables), confirmat at both ends
  const left = s.pedestal === 'left';
  const mx0 = left ? pedW : T;
  const mx1 = left || s.pedestal === 'none' ? W - T : W - pedW;
  const ym0 = H - TT - MODESTY.h;
  const modesty = panel(ctx, { ...body, key: 'modesty', name: 'Гръб на бюрото', role: 'rail', box: { min: [mx0, ym0, MODESTY.z], max: [mx1, H - TT, MODESTY.z + T] }, n: '+z', L: 'x', bands: { '-y': s.bandCarcass }, explode: [0, 0, -1] });
  const ends = [
    { x: mx0, dir: '-x', through: left ? pedestal.panels.sideR : gables[0] },
    { x: mx1, dir: '+x', through: !left && pedestal ? pedestal.panels.sideL : gables[gables.length - 1] },
  ];
  for (const e of ends) {
    const pts = [ym0 + 60, H - TT - 60].map((y) => [e.x, y, MODESTY.z + T / 2]);
    for (const p of pts) holeThrough(e.through, p, CONFIRMAT.face, 'confirmat', { hw: 'confirmat' });
    edgeHoles(modesty, e.dir, pts, CONFIRMAT.edge, CONFIRMAT.edgeDepth, 'confirmat', { label: 'конфирмат 7×50, за резбата' });
    ctx.hw('confirmat', { name: 'Конфирмат 7×50', qty: pts.length, unit: 'бр.', group: 'Крепежи' });
  }
  return { dims: { W, H, D } };
}
