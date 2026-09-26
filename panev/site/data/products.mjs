// Кодовете, размерите и цените от каталога 2026 — единственият източник на истината за продуктите
// (цени в евро, IVA esclusa). Трябва да съвпадат 1:1 с печатния каталог.

export const COMPANY = {
  name: 'Panev Ascensori SAS',
  email: 'info@panevascensori.it',
  phone: '+39 379 296 9699',
  phoneHref: '+393792969699',
  site: 'panevascensori.it',
  legalSeat: 'Via Madonna del Salvatore 6, 20010 Vittuone (MI)',
  operativeSeat: 'Via Milano 7, Cornaredo (MI)',
  vat: 'IT09346970966',
  rea: 'MI - 2084376',
  registry: 'Registro Imprese di Milano Monza Brianza Lodi',
};

export const PATENT = { number: '202023000002112' };

export const CATALOG_PDF = '/docs/catalogo-staffe-panev-2026.pdf';
export const CATALOG_EDITION = '2026';
export const CATALOG_PAGES = 95;

// Снимките (img) са 3D рендерите на комплекта от img/3d/ (прави ги `cd 3d && npm run site`).

// 01 — етажни врати: пластина A + планки B от същото сечение.
export const doorSystems = [
  {
    id: 'serie-65',
    serie: 65,
    variant: null,
    regol: '± 8°',
    sp: '5 mm',
    img: 'a-65-170-7_b-65-320',
    items: [
      { code: 'A 65 170 7', type: 'A', dims: '170 × 75 mm', price: 13.68 },
      { code: 'B 65 320', type: 'B', dims: '320 × 65 × 65 mm', price: 11.77 },
      { code: 'B 65 220', type: 'B', dims: '220 × 65 × 65 mm', price: 10.48 },
    ],
  },
  {
    id: 'serie-45-170',
    serie: 45,
    variant: '170 × 70',
    regol: '± 7°',
    sp: '5 mm',
    img: 'a-45-170-7_b-45-320',
    items: [
      { code: 'A 45 170 7', type: 'A', dims: '170 × 70 mm', price: 12.46 },
      { code: 'B 45 320', type: 'B', dims: '320 × 45 × 60 mm', price: 11.48 },
      { code: 'B 45 220', type: 'B', dims: '220 × 45 × 60 mm', price: 10.21 },
    ],
  },
  {
    id: 'serie-45-175',
    serie: 45,
    variant: '175 × 60',
    regol: '± 7°',
    sp: '5 mm',
    img: 'a-45-175-2_b-45-320',
    items: [
      { code: 'A 45 175 2', type: 'A', dims: '175 × 60 mm', price: 11.77 },
      { code: 'B 45 320', type: 'B', dims: '320 × 45 × 60 mm', price: 11.48 },
      { code: 'B 45 220', type: 'B', dims: '220 × 45 × 60 mm', price: 10.21 },
    ],
  },
  {
    id: 'serie-37-150',
    serie: 37,
    variant: '150 × 70',
    regol: '± 7°',
    sp: '4 mm',
    img: 'a-37-150-7_b-37-320',
    items: [
      { code: 'A 37 150 7', type: 'A', dims: '150 × 70 mm', price: 12.0 },
      { code: 'B 37 320', type: 'B', dims: '320 × 37 × 60 mm', price: 11.33 },
      { code: 'B 37 220', type: 'B', dims: '220 × 37 × 60 mm', price: 10.0 },
    ],
  },
  {
    id: 'serie-37-170',
    serie: 37,
    variant: '170 × 60',
    regol: '± 7°',
    sp: '4 mm',
    img: 'a-37-170-2_b-37-320',
    items: [
      { code: 'A 37 170 2', type: 'A', dims: '170 × 60 mm', price: 10.74 },
      { code: 'B 37 320', type: 'B', dims: '320 × 37 × 60 mm', price: 11.33 },
      { code: 'B 37 220', type: 'B', dims: '220 × 37 × 60 mm', price: 10.0 },
    ],
  },
];

// 02–04 — опора (SU / SD / SC) + планка за водач SG.
export const guideConfigs = {
  su: [
    {
      sup: { code: 'SU 220 160', dims: '220 × 160 mm', sp: '5 mm', price: 10.92 },
      gui: { code: 'SG 80 150', dims: '80 × 150 mm', sp: '4 mm', price: 9.96 },
      corsa: '45 – 155 mm',
      img: 'su-220-160_sg-80-150',
    },
    {
      sup: { code: 'SU 220 180', dims: '220 × 180 mm', sp: '5 mm', price: 11.33 },
      gui: { code: 'SG 80 170', dims: '80 × 170 mm', sp: '4 mm', price: 10.1 },
      corsa: '45 – 195 mm',
      img: 'su-220-180_sg-80-170',
    },
    {
      sup: { code: 'SU 220 200', dims: '220 × 200 mm', sp: '5 mm', price: 11.6 },
      gui: { code: 'SG 80 190', dims: '80 × 190 mm', sp: '4 mm', price: 10.24 },
      corsa: '45 – 215 mm',
      img: 'su-220-200_sg-80-190',
    },
  ],
  sd: [
    {
      sup: { code: 'SD 150 160', dims: '150 × 160 mm', sp: '5 mm', price: 9.69 },
      gui: { code: 'SG 80 150', dims: '80 × 150 mm', sp: '4 mm', price: 9.96 },
      corsa: '45 – 155 mm',
      img: 'sd-150-160_sg-80-150',
    },
    {
      sup: { code: 'SD 150 180', dims: '150 × 180 mm', sp: '5 mm', price: 9.96 },
      gui: { code: 'SG 80 170', dims: '80 × 170 mm', sp: '4 mm', price: 10.1 },
      corsa: '45 – 195 mm',
      img: 'sd-150-180_sg-80-170',
    },
    {
      sup: { code: 'SD 150 200', dims: '150 × 200 mm', sp: '5 mm', price: 10.24 },
      gui: { code: 'SG 80 190', dims: '80 × 190 mm', sp: '4 mm', price: 10.24 },
      corsa: '45 – 215 mm',
      img: 'sd-150-200_sg-80-190',
    },
    {
      sup: { code: 'SD 220 160', dims: '220 × 160 mm', sp: '5 mm', price: 10.92 },
      gui: { code: 'SG 80 150', dims: '80 × 150 mm', sp: '4 mm', price: 9.96 },
      corsa: '50 – 155 mm',
      img: 'sd-220-160_sg-80-150',
    },
    {
      sup: { code: 'SD 220 180', dims: '220 × 180 mm', sp: '5 mm', price: 11.19 },
      gui: { code: 'SG 80 170', dims: '80 × 170 mm', sp: '4 mm', price: 10.1 },
      corsa: '45 – 195 mm',
      img: 'sd-220-180_sg-80-170',
    },
    {
      sup: { code: 'SD 220 200', dims: '220 × 200 mm', sp: '5 mm', price: 11.47 },
      gui: { code: 'SG 80 190', dims: '80 × 190 mm', sp: '4 mm', price: 10.24 },
      corsa: '45 – 215 mm',
      img: 'sd-220-200_sg-80-190',
    },
  ],
  sc: [
    {
      sup: { code: 'SC 50 200', dims: '50 × 200 mm', sp: '4 mm', price: 7.64 },
      gui: { code: 'SG 50 190', dims: '50 × 190 mm', sp: '4 mm', price: 9.15 },
      corsa: '45 – 210 mm',
      img: 'sc-50-200_sg-50-190',
    },
    {
      sup: { code: 'SC 60 200', dims: '60 × 200 mm', sp: '4 mm', price: 7.92 },
      gui: { code: 'SG 60 190', dims: '60 × 190 mm', sp: '4 mm', price: 9.42 },
      corsa: '45 – 213 mm',
      img: 'sc-60-200_sg-60-190',
    },
    {
      sup: { code: 'SC 80 200', dims: '80 × 200 mm', sp: '4 mm', price: 10.24 },
      gui: { code: 'SG 80 190', dims: '80 × 190 mm', sp: '4 mm', price: 10.24 },
      corsa: '45 – 215 mm',
      img: 'sc-80-200_sg-80-190',
    },
    {
      sup: { code: 'SC 90 200', dims: '90 × 200 mm', sp: '4 mm', price: 10.51 },
      gui: { code: 'SG 80 190', dims: '80 × 190 mm', sp: '4 mm', price: 10.24 },
      corsa: '45 – 215 mm',
      img: 'sc-90-200_sg-80-190',
    },
    {
      sup: { code: 'SC 50 220', dims: '50 × 220 mm', sp: '4 mm', price: 7.92 },
      gui: { code: 'SG 50 220', dims: '50 × 220 mm', sp: '4 mm', price: 9.28 },
      corsa: '45 – 235 mm',
      img: 'sc-50-220_sg-50-220',
    },
    {
      sup: { code: 'SC 60 220', dims: '60 × 220 mm', sp: '4 mm', price: 8.19 },
      gui: { code: 'SG 60 220', dims: '60 × 220 mm', sp: '4 mm', price: 9.56 },
      corsa: '45 – 235 mm',
      img: 'sc-60-220_sg-60-220',
    },
    {
      sup: { code: 'SC 80 220', dims: '80 × 220 mm', sp: '4 mm', price: 10.92 },
      gui: { code: 'SG 80 220', dims: '80 × 220 mm', sp: '4 mm', price: 10.51 },
      corsa: '45 – 235 mm',
      img: 'sc-80-220_sg-80-220',
    },
    {
      sup: { code: 'SC 90 220', dims: '90 × 220 mm', sp: '4 mm', price: 11.33 },
      gui: { code: 'SG 80 220', dims: '80 × 220 mm', sp: '4 mm', price: 10.51 },
      corsa: '45 – 235 mm',
      img: 'sc-90-220_sg-80-220',
    },
  ],
};

// 05 — SG, фиксирана версия: цена по „ширина-дължина“.
export const sgFixed = {
  widths: [50, 60, 80],
  lengths: [130, 150, 170, 190, 220],
  prices: {
    '50-130': 8.6,
    '60-130': 8.6,
    '80-130': 9.56,
    '50-150': 8.74,
    '60-150': 8.87,
    '80-150': 9.96,
    '50-170': 9.01,
    '60-170': 9.15,
    '80-170': 10.1,
    '50-190': 9.15,
    '60-190': 9.42,
    '80-190': 10.24,
    '50-220': 9.28,
    '60-220': 9.56,
    '80-220': 10.51,
  },
};

// 06 — специални решения, по запитване. dimsKey е локализируем ключ вместо суров размер.
export const specials = [
  { code: 'SC 50 170', type: 'supporto', dimsKey: 'onDrawing', price: null },
  { code: 'SG 225 50', type: 'guida', dims: '150 + 30 mm · sp. 5 mm', price: null },
  { code: 'SN 60 65', type: 'angolo', dims: '65 × 65 × 60 mm', price: null },
  { code: 'SN 65 200', type: 'squadra', dims: '65 × 200 × 50 mm', price: null },
  { code: 'BRACCIO 160 190', type: 'braccio', dims: 'l. 190 mm', price: null },
];

// Всички артикули с цена, всеки код веднъж (първото срещане), в реда на ценоразписа.
export function allPricedItems() {
  const seen = new Map();
  const add = (item) => {
    if (item.price != null && !seen.has(item.code)) seen.set(item.code, item);
  };
  for (const s of doorSystems) s.items.forEach(add);
  for (const c of [...guideConfigs.su, ...guideConfigs.sd, ...guideConfigs.sc]) {
    add(c.sup);
    add(c.gui);
  }
  for (const w of sgFixed.widths) {
    for (const l of sgFixed.lengths) add({ code: `SG ${w} ${l}`, price: sgFixed.prices[`${w}-${l}`] });
  }
  return [...seen.values()];
}
