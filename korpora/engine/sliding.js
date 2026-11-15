// Sliding doors of a wardrobe carcass: two inset, top-hung doors on a double track screwed under the top (data:
// engine/data/sliding-systems.js, with the maker's pages). The interior stands behind them — buildCarcass takes
// `frontZone` and sets back the partitions, the system holes, the shelves and the rails — so the doors run the whole
// inner width. Made on the CNC: the Planofit straighteners on the back of each door (two Ø35 bosses and a 10 mm groove,
// twice). Marked for the fitter: the recesses of the running gear (they open through the top edge) and the bottom
// groove that runs on the guides (an edge, not a face).
import { panel, hole, mark, groove } from './panel.js';
import { r1 } from './util.js';
import { hasGrain } from './materials.js';
import { SLIDING_SYSTEMS, PLANOFIT } from './data/sliding-systems.js';

export const SLIDING = SLIDING_SYSTEMS;
export const DEFAULT_SLIDING = 'hafele_fline21_40c';
const DENSITY = 650; // kg/m³, the estimate fronts.js uses for hinged doors

// Door width and height from the clear inner width and height of the carcass: two doors overlapping in the middle,
// the height less the track and the gap under the door (B = A − 23.5 with the screw-fixed track).
export function slidingDoorSize(sys, innerW, innerH) {
  return { W: r1((innerW + sys.overlap) / 2), H: r1(innerH - sys.heightDeduction) };
}

// The doors of one carcass. d: buildCarcass dims (x0, W, T, c, Hc, zEnd); o: the carcass options (front decor, bands).
export function buildSlidingDoors(ctx, o, d) {
  const sys = SLIDING[o.sliding] ?? SLIDING[DEFAULT_SLIDING];
  const { x0, W, T, c, Hc, zEnd, nm, key, mod } = d;
  const innerW = W - 2 * T;
  const yBottom = c + T;
  const innerH = c + Hc - T - yBottom;
  const size = slidingDoorSize(sys, innerW, innerH);
  const where = nm(ctx.t('part.cabinet'));
  if (size.H > sys.maxH) {
    ctx.warn('error', ctx.t('w.slidingTall', { where, h: ctx.t.num(size.H), max: sys.maxH, sys: sys.name, less: ctx.t.num(r1(size.H - sys.maxH)) }));
  }
  if (size.W > sys.maxW || size.W < sys.minW) {
    ctx.warn('error', ctx.t('w.slidingWidth', { where, w: ctx.t.num(size.W), min: sys.minW, max: sys.maxW, sys: sys.name }));
  }
  const kg = (size.W / 1000) * (size.H / 1000) * (sys.door.T / 1000) * DENSITY;
  if (kg > sys.maxKg) ctx.warn('error', ctx.t('w.slidingHeavy', { where, kg: ctx.t.num(r1(kg)), max: sys.maxKg, sys: sys.name }));

  // no handle on the face (it would hit the other door) and no painted MDF (the system's sizes are for 16–19 mm boards)
  ctx.warn('info', ctx.t('w.slidingHandle'));
  if (o.frontMaterial === 'ral') ctx.warn('info', ctx.t('w.slidingRal'));
  const decor = o.frontDecor;
  const bf = o.bands?.front ?? 2;
  const y0 = yBottom + sys.bottomGap;
  const zFront = zEnd - sys.frontSetback; // the front face of the front door
  const zRear = zFront - sys.door.T - sys.doorGap; // the front face of the rear door
  // the left door runs on the rear track, the right one on the front track (our choice: either way works)
  const defs = [
    { k: 1, side: 'left', x: x0 + T, z: zRear - sys.door.T, track: 'rear' },
    { k: 2, side: 'right', x: x0 + W - T - size.W, z: zFront - sys.door.T, track: 'front' },
  ];
  const doors = defs.map((dd) => {
    const door = panel(ctx, {
      stock: sys.door.stock, decor, grain: hasGrain(decor), module: mod, key: key(`slide${dd.k}`),
      name: nm(ctx.t(`part.slidingDoor.${dd.side}`)), role: 'sliding-door',
      box: { min: [dd.x, y0, dd.z], max: [dd.x + size.W, y0 + size.H, dd.z + sys.door.T] }, n: '-z', L: 'y',
      bands: { '+x': bf, '-x': bf, '+y': bf, '-y': bf }, explode: [dd.side === 'left' ? -0.3 : 0.3, 0, dd.track === 'front' ? 2.2 : 1.6],
    });
    const zBack = dd.z; // the back face: Planofit and the running gear are on it
    planofit(ctx, door, { x0: dd.x, x1: dd.x + size.W, y0, y1: y0 + size.H, z: zBack });
    // the housings of the running gear: Ø35, 64 mm in from each side edge at the top — by the maker's instruction
    for (const gx of [dd.x + sys.gear.fromSide, dd.x + size.W - sys.gear.fromSide]) {
      mark(door, [gx, y0 + size.H - sys.gear.fromTop, zBack], 'sliding-gear', { hw: 'sliding', d: sys.gear.d, label: ctx.t('lbl.slidingGear', { d: sys.gear.d, depth: sys.gear.depth }) });
    }
    // opened in the 3D, the door on the rear track runs behind the other one; the front one stays
    ctx.groups.push({ type: 'sliding-door', id: door.id, partIds: [door.id], track: dd.track, travel: dd.track === 'rear' ? size.W - sys.overlap : 0 });
    return door;
  });
  ctx.symbols.push({ type: 'slidingTrack', x0: x0 + T, x1: x0 + W - T, y: c + Hc - T, z0: zEnd - sys.track.setback - sys.track.w, z1: zEnd - sys.track.setback, module: mod });

  // hardware: one fitting set per carcass (two doors), the double track cut to the inner width, its screws, Planofit
  const track = sys.tracks.find((t) => t.length >= innerW) ?? sys.tracks.at(-1);
  ctx.hw(`slidingSet:${sys.id}`, { name: ctx.t('hw.slidingSet', { sys: sys.name }), brand: sys.brand, sku: sys.set.sku, qty: 1, unit: ctx.t('u.set'), group: ctx.t('g.hardware') });
  // the cut length is in the name: carcasses of other widths get lines of their own
  ctx.hw(`slidingTrack:${track.sku}:${r1(innerW)}`, { name: ctx.t('hw.slidingTrack', { L: ctx.t.num(track.length / 1000), cut: ctx.t.num(r1(innerW)) }), brand: sys.brand, sku: track.sku, qty: 1, unit: ctx.t('u.pcs'), group: ctx.t('g.hardware') });
  ctx.hw('slidingTrackScrews', { name: ctx.t('hw.slidingTrackScrews', { d: ctx.t.num(sys.trackScrew.d) }), qty: Math.ceil(innerW / sys.trackScrew.every) + 1, unit: ctx.t('u.pcs'), group: ctx.t('g.fasteners') });
  ctx.hw('planofit', { name: ctx.t('hw.planofit'), brand: 'Häfele', sku: PLANOFIT.sku, qty: PLANOFIT.perDoor * doors.length, unit: ctx.t('u.set'), group: ctx.t('g.hardware') });
  topSag(ctx, sys, { x0, W, T, zEnd, mod, where, kg: 2 * kg, innerW });
  return doors;
}

// The doors hang on the top: between two supports (the sides, the partitions) it must not sag more than the running
// gear makes up for. Short-term deflection of a simply supported board (E = 1600 N/mm², the EN 312 P2 minimum, as for
// the shelves in model.js) under the doors' whole weight spread over the inner width — our choice, on the safe side;
// the limit is the ±2 mm height adjustment of the running gear (p. 1.20). The cure is a partition: add a column.
const E_P2 = 1600;
const SAG_LIMIT = 2;
function topSag(ctx, sys, { x0, W, T, zEnd, mod, where, kg, innerW }) {
  const supports = ctx.parts
    .filter((p) => (p.module ?? '') === mod && ['side', 'partition'].includes(p.role) && p.box.min[0] >= x0 - 0.01 && p.box.max[0] <= x0 + W + 0.01)
    .map((p) => [p.box.min[0], p.box.max[0]])
    .sort((a, b) => a[0] - b[0]);
  let span = 0;
  for (let k = 1; k < supports.length; k++) span = Math.max(span, supports[k][0] - supports[k - 1][1]);
  const D = zEnd - Math.min(...ctx.parts.filter((p) => p.role === 'top' && (p.module ?? '') === mod).map((p) => p.box.min[2]));
  const w = (kg * 9.81) / innerW; // N/mm along the track
  const I = (D * T ** 3) / 12;
  const mm = (5 * w * span ** 4) / (384 * E_P2 * I);
  if (mm > SAG_LIMIT) ctx.warn('error', ctx.t('w.slidingSag', { where, mm: ctx.t.num(r1(mm)), span: ctx.t.num(r1(span)), max: SAG_LIMIT, sys: sys.name }));
}

// Two Planofit straighteners on the back of a door: at a quarter and three quarters of its width, the bosses 150 mm
// from the top and the bottom edge, the groove between them (data/sliding-systems.js, p. 1.144).
function planofit(ctx, door, { x0, x1, y0, y1, z }) {
  const yb = y0 + PLANOFIT.fromEdge;
  const yt = y1 - PLANOFIT.fromEdge;
  for (const fx of [0.25, 0.75]) {
    const x = r1(x0 + (x1 - x0) * fx);
    // the groove runs into its own two bosses by design (p. 1.144): `fitting` tells checkHoles they belong together
    const fitting = `planofit@${fx}`;
    for (const y of [yb, yt]) hole(door, [x, y, z], PLANOFIT.boss.d, PLANOFIT.boss.depth, 'planofit', { hw: 'planofit', fitting, label: ctx.t('lbl.planofit') });
    const g = groove(door, [x, yb, z], [x, yt, z], PLANOFIT.groove.w, PLANOFIT.groove.depth, 'planofit');
    g.hw = 'planofit';
    g.fitting = fitting;
  }
}

