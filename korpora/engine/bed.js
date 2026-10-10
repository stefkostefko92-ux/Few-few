// Panel bed: headboard, footboard (or foot rail), side rails with ledgers, centre beam for wide beds.
// The slatted bases, the mattress and the bed-rail fittings are purchased items.
import { panel, hole, holeThrough, mark } from './panel.js';
import { r1, dimTxt } from './util.js';
import { hasGrain, frontStock, STOCK } from './materials.js';
import { bedFitting } from './hardware.js';
import { PILOT, confirmat } from './joinery.js';

// gap: the centre ledgers stop this far from the head and foot boards (the side ones FIT_CLEAR); screwFromEnd: the
// first and last screw from the ledger ends
const LEDGER = { t: 18, h: 60, pitch: 200, gap: 2, screwFromEnd: 40 };
const CLEAR_D = 5; // clearance hole for a 4 mm screw, drilled with the Ø5 system bit
// 4 × 30 through an 18 mm ledger leaves 12 mm in the 18 mm rail or beam: the tip stays 6 mm inside (a 4 × 40 would
// come out of the visible face of the rail)
const LEDGER_SCREW = { label: 'винт 4×30', bom: 'Винт за ПДЧ 4×30' };
const STAGGER = 15; // the two centre ledgers are screwed into the beam from both faces, ± 15 mm apart along it
const MATTRESS_CLEAR = 10; // the inside of the frame is this much longer and wider than the mattress
const MATTRESS_H = 220; // drawn mattress height (3D and drawings only)
const FIT_AT = 30; // centre of each half of a bed fitting from the face of the board it meets
// the side ledgers stop this far from the head and foot boards, so both halves of each fitting sit clear of them (our
// choice: the catalog gives no fitting size; 80 mm clears a plate up to 100 mm wide centred FIT_AT from the board)
const FIT_CLEAR = 80;

// Outer size of the bed: the mattress with its clearance between two 18 mm boards each way. Also the size shown for
// the project (typeDims).
export function bedOuter(s) {
  const T = STOCK.pb18.thickness;
  return { W: s.mattressW + MATTRESS_CLEAR + 2 * T, D: s.mattressL + MATTRESS_CLEAR + 2 * T };
}

export function buildBed(ctx, s) {
  const T = STOCK.pb18.thickness;
  const Li = s.mattressL + MATTRESS_CLEAR;
  const Wt = bedOuter(s).W;
  const yr = s.railBottom;
  const hr = s.railHeight;
  const yTopRail = yr + hr;
  const yLedger = yTopRail - 50; // top of the ledgers: slatted base sits here
  const body = { stock: 'pb18', decor: s.carcassDecor, grain: hasGrain(s.carcassDecor) };
  // the head and foot boards are fronts: decor board with edge bands, or MDF lacquered in a RAL colour
  const { stock: headStock, decor: headDecor, banded } = frontStock(s);
  const bc = s.bandCarcass;
  const bh = banded ? s.bandFront : 0;
  const zFootIn = T + Li;

  const head = panel(ctx, { stock: headStock, decor: headDecor, grain: hasGrain(headDecor), key: 'head', name: 'Табла (глава)', role: 'bed-head', box: { min: [0, 0, 0], max: [Wt, s.headHeight, T] }, n: '+z', L: 'x', bands: bh ? { '+y': bh, '-x': bh, '+x': bh } : {}, explode: [0, 0, -1] });
  let foot;
  if (s.footHeight > 0) {
    if (s.footHeight < yTopRail) ctx.warn('info', `Таблата при краката не може да е по-ниска от царгата — направена е ${dimTxt(yTopRail)} mm вместо ${dimTxt(s.footHeight)} mm.`);
    foot = panel(ctx, { stock: headStock, decor: headDecor, grain: hasGrain(headDecor), key: 'foot', name: 'Табла (крака)', role: 'bed-foot', box: { min: [0, 0, zFootIn], max: [Wt, Math.max(s.footHeight, yTopRail), zFootIn + T] }, n: '-z', L: 'x', bands: bh ? { '+y': bh, '-x': bh, '+x': bh } : {}, explode: [0, 0, 1] });
  } else {
    foot = panel(ctx, { ...body, key: 'footRail', name: 'Царга (крака)', role: 'bed-rail', box: { min: [0, yr, zFootIn], max: [Wt, yTopRail, zFootIn + T] }, n: '-z', L: 'x', bands: { '+y': bc, '+z': 0, '-x': bc, '+x': bc }, explode: [0, 0, 1] });
    ctx.hw('bedLegs', { name: `Краче за легло ${yr} mm`, qty: 2, unit: 'бр.', group: 'Обков' });
    ctx.symbols.push({ type: 'leg', x: 40, z: zFootIn + T / 2, y0: 0, h: yr }, { type: 'leg', x: Wt - 40, z: zFootIn + T / 2, y0: 0, h: yr });
  }
  const railL = panel(ctx, { ...body, key: 'railL', name: 'Царга лява', role: 'bed-rail', box: { min: [0, yr, T], max: [T, yTopRail, zFootIn] }, n: '+x', L: 'z', bands: { '+y': bc }, explode: [-1, 0, 0] });
  const railR = panel(ctx, { ...body, key: 'railR', name: 'Царга дясна', role: 'bed-rail', box: { min: [Wt - T, yr, T], max: [Wt, yTopRail, zFootIn] }, n: '-x', L: 'z', bands: { '+y': bc }, explode: [1, 0, 0] });
  // a ledger stops `clear` from the head and foot boards
  const ledger = (xa, xb, name, keyName, nDir, along, clear) =>
    panel(ctx, { stock: 'pb18', decor: s.carcassDecor, grain: false, key: keyName, name, role: 'bed-ledger', box: { min: [xa, yLedger - LEDGER.h, T + clear], max: [xb, yLedger, zFootIn - clear] }, n: nDir, L: 'z', explode: [along, -0.4, 0] });
  // screws along a ledger: the first and last screwFromEnd from its ends (narrowed by `stagger`), at most a pitch apart
  const ledgerScrewZs = (clear, stagger = 0) => {
    const len = Li - 2 * clear;
    const n = Math.max(3, Math.floor(len / LEDGER.pitch) + 1);
    const z0 = T + clear + LEDGER.screwFromEnd + stagger;
    const span = len - 2 * (LEDGER.screwFromEnd + stagger);
    return Array.from({ length: n }, (_, k) => r1(z0 + (span * k) / (n - 1)));
  };
  const lL = ledger(T, T + LEDGER.t, 'Летва лява', 'ledgerL', '-x', -0.6, FIT_CLEAR);
  const lR = ledger(Wt - T - LEDGER.t, Wt - T, 'Летва дясна', 'ledgerR', '+x', 0.6, FIT_CLEAR);
  // screw the ledgers to the rails: pilots on the rail inner face, through holes in the ledger
  for (const [rail, led, fx] of [[railL, lL, T], [railR, lR, Wt - T]]) {
    const zs = ledgerScrewZs(FIT_CLEAR);
    for (const z of zs) {
      hole(rail, [fx, yLedger - LEDGER.h / 2, z], PILOT.d, PILOT.depth, 'pilot', { hw: 'screw', label: LEDGER_SCREW.label });
      holeThrough(led, [fx === T ? T + LEDGER.t : Wt - T - LEDGER.t, yLedger - LEDGER.h / 2, z], CLEAR_D, 'screw', { hw: 'screw', label: LEDGER_SCREW.label });
    }
    ctx.hw('ledgerScrews', { name: LEDGER_SCREW.bom, qty: zs.length, unit: 'бр.', group: 'Крепежи' });
  }
  // centre beam for two slatted bases
  let beam = null;
  const twoBases = s.mattressW >= 1400;
  if (twoBases) {
    const xc = Wt / 2;
    beam = panel(ctx, { ...body, key: 'beam', name: 'Средна греда', role: 'bed-beam', box: { min: [xc - T / 2, yr, T], max: [xc + T / 2, yLedger, zFootIn] }, n: '+x', L: 'z', explode: [0, -0.5, 0] });
    const lc1 = ledger(xc - T / 2 - LEDGER.t, xc - T / 2, 'Летва средна лява', 'ledgerC1', '+x', -0.2, LEDGER.gap);
    const lc2 = ledger(xc + T / 2, xc + T / 2 + LEDGER.t, 'Летва средна дясна', 'ledgerC2', '-x', 0.2, LEDGER.gap);
    // the beam carries both centre ledgers, screwed from its two faces: through pilots serve either face without
    // turning the part, and the two rows are staggered so the screws from both sides never meet
    const zs = ledgerScrewZs(LEDGER.gap, STAGGER);
    for (const z of zs) {
      for (const [led, x, dz] of [[lc1, xc - T / 2 - LEDGER.t, -STAGGER], [lc2, xc + T / 2 + LEDGER.t, STAGGER]]) {
        holeThrough(beam, [xc + T / 2, yLedger - LEDGER.h / 2, z + dz], PILOT.d, 'pilot', { hw: 'screw', label: LEDGER_SCREW.label });
        holeThrough(led, [x, yLedger - LEDGER.h / 2, z + dz], CLEAR_D, 'screw', { hw: 'screw', label: LEDGER_SCREW.label });
      }
    }
    ctx.hw('ledgerScrews', { name: LEDGER_SCREW.bom, qty: 2 * zs.length, unit: 'бр.', group: 'Крепежи' });
    ctx.hw('beamLegs', { name: `Краче за средна греда ${yr} mm`, qty: 2, unit: 'бр.', group: 'Обков' });
    ctx.symbols.push({ type: 'leg', x: xc, z: T + Li / 3, y0: 0, h: yr }, { type: 'leg', x: xc, z: T + (2 * Li) / 3, y0: 0, h: yr });
  }
  // rails ↔ head/foot: bed fittings screwed through their own holes; the catalog gives no drilling pattern, so the
  // drawings only mark where each half goes (screws set with the fitting as the template)
  const fit = bedFitting(s.bedFitting);
  const fittings = [];
  const fitLabel = fit ? `${fit.brand ?? ''} ${fit.sku ?? ''}`.trim() || fit.name : 'връзка за легло';
  const note = 'връзка за легло — винтовете по шаблона на обкова';
  const attach = (rail, xFace, sideSign) => {
    for (const [board, zFace, zSign] of [[head, T, 1], [foot, zFootIn, -1]]) {
      const yc = yr + hr / 2;
      mark(board, [xFace + sideSign * FIT_AT, yc, zFace], 'bedfit', { ref: fit?.id, label: fitLabel, note });
      mark(rail, [xFace, yc, zFace + zSign * FIT_AT], 'bedfit', { ref: fit?.id, label: fitLabel, note });
      fittings.push({ rail: rail.key, board: board.key });
    }
  };
  attach(railL, T, 1);
  attach(railR, Wt - T, -1);
  if (beam) {
    // confirmat 7×50: Ø7 through the board, Ø5×50 into the beam end
    const yc = yr + (yLedger - yr) / 2;
    confirmat(ctx, head, beam, '-z', [[Wt / 2, yc, T]]);
    confirmat(ctx, foot, beam, '+z', [[Wt / 2, yc, zFootIn]]);
  }
  ctx.hw(`bedfit:${fit?.id ?? 'generic'}`, { name: fit?.name ?? 'Връзка за легло, комплект', qty: fittings.length, unit: fit?.priceUnit ?? 'компл.', group: 'Обков', sku: fit?.sku, brand: fit?.brand, price: fit?.price, currency: fit?.currency, url: fit?.url, shop: fit?.shop });
  const baseW = twoBases ? s.mattressW / 2 : s.mattressW;
  ctx.hw(`slats${baseW}x${s.mattressL}`, { name: `Рамка с ламели ${baseW / 10}×${s.mattressL / 10} см`, qty: twoBases ? 2 : 1, unit: 'бр.', group: 'Обков' });
  ctx.symbols.push({ type: 'slats', x0: T, x1: Wt - T, z0: T, z1: zFootIn, y: yLedger, split: twoBases ? Wt / 2 : null });
  ctx.symbols.push({ type: 'mattress', x0: T + 5, x1: Wt - T - 5, z0: T + 5, z1: zFootIn - 5, y: yLedger + 60, h: MATTRESS_H });
}
