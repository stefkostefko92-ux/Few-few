// Hinged doors and handles. Doors are full overlay on outer sides and half overlay on partitions; hinge cups are
// drilled in the door back, mounting plates on the carcass panel on the 32 mm grid, handles through the front.
import { panel, hole, holeThrough, toUV } from './panel.js';
import { r1, clamp, dimTxt } from './util.js';
import { hingeCount, hingeProduct, hingeSystemOf, handleModel, hingeLimits, solveOverlay, HINGE_LIMITS } from './hardware.js';
import { SYSTEM, addHoleOnce, snapHingeY } from './joinery.js';

const DENSITY = 650; // kg/m³, assumption for the door-weight estimate
const HANDLE_KG = 0.3; // assumption

// One column's doors. a: column geometry and front material from buildCarcass.
export function buildDoors(ctx, o, a) {
  const { i, n, col, fl, fr, dy0, dy1, gap, zEnd, c, fs, frontGrain, bf, fT, nm, key, mod, hingeSides } = a;
  const spanW = fr - fl;
  let doors = col.doors;
  if (doors === 1 && spanW - gap > HINGE_LIMITS.maxWidth) {
    doors = 2;
    ctx.warn('info', `${nm(n > 1 ? `Колона ${i + 1}` : 'Шкаф')}: една врата би била ${Math.round(spanW - gap)} mm (над ${HINGE_LIMITS.maxWidth} mm) — направени са 2 врати.`);
  }
  const half = (spanW - 2 * gap) / 2;
  const defs = doors === 1
    ? [{ x0: fl + gap / 2, w: spanW - gap, hinge: col.hingeSide ?? (i % 2 === 0 ? 'left' : 'right') }]
    : [{ x0: fl + gap / 2, w: half, hinge: 'left' }, { x0: fl + gap / 2 + half + gap, w: half, hinge: 'right' }];
  const ys = [];
  defs.forEach((dd, k) => {
    const zD = zEnd + 1;
    const door = panel(ctx, {
      stock: fs.stock, decor: fs.decor, grain: frontGrain, module: mod, key: key(`c${i + 1}door${k + 1}`),
      name: nm(doors === 1 ? (n > 1 ? `Врата ${i + 1}` : 'Врата') : `Врата ${n > 1 ? `${i + 1}.` : ''}${dd.hinge === 'left' ? 'лява' : 'дясна'}`),
      role: 'door', box: { min: [dd.x0, dy0, zD], max: [dd.x0 + dd.w, dy1, zD + fT] }, n: '-z', L: 'y',
      bands: bf ? { '+x': bf, '-x': bf, '+y': bf, '-y': bf } : {}, explode: [dd.hinge === 'left' ? -0.3 : 0.3, 0, 1.8], hingeSide: dd.hinge,
    });
    const carcassPanel = dd.hinge === 'left' ? col.left : col.right;
    hingeSides.push({ panel: carcassPanel, door });
    mountHinges(ctx, o, door, carcassPanel, { onPartition: carcassPanel.role === 'partition', zEnd, hingeSides, c });
    ys.push(...(door.hingeYs ?? []));
    mountHandle(ctx, o, door, { orientation: 'vertical', kind: o.kind });
    ctx.groups.push({ type: 'door', id: door.id, partIds: [door.id], hinge: dd.hinge, axisX: dd.hinge === 'left' ? dd.x0 : dd.x0 + dd.w, axisZ: zD });
  });
  return ys;
}

const VARIANT_BG = { full: 'покрит кант', half: 'полупокрит кант', inset: 'открит кант' };

function mountHinges(ctx, o, door, carcassPanel, { onPartition, zEnd, hingeSides, c }) {
  const family = hingeProduct(o.hinge);
  const sys = hingeSystemOf(family);
  if (!family || !sys) {
    ctx.warn('error', 'Няма избрана панта с данни за пробиване.');
    return;
  }
  const [x0, y0] = door.box.min;
  const [x1, y1] = door.box.max;
  const zBack = door.box.min[2];
  const Wd = x1 - x0;
  const Hd = y1 - y0;
  const left = door.hingeSide === 'left';
  const edgeX = left ? x0 : x1;
  const sgn = left ? 1 : -1; // towards the door centre
  // overlay on the panel the door hangs on → crank variant, cup distance C and mounting plate (manufacturer formula)
  const variant = onPartition ? 'half' : 'full';
  const faceX = left ? carcassPanel.box.max[0] : carcassPanel.box.min[0];
  const wanted = Math.round(Math.abs(faceX - edgeX) * 10) / 10;
  const sol = solveOverlay(sys, variant, wanted);
  if (!sol) {
    ctx.warn('error', `${sys.name}: няма вариант за ${VARIANT_BG[variant]}.`);
    return;
  }
  if (!sol.exact) ctx.warn('warn', `${door.name}: наслагване ${dimTxt(wanted)} mm е извън обхвата на ${sys.name} — реално ${dimTxt(sol.overlay)} mm (C = ${dimTxt(sol.c)}, планка ${dimTxt(sol.plate)} mm).`);
  door.hinge = { variant, c: sol.c, plate: sol.plate, overlay: sol.overlay, wanted, system: sys.id };
  const mass = (Wd / 1000) * (Hd / 1000) * (door.T / 1000) * DENSITY + HANDLE_KG;
  door.massKg = r1(mass);
  const lim = hingeLimits(sys);
  const cnt = hingeCount(mass, Wd, Hd, sys);
  if (Wd > HINGE_LIMITS.maxWidth) ctx.warn('error', `${door.name}: ${Math.round(Wd)} mm е по-широка от ${HINGE_LIMITS.maxWidth} mm — раздели на 2 врати.`);
  else if (Wd > 600) ctx.warn('warn', `${door.name}: ${Math.round(Wd)} mm > 600 mm — добавена още една панта.`);
  if (mass > lim.maxMassKg || Hd > lim.maxHeight) ctx.warn('error', `${door.name}: ${Math.round(Hd)} mm, ≈ ${dimTxt(mass)} kg — извън таблицата на производителя (до ${lim.maxHeight} mm и ${dimTxt(lim.maxMassKg)} kg).`);
  const fromEdge = sys.positions?.fromEdge ?? 80;
  const dy0 = sys.plate.holes[0] ?? 0;
  const first = y0 + fromEdge;
  const last = y1 - fromEdge;
  let ys = Array.from({ length: cnt }, (_, k) => (cnt === 1 ? first : first + ((last - first) * k) / (cnt - 1))).map((y) => snapHingeY(y, c, dy0));
  // keep the hinges inside the door with room for the cup, moving whole pitches so the plate stays on the grid
  const lo = y0 + sys.cup.d / 2 + 30;
  const hi = y1 - sys.cup.d / 2 - 30;
  const inside = (y) => {
    let v = y;
    while (v < lo && v + SYSTEM.pitch <= hi) v += SYSTEM.pitch;
    while (v > hi && v - SYSTEM.pitch >= lo) v -= SYSTEM.pitch;
    return r1(v);
  };
  ys = [...new Set(ys.map(inside))];
  // a partition carrying hinges on both faces: plates share no hole (Euro screws from both sides would meet)
  if (onPartition) {
    const others = hingeSides.filter((h) => h.panel === carcassPanel && h.door !== door && h.door.hingeYs).flatMap((h) => h.door.hingeYs);
    const span = Math.max(...sys.plate.holes) - Math.min(...sys.plate.holes);
    const clash = (y) => others.some((oy) => Math.abs(oy - y) <= span + 0.01);
    const mid = (y0 + y1) / 2;
    ys = ys.map((y) => {
      let v = y;
      for (let guard = 0; clash(v) && guard < 4; guard += 1) v = r1(v + (y > mid ? -1 : 1) * (span + SYSTEM.pitch));
      return v;
    });
  }
  door.hingeYs = ys;
  door.hingePanel = carcassPanel.id;
  door.plateHoles = sys.plate.holes.length;
  door.hingeSpreadShort = ys.length > 1 && ys.at(-1) - ys[0] <= Wd; // Blum Inc. note, aggregated in model.js
  const product = family.variants?.[variant] ?? null;
  const label = product ? `${product.brand ?? family.brand} ${product.mfrSku ?? product.sku ?? ''}`.trim() : `${family.brand} ${VARIANT_BG[variant]}`;
  const meta = { hw: 'hinge', ref: family.id, refName: family.name, label };
  const cupX = edgeX + sgn * (sol.c + sys.cup.d / 2);
  const pz = zEnd - sys.plate.setback;
  const f = sys.fixings;
  const dowel = family.fixing === 'dowel' && f.dowel;
  for (const y of ys) {
    hole(door, [cupX, y, zBack], sys.cup.d, sys.cup.depth, 'cup', meta);
    for (const dy of [-f.spacing / 2, f.spacing / 2]) {
      const w = [cupX + sgn * f.offset, y + dy, zBack];
      if (dowel) hole(door, w, f.dowel.d, f.dowel.depth, 'cup-dowel', meta);
      else {
        const [u, v] = toUV(door, w);
        door.features.push({ type: 'mark', u, v, world: w, kind: 'cup-screw', note: f.screw, ...meta });
      }
    }
    for (const dy of sys.plate.holes) addHoleOnce(carcassPanel, [faceX, y + dy, pz], sys.plate.d, sys.plate.depth, 'plate', { hw: 'plate', ref: family.id, refName: family.name, label: `${sys.brand} планка` }, onPartition);
  }
  ctx.hw(`hinge:${family.id}:${variant}`, {
    name: product ? product.name : `${family.name} — ${VARIANT_BG[variant]} (няма в каталога, поръчай отделно)`,
    qty: ys.length, unit: 'бр.', group: 'Обков', variant,
    sku: product?.mfrSku ?? product?.sku, brand: product?.brand ?? family.brand, price: product?.price, currency: product?.currency, url: product?.url, shop: product?.shop,
  });
  ctx.hw(`plate:${sys.id}:${sol.plate}`, { name: `${sys.plate.productName}, ${dimTxt(sol.plate)} mm`, qty: ys.length, unit: 'бр.', group: 'Обков' });
}

export function mountHandle(ctx, o, front, { orientation, kind }) {
  const h = handleModel(o.handle);
  if (!h) return;
  const { min, max } = front.box;
  const zIn = max[2] - front.T;
  const w = max[0] - min[0];
  const hgt = max[1] - min[1];
  let cx;
  let cy;
  let horizontal = orientation === 'horizontal';
  if (front.role === 'door') {
    const fromEdge = Math.max(30, (h.width ?? 20) / 2 + 20);
    cx = front.hingeSide === 'left' ? max[0] - fromEdge : min[0] + fromEdge;
    if (kind === 'wall') cy = min[1] + Math.min(130, hgt / 3);
    else if (hgt < 900) cy = max[1] - Math.min(130, hgt / 3);
    else cy = clamp(1050, min[1] + 200, max[1] - 200);
    if (h.type === 'profile' || h.type === 'edge') horizontal = false;
  } else {
    cx = (min[0] + max[0]) / 2;
    cy = hgt < 260 ? (min[1] + max[1]) / 2 : max[1] - 70;
    horizontal = true;
  }
  const pts = [];
  if (h.holes === 2 && h.spacing) {
    const room = (horizontal ? w : hgt) - 40;
    if (h.spacing > room) {
      ctx.warn('warn', `${front.name}: дръжка ${h.spacing} mm е по-дълга от фронта — избери по-къса.`);
      return;
    }
    const half = h.spacing / 2;
    if (horizontal) pts.push([cx - half, cy, zIn], [cx + half, cy, zIn]);
    else pts.push([cx, cy - half, zIn], [cx, cy + half, zIn]);
  } else {
    pts.push([cx, cy, zIn]);
  }
  const label = h.brand && h.sku ? `${h.brand} ${h.sku}` : h.name;
  for (const p of pts) holeThrough(front, p, h.drill ?? 5, 'handle', { hw: 'handle', ref: h.id, refName: h.name, label });
  front.handle = { x: cx, y: cy, horizontal, model: h };
  ctx.symbols.push({ type: 'handle', partId: front.id, x: cx, y: cy, z: max[2], horizontal, model: h, module: front.module });
  ctx.hw(`handle:${h.id}`, { name: h.name, qty: 1, unit: 'бр.', group: 'Обков', sku: h.sku, brand: h.brand, price: h.price, currency: h.currency, url: h.url, shop: h.shop });
}
