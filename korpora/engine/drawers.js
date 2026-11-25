// Drawers on documented slide systems: overlay front, 16 mm box (sides, front, back), HDF bottom in grooves, confirmat
// corners, carcass holes where the slide manufacturer puts them. Side-mount ball-bearing slides take their clearance
// on both sides; concealed (under-mount) slides set the inner width LW − 42, the bottom recess and a rear hook hole.
import { panel, groove, edgeHoles } from './panel.js';
import { r1 } from './util.js';
import { slideModel, slideSystemOf, slideLength } from './hardware.js';
import { GROOVE, HDF_T, CONFIRMAT, FRONT_GAP_Z, MIN_WEB, confirmat, addHoleOnce, hasHole, taken } from './joinery.js';
import { mountHandle } from './fronts.js';
import { STOCK } from './materials.js';
import { sideStabiliser } from './stabiliser.js';

const TOP_GAP = 28; // box top below the front top, room for the slide and the drawer above
const MIN_BOX = 60; // lowest drawer box the generator makes
const GROOVE_WEB = 3; // board left between the bottom groove and a confirmat hole in a 16 mm side
const BOX_STOCKS = [STOCK.pb16, STOCK.pb18]; // drawer boxes: particleboard as thick as the slide system's box side

export function buildDrawers(ctx, o, a) {
  const family = slideModel(o.slide);
  const sys = slideSystemOf(family);
  const { i, n, xa, xb, fl, fr, c, dzH, drawers, gap, zEnd, backFront, T, fs, frontGrain, bf, fT, nm, key, mod } = a;
  const dz0 = a.dz0 ?? c; // bottom of the drawer zone: the carcass bottom, or the top of the doors below it
  // the board the lowest box clears: the carcass bottom, or a fixed shelf of a free carcass (cells.js)
  const floorY = a.floorY ?? dz0 + T;
  if (!family || !sys) {
    ctx.warn('error', ctx.t('w.noSlide'));
    return;
  }
  const depth = zEnd - backFront;
  const NL = slideLength(sys, depth);
  if (!NL) {
    ctx.warn('error', ctx.t('w.slideNoLength', { where: nm(ctx.t('part.column', { n: i + 1 })), sys: ctx.t.of(sys), depth: Math.round(depth) }));
    return;
  }
  const boxStock = BOX_STOCKS.find((st) => st.thickness === sys.boxSide);
  if (!boxStock) {
    ctx.warn('error', ctx.t('w.boxSide', { sys: ctx.t.of(sys), t: ctx.t.num(sys.boxSide) }));
    return;
  }
  const BOX_T = boxStock.thickness;
  // outer faces of the box sides: concealed slides set the inner width LW − innerWidthMinus, whatever the column width
  const side = sys.mount === 'under' ? (sys.innerWidthMinus - 2 * BOX_T) / 2 : sys.sideClearance;
  const xl = xa + side;
  const xr = xb - side;
  if (xr - xl - 2 * BOX_T < 100) {
    ctx.warn('error', ctx.t('w.columnNarrow', { where: nm(ctx.t('part.column', { n: i + 1 })) }));
    return;
  }
  // the slide makers' limits on the width (engine/data/slide-systems.js): a GTV H45 drawer no wider than its NL; a Blum
  // side stabilisation set for wide drawers on short slides (engine/stabiliser.js), made only up to the cabinet width KB
  // (the column's inner width and the two panels it stands between). Recommendations for the drawer to run well.
  const boxW = r1(xr - xl);
  // a narrower drawer: another column only where the furniture type has a columns parameter
  const narrower = ctx.t(o.columnsParam ? 'w.narrowerCols' : 'w.narrower');
  if (sys.maxWidth && boxW > sys.maxWidth(NL)) {
    ctx.warn('warn', ctx.t('w.drawerWide', { where: nm(ctx.t('part.column', { n: i + 1 })), w: ctx.t.num(boxW), NL, brand: sys.brand, narrower }));
  }
  const stab = sideStabiliser(ctx, sys, { where: nm(ctx.t('part.column', { n: i + 1 })), KB: r1(xb - xa + 2 * T), LW: xb - xa, NL, depth: r1(depth), handle: o.handle, narrower });
  // room under the lowest box, over the carcass bottom: a side-mount slide's lower edge is the box's, 6 mm over it (наш
  // избор); a concealed runner reaches clearBelow under the drawer bottom (Blum: „min 27.5“), more with a stabiliser
  const floor = sys.mount === 'under' ? sys.clearBelow + (stab?.below ?? 0) - sys.bottomUp : 6;
  const L = sys.drawerLength(NL);
  const fh = r1((dzH - drawers * gap) / drawers);
  if (!(fh > 0)) {
    ctx.warn('error', ctx.t('w.drawersNoFit', { where: nm(ctx.t('part.column', { n: i + 1 })), n: drawers, h: ctx.t.num(r1(dzH)) }));
    return;
  }
  // the top edges of the box sides, front and back show whenever the drawer is open: banded like the carcass
  const box = { stock: boxStock.id, decor: 'demo:white', grain: false, module: mod, bands: { '+y': o.bands?.carcass ?? 1 } };
  const product = family.products?.[NL] ?? null;
  const label = product ? `${product.brand ?? family.brand} ${product.sku ?? ''}`.trim() : `${family.brand} ${NL} mm`;
  // height of the slide's screw axis for a box starting at yb
  const slideY = (yb) => r1(sys.mount === 'under' ? yb + sys.bottomUp + sys.axisAboveBottom : yb + sys.axisAboveBox);
  // The slides on the two faces of a partition share its through holes, and the hinge plates of a door on its other
  // face are drilled through too. Where this drawer's pilots would come closer than MIN_WEB to a hole already drilled
  // for another fitting (or share it), its box starts sys.hole.d + MIN_WEB higher, as often as it takes: the box gets
  // that much lower, the front and the room above the box (TOP_GAP) stay; a box left too low is an error below.
  const meets = (ys) => [[a.left, xa], [a.right, xb]].some(([cp, fx]) => sys.holes[NL].some((zf2) => taken(cp, [fx, ys, zEnd - zf2], sys.hole.d)));
  for (let k = 0; k < drawers; k++) {
    const y0 = dz0 + gap / 2 + k * (fh + gap);
    const y1 = y0 + fh;
    const dkey = key(`c${i + 1}dr${k + 1}`);
    const front = panel(ctx, {
      stock: fs.stock, decor: fs.decor, grain: frontGrain, module: mod, key: `${dkey}front`,
      name: nm(ctx.t(`part.drawerFront${drawers > 1 ? 'N' : ''}${n > 1 ? 'Col' : ''}`, { k: k + 1, col: i + 1 })),
      role: 'drawer-front', box: { min: [fl + gap / 2, y0, zEnd + FRONT_GAP_Z], max: [fr - gap / 2, y1, zEnd + FRONT_GAP_Z + fT] }, n: '-z', L: 'x',
      bands: bf ? { '+x': bf, '-x': bf, '+y': bf, '-y': bf } : {}, explode: [0, 0, 2.2],
    });
    mountHandle(ctx, o, front, { orientation: 'horizontal', kind: o.kind });
    const yt = y1 - TOP_GAP;
    let yb = Math.max(y0 + 12, floorY + floor);
    while (meets(slideY(yb)) && yb < yt - MIN_BOX) yb += sys.hole.d + MIN_WEB;
    const hb = r1(yt - yb);
    if (hb < MIN_BOX) {
      ctx.warn('error', ctx.t('w.boxLow', { front: front.name, h: ctx.t.num(hb), min: MIN_BOX }));
      continue;
    }
    const zf = zEnd - 2;
    const zbk = zf - L;
    const nmk = (what) => nm(ctx.t(n > 1 ? 'part.drawerPartCol' : 'part.drawerPart', { k: k + 1, what: ctx.t(`part.drawer.${what}`), col: i + 1 }));
    const sideA = panel(ctx, { ...box, key: `${dkey}sl`, name: nmk('side'), role: 'drawer-side', box: { min: [xl, yb, zbk], max: [xl + BOX_T, yt, zf] }, n: '+x', L: 'z', explode: [0, 0, 1.6] });
    const sideB = panel(ctx, { ...box, key: `${dkey}sr`, name: nmk('side'), role: 'drawer-side', box: { min: [xr - BOX_T, yb, zbk], max: [xr, yt, zf] }, n: '-x', L: 'z', explode: [0, 0, 1.6] });
    const bfront = panel(ctx, { ...box, key: `${dkey}bf`, name: nmk('front'), role: 'drawer-back', box: { min: [xl + BOX_T, yb, zf - BOX_T], max: [xr - BOX_T, yt, zf] }, n: '-z', L: 'x', explode: [0, 0, 1.7] });
    const bback = panel(ctx, { ...box, key: `${dkey}bb`, name: nmk('back'), role: 'drawer-back', box: { min: [xl + BOX_T, yb, zbk], max: [xr - BOX_T, yt, zbk + BOX_T] }, n: '+z', L: 'x', explode: [0, 0, 1.5] });
    const gy = yb + sys.bottomUp + GROOVE.width / 2;
    for (const [p, a1, a2] of [
      [sideA, [xl + BOX_T, gy, zbk], [xl + BOX_T, gy, zf]],
      [sideB, [xr - BOX_T, gy, zbk], [xr - BOX_T, gy, zf]],
      [bfront, [xl + BOX_T, gy, zf - BOX_T], [xr - BOX_T, gy, zf - BOX_T]],
      [bback, [xl + BOX_T, gy, zbk + BOX_T], [xr - BOX_T, gy, zbk + BOX_T]],
    ]) groove(p, a1, a2, GROOVE.width, GROOVE.depth, 'bottom-groove');
    const into = GROOVE.depth - GROOVE.clearance;
    const bottomY = yb + sys.bottomUp;
    const bottom = panel(ctx, { stock: 'hdf3', decor: 'demo:white', grain: false, module: mod, key: `${dkey}bt`, name: nmk('bottom'), role: 'drawer-bottom', box: { min: [xl + BOX_T - into, bottomY, zbk + BOX_T - into], max: [xr - BOX_T + into, bottomY + HDF_T, zf - BOX_T + into] }, n: '+y', L: 'x', explode: [0, -0.2, 1.6] });
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
    const ys = slideY(yb);
    for (const [cp, fx] of [[a.left, xa], [a.right, xb]]) {
      const through = cp.role === 'partition';
      for (const zf2 of sys.holes[NL]) {
        const p = [fx, ys, zEnd - zf2];
        if (through && hasHole(cp, p, sys.hole.d, 'slide')) {
          ctx.warn('error', ctx.t('w.slidesMeet', { panel: cp.name }));
          continue;
        }
        addHoleOnce(cp, p, sys.hole.d, sys.hole.depth, 'slide', { hw: 'slide', ref: family.id, refName: ctx.t.of(family), label }, through);
      }
    }
    ctx.hw(`slide:${family.id}:${NL}`, {
      name: product ? product.name : ctx.t('hw.slideMissing', { family: ctx.t.of(family), NL }),
      qty: 1, unit: ctx.t('u.set'), group: ctx.t('g.hardware'), sku: product?.sku, brand: product?.brand ?? family.brand, price: product?.price, currency: product?.currency, url: product?.url, shop: product?.shop,
    });
    if (stab) ctx.hw(stab.line.key, stab.line);
    ctx.groups.push({ type: 'drawer', id: front.id, partIds: [front.id, sideA.id, sideB.id, bfront.id, bback.id, bottom.id], travel: L * (sys.extension === 'full' ? 0.95 : 0.75) });
  }
}
