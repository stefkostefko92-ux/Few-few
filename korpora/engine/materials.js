// Board stock, commercial decors and RAL colours. Catalog data is registered at runtime (registerDecors/registerRal);
// the four built-in decors keep the engine usable without a catalog.

export const STOCK = {
  pb18: { id: 'pb18', name: 'ЛПДЧ', thickness: 18, sheet: [2800, 2070] },
  pb16: { id: 'pb16', name: 'ЛПДЧ', thickness: 16, sheet: [2800, 2070] },
  pb25: { id: 'pb25', name: 'ЛПДЧ', thickness: 25, sheet: [2800, 2070] },
  mdf18: { id: 'mdf18', name: 'МДФ за боядисване', thickness: 18, sheet: [2800, 2070], painted: true },
  hdf3: { id: 'hdf3', name: 'HDF', thickness: 3, sheet: [2800, 2070] },
};

const BASE_MANUFACTURER = 'Основни';
const BUILTIN = [
  { id: 'demo:white', manufacturer: BASE_MANUFACTURER, code: 'Бял', name: 'Бял, гладък', category: 'uni', hex: '#ecebe6', finish: 'matt' },
  { id: 'demo:oak', manufacturer: BASE_MANUFACTURER, code: 'Дъб', name: 'Дъб натурален', category: 'wood', hex: '#c8a982', hexDark: '#94714a', finish: 'matt' },
  { id: 'demo:anthracite', manufacturer: BASE_MANUFACTURER, code: 'Антрацит', name: 'Антрацит', category: 'uni', hex: '#3b3e41', finish: 'matt' },
  { id: 'demo:walnut', manufacturer: BASE_MANUFACTURER, code: 'Орех', name: 'Орех', category: 'wood', hex: '#6a4a36', hexDark: '#3a2617', finish: 'matt' },
];

const decors = new Map(BUILTIN.map((d) => [d.id, d]));
const rals = new Map();

const HEX = /^#[0-9a-f]{6}$/i;

export function registerDecors(list) {
  let n = 0;
  for (const d of list) {
    if (!d || !d.id || !HEX.test(d.hex || '')) continue;
    decors.set(d.id, { finish: 'matt', ...d });
    n += 1;
  }
  return n;
}

export function registerRal(list) {
  let n = 0;
  for (const r of list) {
    if (!r || !r.code || !HEX.test(r.hex || '')) continue;
    rals.set(r.code, r);
    n += 1;
  }
  return n;
}

export function decor(id) {
  if (id && id.startsWith('RAL ')) {
    const r = rals.get(id);
    if (r) return { id, manufacturer: 'RAL', code: r.code, name: r.name, category: 'paint', hex: r.hex, finish: 'satin', painted: true };
  }
  return decors.get(id) ?? decors.get('demo:white');
}

export const hasDecor = (id) => typeof id === 'string' && decors.has(id);
export const hasRal = (code) => typeof code === 'string' && rals.has(code);
export const decorList = () => [...decors.values()];
export const ralList = () => [...rals.values()];
export const hasGrain = (id) => decor(id).category === 'wood';
// one of the built-in decors: their code is only a short name, not a catalog code
export const isBaseDecor = (d) => d?.manufacturer === BASE_MANUFACTURER;
export const decorName = (id) => {
  const d = decor(id);
  return isBaseDecor(d) || d.manufacturer === 'RAL' ? d.name : `${d.manufacturer} ${d.code} ${d.name}`;
};

// Front material: laminated board in a decor (edge banded) or MDF lacquered in a RAL colour (no edge band).
export function frontStock(spec) {
  return spec.frontMaterial === 'ral' ? { stock: 'mdf18', decor: spec.frontRal, banded: false } : { stock: 'pb18', decor: spec.frontDecor, banded: true };
}

// Desk top and kitchen worktop: in the front decor, or in the carcass decor when the fronts are lacquered in RAL.
export const boardTopDecor = (spec) => (spec.frontMaterial === 'ral' ? spec.carcassDecor : spec.frontDecor);
