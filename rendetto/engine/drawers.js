// Drawers on documented slide systems: overlay front, 16 mm box (sides, front, back), HDF bottom in grooves, confirmat
// corners, carcass holes where the slide manufacturer puts them. Side-mount ball-bearing slides take their clearance
// on both sides; concealed (under-mount) slides set the inner width LW − 42, the bottom recess and a rear hook hole.
import { panel, groove, edgeHoles } from './panel.js';
import { r1, dimTxt } from './util.js';
import { slideModel, slideSystemOf, slideLength } from './hardware.js';
import { GROOVE, HDF_T, CONFIRMAT, FRONT_GAP_Z, confirmat, addHoleOnce, hasHole } from './joinery.js';
import { mountHandle } from './fronts.js';
import { STOCK } from './materials.js';

const TOP_GAP = 28; // box top below the front top, room for the slide and the drawer above
const MIN_BOX = 60; // lowest drawer box the generator makes
const GROOVE_WEB = 3; // board left between the bottom groove and a confirmat hole in a 16 mm side
const BOX_STOCKS = [STOCK.pb16, STOCK.pb18]; // drawer boxes: particleboard as thick as the slide system's box side

export function buildDrawers(ctx, o, a) {
  const family = slideModel(o.slide);
  const sys = slideSystemOf(family);
  const { i, n, xa, xb, fl, fr, c, dzH, drawers, gap, zEnd, backFront, T, fs, frontGrain, bf, fT, nm, key, mod } = a;
  if (!family || !sys) {
    ctx.warn('error', 'Няма избран водач с данни за пробиване.');
    return;
  }
  const NL = slideLength(sys, zEnd - backFront);
  if (!NL) {
    ctx.warn('error', `${nm(`Колона ${i + 1}`)}: ${sys.name} няма дължина за вътрешна дълбочина ${Math.round(zEnd - backFront)} mm.`);
    return;
  }
  const boxStock = BOX_STOCKS.find((st) => st.thickness === sys.boxSide);
  if (!boxStock) {
    ctx.warn('error', `${sys.name}: страницата на кутията е ${dimTxt(sys.boxSide)} mm — няма ЛПДЧ с такава дебелина.`);
    return;
  }
  const BOX_T = boxStock.thickness;
  // outer faces of the box sides: concealed slides set the inner width LW − innerWidthMinus, whatever the column width
  const side = sys.mount === 'under' ? (sys.innerWidthMinus - 2 * BOX_T) / 2 : sys.sideClearance;
  const xl = xa + side;
  const xr = xb - side;
  if (xr - xl - 2 * BOX_T < 100) {
    ctx.warn('error', `${nm(`Колона ${i + 1}`)}: колоната е твърде тясна за чекмедже.`);
    return;
  }
  const L = sys.drawerLength(NL);
  const fh = r1((dzH - drawers * gap) / drawers);
  const box = { stock: boxStock.id, decor: 'demo:white', grain: false, module: mod };
  const product = family.products?.[NL] ?? null;
  const label = product ? `${product.brand ?? family.brand} ${product.sku ?? ''}`.trim() : `${family.brand} ${NL} mm`;
  for (let k = 0; k < drawers; k++) {
    const y0 = c + gap / 2 + k * (fh + gap);
    const y1 = y0 + fh;
    const dkey = key(`c${i + 1}dr${k + 1}`);
    const front = panel(ctx, {
      stock: fs.stock, decor: fs.decor, grain: frontGrain, module: mod, key: `${dkey}front`,
      name: nm(`Чекмедже ${drawers > 1 ? `${k + 1} ` : ''}фронт${n > 1 ? ` (кол. ${i + 1})` : ''}`),
      role: 'drawer-front', box: { min: [fl + gap / 2, y0, zEnd + FRONT_GAP_Z], max: [fr - gap / 2, y1, zEnd + FRONT_GAP_Z + fT] }, n: '-z', L: 'x',
      bands: bf ? { '+x': bf, '-x': bf, '+y': bf, '-y': bf } : {}, explode: [0, 0, 2.2],
    });
    mountHandle(ctx, o, front, { orientation: 'horizontal', kind: o.kind });
    const yb = Math.max(y0 + 12, c + T + 6);
    const yt = y1 - TOP_GAP;
    const hb = r1(yt - yb);
    if (hb < MIN_BOX) {
      ctx.warn('error', `${front.name}: кутията на чекмеджето би била ${dimTxt(hb)} mm (нужни са поне ${MIN_BOX}) — намалете броя на чекмеджетата или увеличете височината.`);
      continue;
    }
    const zf = zEnd - 2;
    const zbk = zf - L;
    const nmk = (t) => nm(`Чекмедже ${k + 1} ${t}${n > 1 ? ` (кол. ${i + 1})` : ''}`);
    const sideA = panel(ctx, { ...box, key: `${dkey}sl`, name: nmk('страница'), role: 'drawer-side', box: { min: [xl, yb, zbk], max: [xl + BOX_T, yt, zf] }, n: '+x', L: 'z', explode: [0, 0, 1.6] });
    const sideB = panel(ctx, { ...box, key: `${dkey}sr`, name: nmk('страница'), role: 'drawer-side', box: { min: [xr - BOX_T, yb, zbk], max: [xr, yt, zf] }, n: '-x', L: 'z', explode: [0, 0, 1.6] });
    const bfront = panel(ctx, { ...box, key: `${dkey}bf`, name: nmk('чело'), role: 'drawer-back', box: { min: [xl + BOX_T, yb, zf - BOX_T], max: [xr - BOX_T, yt, zf] }, n: '-z', L: 'x', explode: [0, 0, 1.7] });
    const bback = panel(ctx, { ...box, key: `${dkey}bb`, name: nmk('гръб'), role: 'drawer-back', box: { min: [xl + BOX_T, yb, zbk], max: [xr - BOX_T, yt, zbk + BOX_T] }, n: '+z', L: 'x', explode: [0, 0, 1.5] });
    const gy = yb + sys.bottomUp + GROOVE.width / 2;
    for (const [p, a1, a2] of [
      [sideA, [xl + BOX_T, gy, zbk], [xl + BOX_T, gy, zf]],
      [sideB, [xr - BOX_T, gy, zbk], [xr - BOX_T, gy, zf]],
      [bfront, [xl + BOX_T, gy, zf - BOX_T], [xr - BOX_T, gy, zf - BOX_T]],
      [bback, [xl + BOX_T, gy, zbk + BOX_T], [xr - BOX_T, gy, zbk + BOX_T]],
    ]) groove(p, a1, a2, GROOVE.width, GROOVE.depth, 'bottom-groove');
    const into = GROOVE.depth - GROOVE.clearance;
    const bottomY = yb + sys.bottomUp;
    const bottom = panel(ctx, { stock: 'hdf3', decor: 'demo:white', grain: false, module: mod, key: `${dkey}bt`, name: nmk('дъно HDF'), role: 'drawer-bottom', box: { min: [xl + BOX_T - into, bottomY, zbk + BOX_T - into], max: [xr - BOX_T + into, bottomY + HDF_T, zf - BOX_T + into] }, n: '+y', L: 'x', explode: [0, -0.2, 1.6] });
    // box corners: confirmat through the box sides into the front/back ends, clear of the bottom groove
    const low = Math.max(yb + 22, gy + GROOVE.width / 2 + GROOVE_WEB + CONFIRMAT.face / 2);
    const cy = [low, yt - 18].filter((y, idx, arr) => idx === 0 || y - arr[0] > 30);
    for (const [sd, end, zc, dir] of [[sideA, bfront, zf - BOX_T / 2, '-x'], [sideA, bback, zbk + BOX_T / 2, '-x'], [sideB, bfront, zf - BOX_T / 2, '+x'], [sideB, bback, zbk + BOX_T / 2, '+x']]) {
      confirmat(ctx, sd, end, dir, cy.map((y) => [sd === sideA ? xl + BOX_T : xr - BOX_T, y, zc]));
    }
    // concealed slides hook into a hole in the rear end of each box side
    if (sys.rearHook) {
      const h = sys.rearHook;
      edgeHoles(sideA, '-z', [[xl + h.fromOuter, yb + h.fromBottom, zbk]], h.d, h.depth, 'slide-hook', { label });
      edgeHoles(sideB, '-z', [[xr - h.fromOuter, yb + h.fromBottom, zbk]], h.d, h.depth, 'slide-hook', { label });
    }
    // carcass holes on the panels' inner faces; partitions get through holes so both faces work. A slide hole already
    // drilled there belongs to the slide on the other face: the screws from both faces would meet in it (fail closed)
    const ys = r1(sys.mount === 'under' ? bottomY + sys.axisAboveBottom : yb + sys.axisAboveBox);
    for (const [cp, fx] of [[a.left, xa], [a.right, xb]]) {
      const through = cp.role === 'partition';
      for (const zf2 of sys.holes[NL]) {
        const p = [fx, ys, zEnd - zf2];
        if (through && hasHole(cp, p, sys.hole.d, 'slide')) {
          ctx.warn('error', `${cp.name}: водачите на чекмеджетата от двете му страни са на една височина — винтовете им биха се срещнали в общите отвори. Сменете разпределението на колоните.`);
          continue;
        }
        addHoleOnce(cp, p, sys.hole.d, sys.hole.depth, 'slide', { hw: 'slide', ref: family.id, refName: family.name, label }, through);
      }
    }
    ctx.hw(`slide:${family.id}:${NL}`, {
      name: product ? product.name : `${family.name}, NL ${NL} mm (няма в каталога, поръчайте отделно)`,
      qty: 1, unit: 'компл.', group: 'Обков', sku: product?.sku, brand: product?.brand ?? family.brand, price: product?.price, currency: product?.currency, url: product?.url, shop: product?.shop,
    });
    ctx.groups.push({ type: 'drawer', id: front.id, partIds: [front.id, sideA.id, sideB.id, bfront.id, bback.id, bottom.id], travel: L * (sys.extension === 'full' ? 0.95 : 0.75) });
  }
}
