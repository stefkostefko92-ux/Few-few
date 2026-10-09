// TEST-ONLY hardware fixtures. Hinge systems are the real ones (engine/data/hinge-systems.js); hinge families, handles,
// slides and bed fittings are placeholders with the catalog's shape and are never shipped. Also the specs the output
// tests run over, so the outputs and the CNC geometry are checked on the same models.
import { createHash } from 'node:crypto';
import { registerHingeSystems, registerHinges, registerHandles, registerSlideSystems, registerSlides, registerBedFittings } from '../../engine/hardware.js';
import { SLIDE_SYSTEMS } from '../../engine/data/slide-systems.js';
import { HINGE_SYSTEMS } from '../../engine/data/hinge-systems.js';
import { TYPE_ORDER } from '../../engine/types.js';
import { canonicalJson } from '../../engine/util.js';

export const FIXTURE = {
  hingeSystems: HINGE_SYSTEMS,
  hinges: [
    {
      id: 'fx:blum', system: 'blum_clip_top', name: 'Панта (тест), Blum система', brand: 'Test', fixing: 'dowel',
      variants: { full: { name: 'Панта покрит кант (тест)', brand: 'Test', mfrSku: 'FX-5', price: 2, currency: 'EUR' }, half: { name: 'Панта полупокрит кант (тест)', brand: 'Test', mfrSku: 'FX-6', price: 2, currency: 'EUR' } },
    },
    { id: 'fx:hettich', system: 'hettich_sensys', name: 'Панта (тест), Hettich система', brand: 'Test', fixing: 'screw', variants: { full: null, half: null } },
    { id: 'fx:gtv', system: 'gtv_euro35', name: 'Панта (тест), GTV система', brand: 'Test', fixing: 'screw', variants: {} },
    { id: 'fx:salice', system: 'salice_series200', name: 'Панта (тест), Salice система', brand: 'Test', fixing: 'screw', variants: {} },
  ],
  handles: [
    { id: 'fx:h128', name: 'Дръжка 128 (тест)', brand: 'Test', sku: 'FX-128', type: 'bar', holes: 2, spacing: 128, width: 12, drill: 5 },
    { id: 'fx:knob', name: 'Топка (тест)', brand: 'Test', sku: 'FX-K', type: 'knob', holes: 1, width: 30, drill: 5 },
  ],
  slideSystems: SLIDE_SYSTEMS,
  slides: [
    { id: 'fx:h45', system: 'gtv_h45', name: 'Водач (тест), GTV H45 система', brand: 'Test', products: { 450: { name: 'Водач 450 (тест)', sku: 'FX-450', price: 5, currency: 'EUR' } } },
    { id: 'fx:tandem', system: 'blum_tandem_560h', name: 'Водач (тест), TANDEM система', brand: 'Test', products: {} },
  ],
  bedFittings: [{ id: 'fx:bed', name: 'Връзка за легло (тест)', brand: 'Test', sku: 'FX-B' }],
};

export function registerFixtures() {
  registerHingeSystems(FIXTURE.hingeSystems);
  registerHinges(FIXTURE.hinges);
  registerHandles(FIXTURE.handles);
  registerSlideSystems(FIXTURE.slideSystems);
  registerSlides(FIXTURE.slides);
  registerBedFittings(FIXTURE.bedFittings);
}

// Every furniture type, then variants for the other branches: GRBL with an 8 mm cutter and no onion skin, a bed without
// a footboard, cut sizes without band compensation, the other hinge makers.
export const OUTPUT_SPECS = [
  ...TYPE_ORDER.map((type) => ({ type })),
  { type: 'wardrobe', width: 3000, post: 'grbl', tool: 8, onion: false, hinge: 'fx:hettich' },
  { type: 'bed', mattressW: 900, footHeight: 0 },
  { type: 'kitchen', modules: 6, bandCompensation: false, hinge: 'fx:gtv' },
  { type: 'wardrobe', hinge: 'fx:salice' },
  { type: 'bookcase', columns: 3, hinge: 'fx:gtv' },
];

export const outputMeta = (model) => ({ product: 'Korpora', hash: createHash('sha256').update(canonicalJson(model.spec)).digest('hex'), owner: 'Carbon Stealth VCC', date: '2026-10-02' });
