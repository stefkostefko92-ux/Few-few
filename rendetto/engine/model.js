// Model: normalized spec → parts, hardware, movable groups and symbols, then the checks that need the whole model
// (shelf sag, sheet fit, small parts, hole clashes, confirmat caps, horizontal holes).
import { createCtx, cutSize } from './panel.js';
import { TYPES, BUILDERS, normalizeParams, typeDims } from './types.js';
import { STOCK, hasDecor, hasRal, decorName } from './materials.js';
import { hingeList, handleList, slideList, bedFittingList } from './hardware.js';
import { clamp, plural, dimTxt } from './util.js';
import { purposeOf } from './drill.js';

export const SPEC_VERSION = 2;
export const SHEET_TRIM = 10; // sheet edge trim for nesting, mm
const MIN_WEB = 2; // material left between two holes or a hole and an edge, mm
const SMALL_PART = { w: 50, area: 0.02 }; // narrower or smaller parts are hard to hold on a vacuum table
const CAP_ROLES = new Set(['side', 'top', 'bed-head', 'bed-foot']);
const CAP_KEYS = new Set(['footRail']); // a bed without a footboard: the foot rail's outer face shows the confirmat heads

export const SPEC_DEFAULTS = {
  type: 'base',
  carcassDecor: 'demo:white',
  frontDecor: 'demo:oak',
  frontMaterial: 'decor',
  frontRal: 'RAL 9016',
  bandCarcass: 1,
  bandFront: 2,
  gap: 3,
  bandCompensation: true,
  tool: 10,
  post: 'iso',
  onion: true,
};

// Shelf test loads behind the 0.5 % deflection criterion: 1.0 kg/dm² (EN 16121 level 1, UNI 11663 other use) and
// 1.5 kg/dm² (UNI 11663 kitchen), per the CATAS comparison table of furniture standards (February 2024).
const KITCHEN_TYPES = new Set(['base', 'wall', 'tall', 'kitchen']);
export const SHELF_LOADS = [1, 1.5, 2];
export const SHELF_SAG_LIMIT = 0.005;

// The app replaces the built-in demo decors with real catalog decors once the catalog is registered.
export function setSpecDefaults(over) {
  for (const [k, v] of Object.entries(over)) if (k in SPEC_DEFAULTS && v !== undefined) SPEC_DEFAULTS[k] = v;
}

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
const pickId = (v, list) => (list.some((x) => x.id === v) ? v : list[0]?.id ?? '');

export function normalizeSpec(input = {}) {
  const type = TYPES[input.type] ? input.type : SPEC_DEFAULTS.type;
  const d = SPEC_DEFAULTS;
  const s = { v: SPEC_VERSION, type, ...normalizeParams(type, input) };
  s.carcassDecor = hasDecor(input.carcassDecor) ? input.carcassDecor : d.carcassDecor;
  s.frontDecor = hasDecor(input.frontDecor) ? input.frontDecor : d.frontDecor;
  s.frontRal = hasRal(input.frontRal) ? input.frontRal : hasRal(d.frontRal) ? d.frontRal : null;
  s.frontMaterial = input.frontMaterial === 'ral' && s.frontRal ? 'ral' : 'decor';
  s.bandCarcass = pick(Number(input.bandCarcass ?? d.bandCarcass), [0, 0.8, 1, 2], d.bandCarcass);
  s.bandFront = pick(Number(input.bandFront ?? d.bandFront), [0.8, 1, 2], d.bandFront);
  s.gap = clamp(Number(input.gap) || d.gap, 2, 4);
  s.hinge = pickId(input.hinge, hingeList());
  s.handle = input.handle === 'none' ? 'none' : pickId(input.handle, handleList());
  s.slide = pickId(input.slide, slideList());
  s.bedFitting = pickId(input.bedFitting, bedFittingList());
  s.bandCompensation = input.bandCompensation !== false;
  s.tool = pick(Number(input.tool ?? d.tool), [6, 8, 10, 12], d.tool);
  s.post = input.post === 'grbl' ? 'grbl' : 'iso';
  s.onion = input.onion !== false;
  s.shelfLoad = SHELF_LOADS.includes(Number(input.shelfLoad)) ? Number(input.shelfLoad) : KITCHEN_TYPES.has(type) ? 1.5 : 1;
  return s;
}

// Defaults of normalizeSpec that depend on the type, besides the type's own size parameters.
const TYPE_DEPENDENT = ['shelfLoad'];

// Another furniture type for a spec: materials, hardware and machine settings stay; the old type's size parameters
// and the type-dependent defaults go, so normalizeSpec gives the new type's own.
export function withType(spec, type) {
  const sizes = TYPES[spec.type]?.defaults ?? {};
  const keep = Object.entries(spec).filter(([k]) => !(k in sizes) && !TYPE_DEPENDENT.includes(k));
  return { ...Object.fromEntries(keep), type };
}

export function buildModel(input) {
  const spec = normalizeSpec(input);
  const ctx = createCtx();
  BUILDERS[spec.type](ctx, spec);
  checkModel(ctx, spec);
  return {
    spec,
    parts: ctx.parts,
    warnings: ctx.warnings,
    groups: ctx.groups,
    symbols: ctx.symbols,
    hardware: ctx.hardwareLines(),
    dims: typeDims(spec.type, spec),
  };
}

// Short-term deflection of a simply supported shelf under a uniform load (no creep), against 0.5 % of the span.
// E = 1600 N/mm² is the EN 312 P2 minimum for 13–20 mm particleboard (manufacturer data sheet, report source [43]).
export function shelfSag(spanMm, depthMm, tMm, loadKg) {
  const E = 1600;
  const I = (depthMm * tMm ** 3) / 12;
  const w = (loadKg * 9.81) / spanMm;
  const mm = (5 * w * spanMm ** 4) / (384 * E * I);
  const limit = spanMm * SHELF_SAG_LIMIT;
  return { mm, limit, ratio: limit > 0 ? mm / limit : 0, E, loadKg };
}

function checkModel(ctx, spec) {
  const { parts } = ctx;
  // shelves
  for (const p of parts.filter((x) => x.role === 'shelf')) {
    const loadKg = ((p.L / 100) * (p.W / 100)) * spec.shelfLoad;
    const sag = shelfSag(p.L, p.W, p.T, loadKg);
    p.sag = sag;
    if (sag.ratio > 1) ctx.warn('warn', `${p.name}: провисване ≈ ${dimTxt(sag.mm)} mm при ${Math.round(loadKg)} kg (${dimTxt(spec.shelfLoad)} kg/dm²) — над 0,5 % от разстоянието между опорите (${dimTxt(sag.limit)} mm). Добавете делител или стеснете колоната.`);
  }
  // sheet fit and small parts
  let small = 0;
  for (const p of parts) {
    const cut = cutSize(p, spec.bandCompensation);
    const [SW, SH] = STOCK[p.stock].sheet;
    const fw = SW - 2 * SHEET_TRIM;
    const fh = SH - 2 * SHEET_TRIM;
    const fits = (cut.L <= fw && cut.W <= fh) || (!p.grain && cut.L <= fh && cut.W <= fw);
    if (!fits) ctx.warn('error', `${p.name}: ${cut.L} × ${cut.W} mm не се побира в лист ${SW} × ${SH} mm${p.grain ? ' по посоката на шарката' : ''}.`);
    if (cut.W < SMALL_PART.w || (cut.L * cut.W) / 1e6 < SMALL_PART.area) small += 1;
  }
  if (small) ctx.warn('info', `${plural(small, 'малък детайл', 'малки детайла')} — режат се с тънка кора (onion skin) или табове; проверете вакуума.`);
  // holes inside the board (the cut part, without its edge band), apart from each other and from the grooves
  for (const p of parts) checkHoles(ctx, p, spec);
  // hinge spread (Blum Inc. note) — reported for fronts wider than they are tall, where it matters
  const short = parts.filter((p) => p.hingeSpreadShort && p.box.max[0] - p.box.min[0] > p.box.max[1] - p.box.min[1]);
  if (short.length) ctx.warn('info', `${plural(short.length, 'широка ниска врата', 'широки ниски врати')}: разстоянието между крайните панти е по-малко от ширината (бележка в каталога на Blum Inc.) — помислете за 2 врати или подемен механизъм.`);
  // horizontal holes are not cut by the 3-axis router
  const edge = parts.reduce((a, p) => a + p.edgeOps.reduce((b, e) => b + e.count, 0), 0);
  if (edge) ctx.warn('info', `${plural(edge, 'хоризонтален отвор', 'хоризонтални отвора')} в челата — пробиват се на хоризонтална машина или с шаблон, не са в G-кода.`);
  // confirmat heads on visible faces get caps in the colour of the panel
  const caps = new Map();
  for (const p of parts) {
    if (!CAP_ROLES.has(p.role) && !CAP_KEYS.has(p.key)) continue;
    const n = p.features.filter((f) => f.type === 'hole' && f.kind === 'confirmat').length;
    if (n) caps.set(p.decor, (caps.get(p.decor) ?? 0) + n);
  }
  for (const [decor, qty] of caps) ctx.hw(`caps:${decor}`, { name: `Капачка за конфирмат, ${decorName(decor)}`, qty, unit: 'бр.', group: 'Крепежи' });
}

// Distance from a point to a groove's centre line (a segment along u or v).
function toSegment(u, v, g) {
  const du = g.u2 - g.u1;
  const dv = g.v2 - g.v1;
  const len2 = du * du + dv * dv;
  const t = len2 ? clamp(((u - g.u1) * du + (v - g.v1) * dv) / len2, 0, 1) : 0;
  return Math.hypot(u - (g.u1 + t * du), v - (g.v1 + t * dv));
}

function checkHoles(ctx, p, spec) {
  const holes = p.features.filter((f) => f.type === 'hole');
  const grooves = p.features.filter((f) => f.type === 'groove');
  const cut = cutSize(p, spec.bandCompensation);
  for (const h of holes) {
    // the board itself: the edge band adds no material to drill into
    const rim = Math.min(h.u - cut.du0, cut.du0 + cut.L - h.u, h.v - cut.dv0, cut.dv0 + cut.W - h.v) - h.d / 2;
    if (rim < 0) ctx.warn('error', `${p.name}: отвор Ø${dimTxt(h.d)} „${purposeOf(h.kind)}“ излиза извън детайла — u ${dimTxt(h.u)}, v ${dimTxt(h.v)}.`);
    else if (rim < MIN_WEB && h.kind !== 'cup') ctx.warn('warn', `${p.name}: отвор Ø${dimTxt(h.d)} „${purposeOf(h.kind)}“ е на ${dimTxt(rim)} mm от ръба.`);
    for (const g of grooves) {
      const web = toSegment(h.u, h.v, g) - (g.w + h.d) / 2;
      if (web < MIN_WEB) ctx.warn('warn', `${p.name}: отвор Ø${dimTxt(h.d)} „${purposeOf(h.kind)}“ е на ${dimTxt(Math.max(0, web))} mm от канала — преместете отвора.`);
    }
  }
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i];
      const b = holes[j];
      if (a.hw === 'hinge' && b.hw === 'hinge' && a.ref === b.ref && a.hingeY === b.hingeY) continue; // one hinge: its cup and its own dowels
      const dist = Math.hypot(a.u - b.u, a.v - b.v);
      if (dist - (a.d + b.d) / 2 < MIN_WEB) {
        ctx.warn(a.kind === 'cup' && b.kind === 'cup' ? 'error' : 'warn', `${p.name}: отворите Ø${dimTxt(a.d)} „${purposeOf(a.kind)}“ и Ø${dimTxt(b.d)} „${purposeOf(b.kind)}“ при u ${dimTxt(a.u)}, v ${dimTxt(a.v)} се застъпват — преместете единия.`);
      }
    }
  }
}

export const typeLabel = (type) => TYPES[type]?.label ?? type;
