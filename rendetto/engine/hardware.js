// Hardware models used by the generators: hinge systems (cup, cup fixings, mounting plate), handles, drawer
// slides and bed fittings. Catalog products from Bulgarian shops are registered at runtime and point to a system
// whose drilling pattern comes from the manufacturer's documentation (see catalog/*.json → sources).

const systems = new Map(); // hinge drilling systems by id
const hingeProducts = new Map();
const handles = new Map();
const slides = new Map(); // slide families: { id, name, brand, system, products: { [NL]: product } }
const slideSystems = new Map();
const bedFittings = new Map();

export function registerHingeSystems(list) {
  for (const s of list) systems.set(s.id, s);
}
// Hinge families: one selectable hinge (system, fixing, soft close) with its shop products per crank variant
// { full, half, inset }; the generator takes the variant each door needs.
export function registerHinges(list) {
  for (const h of list) if (systems.has(h.system)) hingeProducts.set(h.id, h);
}
export function registerHandles(list) {
  for (const h of list) handles.set(h.id, h);
}
export function registerSlideSystems(list) {
  for (const s of list) slideSystems.set(s.id, s);
}
export function registerSlides(list) {
  for (const s of list) if (slideSystems.has(s.system)) slides.set(s.id, s);
}
export const slideSystemOf = (family) => (family ? slideSystems.get(family.system) ?? null : null);
export function registerBedFittings(list) {
  for (const b of list) bedFittings.set(b.id, b);
}

export const hingeList = () => [...hingeProducts.values()];
export const handleList = () => [...handles.values()];
export const slideList = () => [...slides.values()];
export const bedFittingList = () => [...bedFittings.values()];
export const hingeSystemList = () => [...systems.values()];

export function hingeProduct(id) {
  return hingeProducts.get(id) ?? hingeProducts.values().next().value ?? null;
}
export function hingeSystemOf(product) {
  return product ? systems.get(product.system) : null;
}
export function handleModel(id) {
  if (id === 'none') return null;
  return handles.get(id) ?? handles.values().next().value ?? null;
}
export function slideModel(id) {
  return slides.get(id) ?? slides.values().next().value ?? null;
}
export function bedFitting(id) {
  return bedFittings.get(id) ?? bedFittings.values().next().value ?? null;
}

// Door width: at most 600 mm — Blum FAQ 01.2025 (B4), p. 5 „The maximum door width is 600 mm“ and p. 6 „Can I design
// my door to be wider than 600 mm? No … the warranty will be voided“. The older EASY ASSEMBLY page (B5) still allows
// 650 mm with one more hinge; the stricter, newer document wins. Wider openings get two doors (fronts.js).
// Hinge count. With the system's own table (Hettich p. 129, Blum B4 p. 6): the first row whose height and weight
// both cover the door. Otherwise the larger of two Blum guidelines:
// (1) CLIP top BLUMOTION (https://ea.blum.com/en/number-of-hinges/): 2 hinges for 4–6 kg, 3 hinges for 6–12 kg.
// (2) Blum Inc. catalogue 2016, p. 76 "Hinges per door": 2 hinges up to 40" (1016 mm) and < 15 lb (6.8 kg), 3 up to
//     60" (1524 mm) and 15–30 lb, 4 up to 80" (2032 mm) and 30–45 lb, 5 up to 100" (2540 mm) and 45–60 lb (27.2 kg).
export const HINGE_LIMITS = { maxWidth: 600, maxHeight: 2540, maxMassKg: 27.2 };

export function hingeCount(massKg, doorHeight, sys = null) {
  const rows = sys?.count?.rows;
  if (rows) {
    const row = rows.find(([, h, kg]) => doorHeight <= h && massKg <= kg) ?? rows.at(-1);
    return row[0];
  }
  const byHeight = doorHeight <= 1016 ? 2 : doorHeight <= 1524 ? 3 : doorHeight <= 2032 ? 4 : 5;
  const byMass = massKg <= 6 ? 2 : massKg <= 12 ? 3 : massKg <= 20.4 ? 4 : 5;
  return Math.max(byHeight, byMass);
}

// Limits of the system's own table (or of the Blum guidelines).
export function hingeLimits(sys) {
  const last = sys?.count?.rows?.at(-1);
  return last ? { maxWidth: HINGE_LIMITS.maxWidth, maxHeight: last[1], maxMassKg: last[2] } : HINGE_LIMITS;
}

// Solve the cup distance C and the mounting plate for a wanted overlay; when no plate brings C inside the
// manufacturer's range, the closest is used and the real overlay is reported.
export function solveOverlay(sys, variant, wanted) {
  const base = sys.overlay.base[variant];
  if (base === undefined) return null;
  const [cMin, cMax] = sys.cup.c;
  let best = null;
  for (const plate of sys.plate.plates) {
    const c = wanted - base + plate;
    const off = c < cMin ? cMin - c : c > cMax ? c - cMax : 0;
    if (!best || off < best.off) best = { plate, c, off };
    if (off === 0) break;
  }
  const c = Math.min(cMax, Math.max(cMin, best.c));
  return { c: Math.round(c * 10) / 10, plate: best.plate, overlay: Math.round((c + base - best.plate) * 10) / 10, exact: best.off === 0 };
}

// The longest documented nominal length that fits the available inner depth.
export function slideLength(sys, available) {
  const fit = (sys?.lengths ?? []).filter((nl) => sys.depthNeeded(nl) <= available).sort((a, b) => b - a);
  return fit[0] ?? null;
}
