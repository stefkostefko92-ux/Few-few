// Panel bed: headboard, footboard (or foot rail), side rails with ledgers, centre beam for wide beds.
// The slatted bases, the mattress and the bed-rail fittings are purchased items.
import { panel, hole, holeThrough, edgeHoles, mark } from './panel.js';
import { r1 } from './util.js';
import { hasGrain, STOCK } from './materials.js';
import { bedFitting } from './hardware.js';

const PILOT = { d: 3, depth: 10 };
const LEDGER = { t: 18, h: 60, pitch: 200 };
const CLEAR_D = 5; // clearance hole for a 4 mm screw, drilled with the Ø5 system bit
const CONFIRMAT = { face: 7, edge: 5, edgeDepth: 50 };

export function buildBed(ctx, s) {
  const T = STOCK.pb18.thickness;
  const Wi = s.mattressW + 10;
  const Li = s.mattressL + 10;
  const Wt = Wi + 2 * T;
  const yr = s.railBottom;
  const hr = s.railHeight;
  const yTopRail = yr + hr;
  const yLedger = yTopRail - 50; // top of the ledgers: slatted base sits here
  const body = { stock: 'pb18', decor: s.carcassDecor, grain: hasGrain(s.carcassDecor) };
  const headDecor = s.frontMaterial === 'ral' ? s.frontRal : s.frontDecor;
  const headStock = s.frontMaterial === 'ral' ? 'mdf18' : 'pb18';
  const bc = s.bandCarcass;
  const bh = headStock === 'mdf18' ? 0 : s.bandFront;
  const zFootIn = T + Li;

  const head = panel(ctx, { stock: headStock, decor: headDecor, grain: hasGrain(headDecor), key: 'head', name: 'Табла (глава)', role: 'bed-head', box: { min: [0, 0, 0], max: [Wt, s.headHeight, T] }, n: '+z', L: 'x', bands: bh ? { '+y': bh, '-x': bh, '+x': bh } : {}, explode: [0, 0, -1] });
  let foot;
  if (s.footHeight > 0) {
    foot = panel(ctx, { stock: headStock, decor: headDecor, grain: hasGrain(headDecor), key: 'foot', name: 'Табла (крака)', role: 'bed-foot', box: { min: [0, 0, zFootIn], max: [Wt, Math.max(s.footHeight, yTopRail), zFootIn + T] }, n: '-z', L: 'x', bands: bh ? { '+y': bh, '-x': bh, '+x': bh } : {}, explode: [0, 0, 1] });
  } else {
    foot = panel(ctx, { ...body, key: 'footRail', name: 'Царга (крака)', role: 'bed-rail', box: { min: [0, yr, zFootIn], max: [Wt, yTopRail, zFootIn + T] }, n: '-z', L: 'x', bands: { '+y': bc, '+z': 0, '-x': bc, '+x': bc }, explode: [0, 0, 1] });
    ctx.hw('bedLegs', { name: `Краче за легло ${yr} mm`, qty: 2, unit: 'бр.', group: 'Обков' });
    ctx.symbols.push({ type: 'leg', x: 40, z: zFootIn + T / 2, y0: 0, h: yr }, { type: 'leg', x: Wt - 40, z: zFootIn + T / 2, y0: 0, h: yr });
  }
  const railL = panel(ctx, { ...body, key: 'railL', name: 'Царга лява', role: 'bed-rail', box: { min: [0, yr, T], max: [T, yTopRail, zFootIn] }, n: '+x', L: 'z', bands: { '+y': bc }, explode: [-1, 0, 0] });
  const railR = panel(ctx, { ...body, key: 'railR', name: 'Царга дясна', role: 'bed-rail', box: { min: [Wt - T, yr, T], max: [Wt, yTopRail, zFootIn] }, n: '-x', L: 'z', bands: { '+y': bc }, explode: [1, 0, 0] });
  const ledgerParts = [];
  const ledger = (xa, xb, name, keyName, nDir, along) => {
    const p = panel(ctx, { stock: 'pb18', decor: s.carcassDecor, grain: false, key: keyName, name, role: 'bed-ledger', box: { min: [xa, yLedger - LEDGER.h, T + 2], max: [xb, yLedger, zFootIn - 2] }, n: nDir, L: 'z', explode: [along, -0.4, 0] });
    ledgerParts.push(p);
    return p;
  };
  const lL = ledger(T, T + LEDGER.t, 'Летва лява', 'ledgerL', '-x', -0.6);
  const lR = ledger(Wt - T - LEDGER.t, Wt - T, 'Летва дясна', 'ledgerR', '+x', 0.6);
  // screw the ledgers to the rails: pilots on the rail inner face, through holes in the ledger
  for (const [rail, led, fx] of [[railL, lL, T], [railR, lR, Wt - T]]) {
    const n = Math.max(3, Math.floor((Li - 4) / LEDGER.pitch) + 1);
    for (let k = 0; k < n; k++) {
      const z = r1(T + 2 + 40 + ((Li - 84) * k) / (n - 1));
      hole(rail, [fx, yLedger - LEDGER.h / 2, z], PILOT.d, PILOT.depth, 'pilot', { hw: 'screw', label: 'винт 4×40' });
      holeThrough(led, [fx === T ? T + LEDGER.t : Wt - T - LEDGER.t, yLedger - LEDGER.h / 2, z], CLEAR_D, 'screw', { hw: 'screw', label: 'винт 4×40' });
    }
    ctx.hw('ledgerScrews', { name: 'Винт за ПДЧ 4×40', qty: n, unit: 'бр.', group: 'Крепежи' });
  }
  // centre beam for two slatted bases
  let beam = null;
  const twoBases = s.mattressW >= 1400;
  if (twoBases) {
    const xc = Wt / 2;
    beam = panel(ctx, { ...body, key: 'beam', name: 'Средна греда', role: 'bed-beam', box: { min: [xc - T / 2, yr, T], max: [xc + T / 2, yLedger, zFootIn] }, n: '+x', L: 'z', explode: [0, -0.5, 0] });
    const lc1 = ledger(xc - T / 2 - LEDGER.t, xc - T / 2, 'Летва средна лява', 'ledgerC1', '+x', -0.2);
    const lc2 = ledger(xc + T / 2, xc + T / 2 + LEDGER.t, 'Летва средна дясна', 'ledgerC2', '-x', 0.2);
    // the beam carries both centre ledgers: through pilots serve the two faces without turning the part
    const n = Math.max(3, Math.floor((Li - 4) / LEDGER.pitch) + 1);
    for (let k = 0; k < n; k++) {
      const z = r1(T + 2 + 40 + ((Li - 84) * k) / (n - 1));
      holeThrough(beam, [xc + T / 2, yLedger - LEDGER.h / 2, z], PILOT.d, 'pilot', { hw: 'screw', label: 'винт 4×40' });
      holeThrough(lc1, [xc - T / 2 - LEDGER.t, yLedger - LEDGER.h / 2, z], CLEAR_D, 'screw', { hw: 'screw', label: 'винт 4×40' });
      holeThrough(lc2, [xc + T / 2 + LEDGER.t, yLedger - LEDGER.h / 2, z], CLEAR_D, 'screw', { hw: 'screw', label: 'винт 4×40' });
    }
    ctx.hw('ledgerScrews', { name: 'Винт за ПДЧ 4×40', qty: 2 * n, unit: 'бр.', group: 'Крепежи' });
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
      mark(board, [xFace + sideSign * 30, yc, zFace], 'bedfit', { ref: fit?.id, label: fitLabel, note });
      mark(rail, [xFace, yc, zFace + zSign * 30], 'bedfit', { ref: fit?.id, label: fitLabel, note });
      fittings.push({ rail: rail.key, board: board.key });
    }
  };
  attach(railL, T, 1);
  attach(railR, Wt - T, -1);
  if (beam) {
    for (const [board, zFace] of [[head, T], [foot, zFootIn]]) {
      // confirmat 7×50: Ø7 through the board, Ø5×50 into the beam end
      const p = [Wt / 2, yr + (yLedger - yr) / 2, zFace];
      edgeHoles(beam, zFace === T ? '-z' : '+z', [p], CONFIRMAT.edge, CONFIRMAT.edgeDepth, 'confirmat');
      holeThrough(board, p, CONFIRMAT.face, 'confirmat', { hw: 'confirmat' });
    }
    ctx.hw('confirmat', { name: 'Конфирмат 7×50', qty: 2, unit: 'бр.', group: 'Крепежи' });
  }
  ctx.hw(`bedfit:${fit?.id ?? 'generic'}`, { name: fit?.name ?? 'Връзка за легло, комплект', qty: fittings.length, unit: fit?.priceUnit ?? 'компл.', group: 'Обков', sku: fit?.sku, brand: fit?.brand, price: fit?.price, currency: fit?.currency, url: fit?.url, shop: fit?.shop });
  const baseW = twoBases ? s.mattressW / 2 : s.mattressW;
  ctx.hw(`slats${baseW}x${s.mattressL}`, { name: `Рамка с ламели ${baseW / 10}×${s.mattressL / 10} см`, qty: twoBases ? 2 : 1, unit: 'бр.', group: 'Обков' });
  ctx.symbols.push({ type: 'slats', x0: T, x1: Wt - T, z0: T, z1: zFootIn, y: yLedger, split: twoBases ? Wt / 2 : null });
  ctx.symbols.push({ type: 'mattress', x0: T + 5, x1: Wt - T - 5, z0: T + 5, z1: zFootIn - 5, y: yLedger + 60, h: s.mattressH ?? 220 });
  return { dims: { W: Wt, H: s.headHeight, D: Li + 2 * T, T, yr, yTopRail, yLedger } };
}
