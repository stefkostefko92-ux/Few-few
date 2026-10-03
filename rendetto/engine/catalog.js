// Registers a catalog with the engine: decors, RAL colours, hinge families, handles, slide families and bed
// fittings. Shared by the browser editor and the server (exports). The shop catalog lives only on the server
// (data/catalog.json, not in the repository); without it the engine runs on the base catalog below: the four
// built-in decors, one family per documented hinge and slide system without a shop product, and handles by
// standard hole spacing. Drilling always comes from the manufacturers' documents (./data/*).
import { HINGE_SYSTEMS } from './data/hinge-systems.js';
import { SLIDE_SYSTEMS } from './data/slide-systems.js';
import { registerDecors, registerRal, hasDecor, hasRal } from './materials.js';
import { registerHingeSystems, registerHinges, registerHandles, registerSlideSystems, registerSlides, registerBedFittings } from './hardware.js';
import { setSpecDefaults } from './model.js';

const SYSTEM_NAME = new Map(HINGE_SYSTEMS.map((s) => [s.id, s.name]));
const FAMILY_ORDER = ['blum:71B3·50', 'blum:71T3·50', 'hettich:8645i', 'gtv:ECHC', 'gtv:BICN'];
const rank = (id) => (FAMILY_ORDER.includes(id) ? FAMILY_ORDER.indexOf(id) : FAMILY_ORDER.length);

// Slide systems with holes for the lengths the shops sell; MOVENTO is documented only for NL 600.
const BASE_SLIDE_SYSTEMS = ['gtv_h45', 'blum_tandem_560h'];
const BASE_SPACINGS = [96, 128, 160, 192, 224, 256, 320];

// The catalog without shop data: every value here is a standard size or a manufacturer system, not a product.
export function baseCatalogData() {
  return {
    meta: { base: true },
    decors: [],
    ral: [],
    handles: [
      ...BASE_SPACINGS.map((s) => ({ id: `base:bar-${s}`, name: `Лайсна ${s} mm (артикул по избор)`, type: 'bar', holes: 2, spacing: s, length: s + 24, width: 12, height: 32, drill: 5, drillable: true })),
      { id: 'base:knob', name: 'Топка, един отвор (артикул по избор)', type: 'knob', holes: 1, width: 30, drill: 5, drillable: true },
    ],
    hinges: [],
    hingeFamilies: HINGE_SYSTEMS.map((s) => ({ id: `base:${s.id}`, system: s.id, brand: s.brand, name: `${s.name} (артикул по избор)`, fixing: 'screw', softClose: true, variants: {} })),
    slides: [],
    slideFamilies: SLIDE_SYSTEMS.filter((s) => BASE_SLIDE_SYSTEMS.includes(s.id)).map((s) => ({ id: `base:${s.id}`, system: s.id, brand: s.brand, name: `${s.name} (артикул по избор)`, products: {} })),
    bed: [],
  };
}

// data: the parsed catalog (or baseCatalogData()). Returns the lists for the catalog tab.
export function registerCatalog(data) {
  const catalog = {
    meta: data.meta ?? {},
    decors: data.decors ?? [],
    ral: data.ral ?? [],
    handles: data.handles ?? [],
    hinges: (data.hinges ?? []).map((h) => ({ ...h, systemName: SYSTEM_NAME.get(h.system) ?? h.system })),
    slides: data.slides ?? [],
    bed: data.bed ?? [],
    hingeFamilies: [...(data.hingeFamilies ?? [])].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name)),
    slideFamilies: data.slideFamilies ?? [],
  };
  registerDecors(catalog.decors);
  registerRal(catalog.ral);
  registerHingeSystems(HINGE_SYSTEMS);
  registerHinges(catalog.hingeFamilies);
  // default handle first: a chrome 128 mm bar with a price, then the rest in catalog order
  const drillable = catalog.handles.filter((h) => h.drillable);
  const first = drillable.findIndex((h) => h.type === 'bar' && h.spacing === 128 && (Number.isFinite(h.price) ? /хром|chrome/i.test(`${h.finish ?? ''} ${h.color ?? ''}`) : true));
  registerHandles(first > 0 ? [drillable[first], ...drillable.slice(0, first), ...drillable.slice(first + 1)] : drillable);
  registerSlideSystems(SLIDE_SYSTEMS);
  registerSlides(catalog.slideFamilies);
  registerBedFittings(catalog.bed.filter((b) => b.category === 'bed_fitting'));
  setSpecDefaults({
    carcassDecor: hasDecor('egger:W1000') ? 'egger:W1000' : undefined,
    frontDecor: hasDecor('egger:H1145') ? 'egger:H1145' : undefined,
    frontRal: hasRal('RAL 9016') ? 'RAL 9016' : undefined,
  });
  return catalog;
}
