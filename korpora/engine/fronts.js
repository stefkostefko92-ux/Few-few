// Hinged doors and handles. Doors are full overlay on outer sides and half overlay on partitions; hinge cups are
// drilled in the door back, mounting plates on the carcass panel on the 32 mm grid, handles through the front.
import { panel, hole, holeThrough, mark } from './panel.js';
import { r1, clamp, dimTxt, plural } from './util.js';
import { hingeCount, hingeProduct, hingeSystemOf, handleModel, handleHoles, hingeLimits, solveOverlay, HINGE_LIMITS } from './hardware.js';
import { SYSTEM, MIN_WEB, FRONT_GAP_Z, addHoleOnce, snapHingeY } from './joinery.js';

const DENSITY = 650; // kg/m³, assumption for the door-weight estimate
const HANDLE_KG = 0.3; // assumption
const HANDLE_MARGIN = 20; // the handle stays this far inside the edges of its front
const BODY_PAST_HOLES = 20; // assumption when the shop gives no length: the body ends 20 mm past each hole
// Handles fixed by the product's own template — an edge pull hooked over the edge, an L profile on the top edge, a
// recessed pull in its pocket: the place is marked, nothing is drilled (the screws or the pocket belong to the product).
const TEMPLATE_HANDLES = new Set(['edge', 'profile', 'gola', 'recessed']);

// One column's doors. a: column geometry and front material from buildCarcass.
export function buildDoors(ctx, o, a) {
  const { i, n, col, fl, fr, dy0, dy1, gap, zEnd, c, fs, frontGrain, bf, fT, nm, key, mod, hingeSides } = a;
  const spanW = fr - fl;
  const where = nm(n > 1 ? `Колона ${i + 1}` : 'Шкаф');
  let doors = col.doors;
  if (doors === 1 && spanW - gap > HINGE_LIMITS.maxWidth) {
    doors = 2;
    ctx.warn('info', `${where}: една врата би била ${Math.round(spanW - gap)} mm (над ${HINGE_LIMITS.maxWidth} mm) — направени са 2 врати.`);
  }
  const half = (spanW - 2 * gap) / 2;
  if (doors === 2 && half > HINGE_LIMITS.maxWidth) ctx.warn('error', `${where}: и при 2 врати всяка е ${Math.round(half)} mm — над ${HINGE_LIMITS.maxWidth} mm, които производителят на пантите допуска. Добавете колона или стеснете мебела.`);
  const defs = doors === 1
    ? [{ x0: fl + gap / 2, w: spanW - gap, hinge: col.hingeSide ?? (i % 2 === 0 ? 'left' : 'right') }]
    : [{ x0: fl + gap / 2, w: half, hinge: 'left' }, { x0: fl + gap / 2 + half + gap, w: half, hinge: 'right' }];
  const ys = [];
  defs.forEach((dd, k) => {
    const zD = zEnd + FRONT_GAP_Z;
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
  // the cup keeps MIN_WEB of board to the cut edge, under the edge band of the hinge edge
  const sol = solveOverlay(sys, variant, wanted, (door.bands[left ? '-x' : '+x'] || 0) + MIN_WEB);
  if (!sol) {
    ctx.warn('error', `${sys.name}: няма вариант за ${VARIANT_BG[variant]}.`);
    return;
  }
  if (!sol.exact) ctx.warn('warn', `${door.name}: наслагване ${dimTxt(wanted)} mm е извън обхвата на ${sys.name} — реално ${dimTxt(sol.overlay)} mm (C = ${dimTxt(sol.c)}, планка ${dimTxt(sol.plate)} mm).`);
  door.hinge = { variant, c: sol.c, plate: sol.plate, overlay: sol.overlay, wanted, system: sys.id };
  // our own rule (the hinge makers give no minimum width): the cup stays in the hinge half of the door and leaves the
  // other half to the handle; such doors are reported together in model.js
  door.narrowForCup = Wd < 2 * (sol.c + sys.cup.d);
  const mass = (Wd / 1000) * (Hd / 1000) * (door.T / 1000) * DENSITY + HANDLE_KG;
  const lim = hingeLimits(sys);
  const cnt = hingeCount(mass, Hd, sys);
  if (mass > lim.maxMassKg || Hd > lim.maxHeight) ctx.warn('error', `${door.name}: ${Math.round(Hd)} mm, ≈ ${dimTxt(mass)} kg — извън таблицата на производителя (до ${lim.maxHeight} mm и ${dimTxt(lim.maxMassKg)} kg).`);
  const others = hingeSides.filter((h) => h.panel === carcassPanel && h.door !== door && h.door.hingeYs).flatMap((h) => h.door.hingeYs);
  // the manufacturer's range from the edges first; when the hinges on the other face of a partition leave no room in
  // it, the nearest place outside the range, with a warning (the plate holes must never meet)
  let ys = hingeHeights(door, sys, cnt, { c, others, keepRange: true });
  const range = sys.positions?.edgeRange;
  if (!ys && range) {
    ys = hingeHeights(door, sys, cnt, { c, others, keepRange: false });
    if (ys) ctx.warn('warn', `${door.name}: крайните панти са на ${dimTxt(ys[0] - y0)} и ${dimTxt(y1 - ys.at(-1))} mm от ръбовете — ${sys.brand} препоръчва ${range[0]}–${range[1]} mm, но пантите от другата страна на делителя заемат тези места.`);
  }
  if (!ys) {
    ctx.warn('error', `${door.name}: ${plural(cnt, 'панта не се побира', 'панти не се побират')} по височината ${Math.round(Hd)} mm${onPartition ? ' покрай пантите от другата страна на делителя' : ''} — увеличете вратата или сменете разпределението.`);
    return;
  }
  const minSpacing = sys.positions?.minSpacing;
  const tight = ys.slice(1).map((y, k) => y - ys[k]).filter((d) => minSpacing && d < minSpacing);
  if (tight.length) ctx.warn('error', `${door.name}: пантите са на ${dimTxt(Math.min(...tight))} mm една от друга — ${sys.brand} изисква поне ${minSpacing} mm. Изберете друга система панти или по-висока врата.`);
  door.hingeYs = ys;
  door.hingePanel = carcassPanel.id;
  door.plateHoles = sys.plate.holes.length;
  door.hingeSpreadShort = ys.length > 1 && ys.at(-1) - ys[0] <= Wd; // Blum Inc. note, aggregated in model.js
  const product = family.variants?.[variant] ?? null;
  const label = product ? `${product.brand ?? family.brand} ${product.mfrSku ?? product.sku ?? ''}`.trim() : `${family.brand} ${VARIANT_BG[variant]}`;
  const cupX = edgeX + sgn * (sol.c + sys.cup.d / 2);
  const pz = zEnd - sys.plate.setback;
  const f = sys.fixings;
  const dowel = family.fixing === 'dowel' && f.dowel;
  for (const y of ys) {
    const meta = { hw: 'hinge', ref: family.id, refName: family.name, label, hingeY: y }; // hingeY: the cup and its own fixings
    hole(door, [cupX, y, zBack], sys.cup.d, sys.cup.depth, 'cup', meta);
    for (const dy of [-f.spacing / 2, f.spacing / 2]) {
      const w = [cupX + sgn * f.offset, y + dy, zBack];
      if (dowel) hole(door, w, f.dowel.d, f.dowel.depth, 'cup-dowel', meta);
      else mark(door, w, 'cup-screw', { note: f.screw, ...meta });
    }
    for (const dy of sys.plate.holes) addHoleOnce(carcassPanel, [faceX, y + dy, pz], sys.plate.d, sys.plate.depth, 'plate', { hw: 'plate', ref: family.id, refName: family.name, label: `${sys.brand} планка` }, onPartition);
  }
  ctx.hw(`hinge:${family.id}:${variant}`, {
    name: product ? product.name : `${family.name} — ${VARIANT_BG[variant]} (няма в каталога, поръчайте отделно)`,
    qty: ys.length, unit: 'бр.', group: 'Обков', variant,
    sku: product?.mfrSku ?? product?.sku, brand: product?.brand ?? family.brand, price: product?.price, currency: product?.currency, url: product?.url, shop: product?.shop,
  });
  ctx.hw(`plate:${sys.id}:${sol.plate}`, { name: `${sys.plate.productName}, ${dimTxt(sol.plate)} mm`, qty: ys.length, unit: 'бр.', group: 'Обков' });
}

// Hinge heights on the 32 mm grid, spread as far apart as the system allows (Blum and Hettich: as far apart as
// possible), every cup at least 30 mm inside the door and, where the manufacturer gives a range (Hettich: 60–100 mm),
// the top and bottom hinges inside it (`keepRange`). Two hinges of one door, and a hinge and the hinges of the door on
// the other face of a partition, stay whole pitches apart with no plate hole in common (the screws from both faces
// would meet) and no cups touching. Each hinge takes the nearest free grid place, towards the middle first; null
// when that many hinges do not fit.
function hingeHeights(door, sys, cnt, { c, others, keepRange }) {
  const y0 = door.box.min[1];
  const y1 = door.box.max[1];
  const pos = sys.positions ?? {};
  const near = Math.max(pos.edgeRange?.[0] ?? 0, sys.cup.d / 2 + 30); // closest to the top or bottom edge
  const far = keepRange ? pos.edgeRange?.[1] ?? Infinity : Infinity; // farthest the outer hinges may sit from their edge
  const usual = pos.fromEdge ?? 80;
  // a short door with a minimum spacing: the outer hinges go as close to the edges as allowed
  const fromEdge = pos.minSpacing && (cnt - 1) * pos.minSpacing > y1 - y0 - 2 * usual ? near : usual;
  const dy0 = sys.plate.holes[0] ?? 0;
  const span = Math.max(...sys.plate.holes) - Math.min(...sys.plate.holes);
  const apart = Math.ceil((Math.max(span + 0.01, sys.cup.d + MIN_WEB) - 0.01) / SYSTEM.pitch) * SYSTEM.pitch;
  const first = y0 + fromEdge;
  const last = y1 - fromEdge;
  const ideal = Array.from({ length: cnt }, (_, k) => snapHingeY(cnt === 1 ? first : first + ((last - first) * k) / (cnt - 1), c, dy0));
  const bounds = (k) => [k === 0 ? y0 + near : k === cnt - 1 ? Math.max(y0 + near, y1 - far) : y0 + near, k === 0 ? Math.min(y1 - near, y0 + far) : y1 - near];
  const mid = (y0 + y1) / 2;
  const steps = Math.ceil((y1 - y0) / SYSTEM.pitch) + 1;
  const placed = [];
  const free = (y, [lo, hi]) => y >= lo - 0.01 && y <= hi + 0.01 && others.every((o) => Math.abs(o - y) > span + 0.01) && placed.every((p) => Math.abs(p - y) >= apart - 0.01);
  // the outer hinges first: they carry the door
  const order = ideal.map((y, k) => ({ y, k })).sort((a, b) => Math.abs(b.y - mid) - Math.abs(a.y - mid));
  for (const { y, k } of order) {
    const range = bounds(k);
    const toMid = y <= mid ? 1 : -1;
    let got = null;
    for (let step = 0; step <= steps && got === null; step++) {
      for (const dir of step ? [toMid, -toMid] : [1]) {
        const v = r1(y + dir * step * SYSTEM.pitch);
        if (free(v, range)) {
          got = v;
          break;
        }
      }
    }
    if (got === null) return null;
    placed.push(got);
  }
  return placed.sort((a, b) => a - b);
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
  } else {
    cx = (min[0] + max[0]) / 2;
    cy = hgt < 260 ? (min[1] + max[1]) / 2 : max[1] - 70;
    horizontal = true;
  }
  // the whole handle — its body, not only the holes — stays HANDLE_MARGIN inside the front
  const { pair } = handleHoles(h);
  const body = h.length ?? (pair ? h.spacing + 2 * BODY_PAST_HOLES : h.width ?? 30);
  const reach = Math.max(body, pair ? h.spacing + (h.drill ?? 5) : 0) / 2 + HANDLE_MARGIN;
  const along = horizontal ? w : hgt;
  if (2 * reach > along) {
    ctx.warn('warn', `${front.name}: дръжка ${Math.round(body)} mm не се побира на фронт ${Math.round(along)} mm — изберете по-къса.`);
    return;
  }
  if (horizontal) cx = clamp(cx, min[0] + reach, max[0] - reach);
  else cy = clamp(cy, min[1] + reach, max[1] - reach);
  const pts = [];
  if (pair) {
    const half = h.spacing / 2;
    if (horizontal) pts.push([cx - half, cy, zIn], [cx + half, cy, zIn]);
    else pts.push([cx, cy - half, zIn], [cx, cy + half, zIn]);
  } else {
    pts.push([cx, cy, zIn]);
  }
  const label = h.brand && h.sku ? `${h.brand} ${h.sku}` : h.name;
  const meta = { hw: 'handle', ref: h.id, refName: h.name, label };
  if (TEMPLATE_HANDLES.has(h.type)) {
    for (const p of pts) mark(front, p, 'handle-mark', { ...meta, note: 'по шаблона на производителя' });
    ctx.warn('warn', `${h.name}: монтира се по шаблона на производителя — мястото е отбелязано в чертежите, отвори за нея в G-кода няма.`);
  } else {
    for (const p of pts) holeThrough(front, p, h.drill ?? 5, 'handle', meta);
  }
  ctx.symbols.push({ type: 'handle', partId: front.id, x: cx, y: cy, z: max[2], horizontal, model: h, module: front.module });
  ctx.hw(`handle:${h.id}`, { name: h.name, qty: 1, unit: 'бр.', group: 'Обков', sku: h.sku, brand: h.brand, price: h.price, currency: h.currency, url: h.url, shop: h.shop });
}
