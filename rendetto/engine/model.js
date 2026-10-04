// Model: normalized spec → parts, hardware, movable groups and symbols, then the checks that need the whole model
// (shelf sag, sheet fit, small parts, holes against each other, grooves and edge bores, confirmat caps, horizontal holes).
import { createCtx, cutSize } from './panel.js';
import { TYPES, BUILDERS, normalizeParams } from './types.js';
import { STOCK, hasDecor, hasRal, decorName } from './materials.js';
import { hingeList, handleList, slideList, bedFittingList } from './hardware.js';
import { clamp, plural, dimTxt } from './util.js';
import { purposeOf, edgePurposeOf } from './drill.js';
import { MIN_WEB, toSegment, edgeBores, boreWeb } from './joinery.js';

const SPEC_VERSION = 2;
export const SHEET_TRIM = 10; // sheet edge trim for nesting, mm
const SMALL_PART = { w: 50, area: 0.02 }; // narrower or smaller parts are hard to hold on a vacuum table
const CAP_ROLES = new Set(['side', 'top', 'bed-head', 'bed-foot']);
const CAP_KEYS = new Set(['footRail']); // a bed without a footboard: the foot rail's outer face shows the confirmat heads

const SPEC_DEFAULTS = {
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
// 1.5 kg/dm² (UNI 11663 kitchen), per the CATAS comparison table of furniture standards (February 2024); 2.0 kg/dm²
// is EN 16121:2013 level 2, which the 2023 edition lowered to 1.5 (CATAS, "Non-domestic furniture", January 2024) —
// kept as the heavier option.
const KITCHEN_TYPES = new Set(['base', 'wall', 'tall', 'kitchen']);
export const SHELF_LOADS = [1, 1.5, 2];
const SHELF_SAG_LIMIT = 0.005;
// Edge bands, front gap and router diameters that normalizeSpec accepts; the editor builds its controls from these.
export const BAND_CARCASS = [0, 0.8, 1, 2];
export const BAND_FRONT = [0.8, 1, 2];
export const GAP_RANGE = [2, 4];
export const TOOL_DIAMETERS = [6, 8, 10, 12];

// The app replaces the built-in demo decors with real catalog decors once the catalog is registered.
export function setSpecDefaults(over) {
  for (const [k, v] of Object.entries(over)) if (k in SPEC_DEFAULTS && v !== undefined) SPEC_DEFAULTS[k] = v;
}

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
const pickId = (v, list) => (list.some((x) => x.id === v) ? v : list[0]?.id ?? '');

export function normalizeSpec(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const type = Object.hasOwn(TYPES, input.type) ? input.type : SPEC_DEFAULTS.type;
  const d = SPEC_DEFAULTS;
  const s = { v: SPEC_VERSION, type, ...normalizeParams(type, input) };
  s.carcassDecor = hasDecor(input.carcassDecor) ? input.carcassDecor : d.carcassDecor;
  s.frontDecor = hasDecor(input.frontDecor) ? input.frontDecor : d.frontDecor;
  s.frontRal = hasRal(input.frontRal) ? input.frontRal : hasRal(d.frontRal) ? d.frontRal : null;
  s.frontMaterial = input.frontMaterial === 'ral' && s.frontRal ? 'ral' : 'decor';
  s.bandCarcass = pick(Number(input.bandCarcass ?? d.bandCarcass), BAND_CARCASS, d.bandCarcass);
  s.bandFront = pick(Number(input.bandFront ?? d.bandFront), BAND_FRONT, d.bandFront);
  s.gap = clamp(Number(input.gap) || d.gap, ...GAP_RANGE);
  s.hinge = pickId(input.hinge, hingeList());
  s.handle = input.handle === 'none' ? 'none' : pickId(input.handle, handleList());
  s.slide = pickId(input.slide, slideList());
  s.bedFitting = pickId(input.bedFitting, bedFittingList());
  s.bandCompensation = input.bandCompensation !== false;
  s.tool = pick(Number(input.tool ?? d.tool), TOOL_DIAMETERS, d.tool);
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

// Catalog choices of a saved spec that normalizeSpec had to replace because the item has left the catalog — only
// those the model really uses. An export built from them would drill and cut for something the customer never chose.
const usesHw = (model, hw) => model.parts.some((p) => p.features.some((f) => f.hw === hw));
const usesDecor = (model, id) => model.parts.some((p) => p.decor === id);
// Parts cut from the front material (frontStock): doors, drawer fronts, the plinth board, the bed's head and foot
// boards. The desk top takes the front decor too (boardTopDecor) — but not a RAL colour.
const FRONT_ROLES = new Set(['door', 'drawer-front', 'plinth', 'bed-head', 'bed-foot']);
const usesFronts = (model) => model.parts.some((p) => FRONT_ROLES.has(p.role));
const usesFrontDecor = (model) => usesFronts(model) || model.parts.some((p) => p.key === 'deskTop');
const CATALOG_FIELDS = [
  ['hinge', 'панта', (m) => usesHw(m, 'hinge')],
  ['handle', 'дръжка', (m) => usesHw(m, 'handle')],
  ['slide', 'водач', (m) => usesHw(m, 'slide')],
  ['bedFitting', 'връзка за легло', (m) => m.spec.type === 'bed'],
  ['carcassDecor', 'декор на корпуса', (m) => usesDecor(m, m.spec.carcassDecor)],
  ['frontDecor', 'декор на фронтовете', (m) => m.spec.frontMaterial === 'decor' && usesFrontDecor(m)],
  ['frontRal', 'цвят RAL на фронтовете', (m, input) => input.frontMaterial === 'ral' && usesFronts(m)],
];

export function catalogDrift(input, model) {
  const out = [];
  for (const [key, label, used] of CATALOG_FIELDS) {
    const saved = input?.[key];
    if (typeof saved !== 'string' || saved === model.spec[key] || !used(model, input)) continue;
    out.push(`Вече не е в каталога: ${label} „${saved}“ (заместител: „${model.spec[key] || '—'}“). Изберете наново в редактора и запазете проекта.`);
  }
  return out;
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
  };
}

// Short-term deflection of a simply supported shelf under a uniform load (no creep), against 0.5 % of the span.
// E = 1600 N/mm² is the EN 312 P2 minimum for 13–20 mm particleboard (manufacturer data sheet, report source [43]).
function shelfSag(spanMm, depthMm, tMm, loadKg) {
  const E = 1600;
  const I = (depthMm * tMm ** 3) / 12;
  const w = (loadKg * 9.81) / spanMm;
  const mm = (5 * w * spanMm ** 4) / (384 * E * I);
  const limit = spanMm * SHELF_SAG_LIMIT;
  return { mm, limit, ratio: limit > 0 ? mm / limit : 0 };
}

function checkModel(ctx, spec) {
  const { parts } = ctx;
  // shelves
  for (const p of parts.filter((x) => x.role === 'shelf')) {
    const loadKg = ((p.L / 100) * (p.W / 100)) * spec.shelfLoad;
    const sag = shelfSag(p.L, p.W, p.T, loadKg);
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
    if (!fits) ctx.warn('error', `${p.name}: ${cut.L} × ${cut.W} mm не се побира в лист ${SW} × ${SH} mm${p.grain ? ' по посоката на шарката' : ''}${p.fitHint ? ` — ${p.fitHint}` : ''}.`);
    if (cut.W < SMALL_PART.w || (cut.L * cut.W) / 1e6 < SMALL_PART.area) small += 1;
  }
  if (small) ctx.warn('info', `${plural(small, 'малък детайл', 'малки детайла')} — режат се с тънка кора (onion skin) или табове; проверете вакуума.`);
  // holes inside the board (the cut part, without its edge band), apart from each other and from the grooves
  for (const p of parts) checkHoles(ctx, p, spec);
  // hinge spread (Blum Inc. note) — reported for fronts wider than they are tall, where it matters
  const short = parts.filter((p) => p.hingeSpreadShort && p.box.max[0] - p.box.min[0] > p.box.max[1] - p.box.min[1]);
  if (short.length) ctx.warn('info', `${plural(short.length, 'широка ниска врата', 'широки ниски врати')}: разстоянието между крайните панти е по-малко от ширината (бележка в каталога на Blum Inc.) — помислете за 2 врати или подемен механизъм.`);
  // doors too narrow for their own hinge cup (fronts.js)
  const narrow = parts.filter((p) => p.narrowForCup);
  if (narrow.length) {
    const minW = Math.min(...narrow.map((p) => p.box.max[0] - p.box.min[0]));
    ctx.warn('warn', `${plural(narrow.length, 'тясна врата', 'тесни врати')} (най-тясната ${dimTxt(minW)} mm): чашката на пантата заема повече от половината от ширината — намалете броя на колоните или на вратите.`);
  }
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

function checkHoles(ctx, p, spec) {
  const holes = p.features.filter((f) => f.type === 'hole');
  const grooves = p.features.filter((f) => f.type === 'groove');
  const bores = edgeBores(p);
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
    // a bore from the edge (the thread of a confirmat from the joining panel, a slide hook): the drill or the screw
    // would break into it, so the part is not cut (fail closed)
    for (const b of bores) {
      const web = boreWeb(h, b);
      if (web < MIN_WEB) ctx.warn('error', `${p.name}: отвор Ø${dimTxt(h.d)} „${purposeOf(h.kind)}“ при u ${dimTxt(h.u)}, v ${dimTxt(h.v)} е на ${dimTxt(Math.max(0, web))} mm от хоризонталния отвор Ø${dimTxt(b.d)} „${edgePurposeOf(b.kind)}“ в челото — преместете единия.`);
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
