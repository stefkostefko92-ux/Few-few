/**
 * Дефиниция на света на Nexus Dominion — ЕДИН източник на истина за:
 *   - процедурния терен (macro пас),
 *   - позициите на 21-те региона (пиновете се проектират от тях),
 *   - камерите на кадрите на регионите.
 *
 * Координати: карта 160 x 90 единици (16:9). u,v са в 0..1 (v расте на юг);
 * x = u*160, z = v*90, y нагоре. Морското равнище е y = 0.
 *
 * ВАЖНО: slug-овете трябва да съвпадат със server/src/game/regions.ts
 * (REGION_ORDER). Редът тук е редът на нивата.
 */

export const WORLD = { w: 160, h: 90, seed: 1337 };

// Параметри на биома. Всеки регион ги подава към macro пас-а, който ги
// смесва с тегла по разстояние (меки граници между биомите).
//   hOff  базова кота над морето     mtn   амплитуда на планините (ridged/ерозия)
//   rough финен релеф                forest гора/иглолистна покривка
//   snow ash lava crystal violet urban salt ice cyan  — материали/светлини
//   fog  плътност на мъглата         moist влажност (мъх, мокри скали, реки)
//   feat специална форма: 1 вулкан 2 бездна 3 кратер 4 цепнатина 5 проход 6 плато
//   fr   радиус на формата, fa височина/дълбочина на формата, fh кота на платото
const B = (o) => ({
  hOff: 1, mtn: 0.2, rough: 0.4, forest: 0, snow: 0, ash: 0, lava: 0, crystal: 0,
  violet: 0, urban: 0, salt: 0, ice: 0, cyan: 0, fog: 0.3, moist: 0.4,
  feat: 0, fr: 5, fa: 0, fh: 0, ...o,
});

export const REGIONS = [
  { slug: 'whispering_woods', st: [10,1.0,200,0,0,2.4], level: '1-5', minLevel: 1, stamp: 'I', color: '#6ad8a4',
    a: [0.150, 0.740], R: 10, land: 12.5,
    ...B({ hOff: 0.7, mtn: 0.08, rough: 0.3, forest: 1, moist: 0.8, fog: 0.5, cyan: 0.12 }) },
  { slug: 'mistmoor_hills', st: [11,1.0,20,0,0,2.4], level: '6-9', minLevel: 6, stamp: 'II', color: '#9ad9ff',
    a: [0.275, 0.620], R: 10, land: 12.5,
    ...B({ hOff: 1.7, mtn: 0.28, rough: 0.5, forest: 0.12, moist: 1, fog: 1.0 }) },
  { slug: 'crystal_caverns', st: [19,1.0,0,0,0,2.4], level: '10-14', minLevel: 10, stamp: 'III', color: '#6aa7ff',
    a: [0.365, 0.775], R: 9, land: 12.5,
    ...B({ hOff: 2.0, mtn: 0.65, rough: 0.9, crystal: 1, cyan: 0.9, fog: 0.35, moist: 0.3 }) },
  { slug: 'ashen_wastes', st: [12,1.0,10,0,0,3.6], level: '15-23', minLevel: 15, stamp: 'IV', color: '#ff7c4d',
    a: [0.490, 0.705], R: 10, land: 12.5,
    ...B({ hOff: 0.5, mtn: 0.12, rough: 0.45, ash: 1, lava: 0.18, fog: 0.5, moist: 0.05 }) },
  { slug: 'shadowfell', st: [13,1.0,30,0,0,3.0], level: '24-25', minLevel: 24, stamp: 'V', color: '#c294ff',
    a: [0.610, 0.785], R: 9, land: 12.5,
    ...B({ hOff: 0.9, mtn: 0.3, rough: 0.6, violet: 1, forest: 0.35, fog: 0.85, moist: 0.5 }) },
  { slug: 'emberreach', st: [21,1.0,0,0,0,3.4], level: '26-49', minLevel: 26, stamp: 'VI', color: '#ff7c4d',
    a: [0.735, 0.670], R: 10, land: 12.5,
    ...B({ hOff: 1.6, mtn: 0.8, rough: 0.95, lava: 1, ash: 0.45, fog: 0.22, moist: 0.0 }) },
  { slug: 'hammerhand_pass', st: [7,1.0,0,0,0,3.0], level: '50-74', minLevel: 50, stamp: 'VII', color: '#d6a13d',
    a: [0.785, 0.500], R: 8, land: 12.5,
    ...B({ hOff: 2.4, mtn: 1.2, rough: 0.9, urban: 0.35, snow: 0.25, fog: 0.4, feat: 5, fr: 4.5, fa: 3.5 }) },
  { slug: 'conclave_aedric', st: [2,1.0,0,0,0,4.4], level: '75-104', minLevel: 75, stamp: 'VIII', color: '#b9a6ff',
    a: [0.650, 0.520], R: 8, land: 12.5,
    ...B({ hOff: 1.8, mtn: 0.3, rough: 0.4, urban: 1, cyan: 0.85, forest: 0.18, fog: 0.5, feat: 6, fr: 5, fh: 2.0 }) },
  { slug: 'saltmarsh', st: [9,1.0,0,0,0,0], level: '105-139', minLevel: 105, stamp: 'IX', color: '#5dd4d0',
    a: [0.210, 0.480], R: 10, land: 12.5,
    ...B({ hOff: 0.12, mtn: 0.0, rough: 0.12, salt: 1, moist: 1, fog: 0.75, cyan: 0.15 }) },
  { slug: 'frostvale', st: [18,1.0,0,0,0,2.2], level: '140-174', minLevel: 140, stamp: 'X', color: '#a8e6ff',
    a: [0.300, 0.360], R: 10, land: 12.5,
    ...B({ hOff: 2.4, mtn: 0.65, rough: 0.7, snow: 0.85, ice: 1, forest: 0.3, cyan: 0.4, fog: 0.55 }) },
  { slug: 'black_spire', st: [3,1.0,0,0,0,3.0], level: '175-200', minLevel: 175, stamp: 'XI', color: '#e0863d',
    a: [0.470, 0.500], R: 8, land: 12.5,
    ...B({ hOff: 2.2, mtn: 0.6, rough: 0.8, lava: 0.6, ash: 0.6, urban: 0.3, fog: 0.4, feat: 1, fr: 6, fa: 4.0 }) },
  { slug: 'stormpeaks', st: [22,1.0,0,0,0,1.6], level: '201-230', minLevel: 201, stamp: 'XII', color: '#b9d8ff',
    a: [0.600, 0.345], R: 9, land: 12.5,
    ...B({ hOff: 2.6, mtn: 1.5, rough: 1.05, snow: 0.9, cyan: 0.25, fog: 0.75 }) },
  { slug: 'voidshade_hollow', st: [14,1.0,0,0,0,0], level: '231-260', minLevel: 231, stamp: 'XIII', color: '#8b6cff',
    a: [0.760, 0.335], R: 9, land: 12.5,
    ...B({ hOff: 1.2, mtn: 0.35, rough: 0.6, violet: 0.95, fog: 0.95, feat: 2, fr: 4.2, fa: 6.5 }) },
  { slug: 'mooncradle', st: [8,1.0,0,0,3.2,3.6], level: '261-290', minLevel: 261, stamp: 'XIV', color: '#c294ff',
    a: [0.415, 0.275], R: 9, land: 12.5,
    ...B({ hOff: 2.6, mtn: 0.75, rough: 0.7, snow: 0.3, cyan: 0.6, fog: 0.6, feat: 4, fr: 5, fa: 3.0 }) },
  { slug: 'worldspine', st: [15,1.0,0,0,0,1.2], level: '291-320', minLevel: 291, stamp: 'XV', color: '#ff5a4d',
    a: [0.140, 0.355], b: [0.245, 0.180], R: 8, land: 11.5,
    ...B({ hOff: 3.0, mtn: 1.8, rough: 1.15, snow: 0.55, fog: 0.5 }) },
  { slug: 'eternal_throne', st: [1,1.0,0,0,0,4.6], level: '321-350', minLevel: 321, stamp: 'XVI', color: '#ffd34d',
    a: [0.525, 0.155], R: 9, land: 12.5,
    ...B({ hOff: 3.6, mtn: 0.5, rough: 0.5, urban: 1, cyan: 1, fog: 0.65, feat: 6, fr: 6.5, fh: 3.8 }) },
  // „Отвъд Края“ (351-500): острови отвъд морето
  { slug: 'ashen_veil', st: [17,1.0,0,0,0,3.4], level: '351-380', minLevel: 351, stamp: 'XVII', color: '#9aa0ad',
    a: [0.050, 0.155], R: 8, land: 8,
    ...B({ hOff: 0.9, mtn: 0.25, rough: 0.5, ash: 1, violet: 0.25, fog: 1.2, moist: 0.2 }) },
  { slug: 'starfall_abyss', st: [16,1.0,0,0,0,0], level: '381-410', minLevel: 381, stamp: 'XVIII', color: '#6a8dff',
    a: [0.285, 0.070], R: 8, land: 8.2,
    ...B({ hOff: 0.8, mtn: 0.3, rough: 0.5, crystal: 0.55, violet: 0.4, cyan: 0.85, fog: 0.7, feat: 3, fr: 4.5, fa: 3.0 }) },
  { slug: 'forge_of_dawn', st: [6,1.0,0,0,0,4.2], level: '411-440', minLevel: 411, stamp: 'XIX', color: '#ffb84d',
    a: [0.900, 0.140], R: 8, land: 8.2,
    ...B({ hOff: 1.8, mtn: 0.6, rough: 0.8, lava: 0.95, urban: 0.7, ash: 0.3, fog: 0.35 }) },
  { slug: 'crown_of_night', st: [4,1.0,0,0,0,3.4], level: '441-470', minLevel: 441, stamp: 'XX', color: '#5b4dff',
    a: [0.925, 0.585], R: 8, land: 8.5,
    ...B({ hOff: 2.2, mtn: 0.9, rough: 0.8, violet: 1, urban: 0.7, fog: 0.8 }) },
  { slug: 'first_light', st: [5,1.0,0,0,0,3.2], level: '471-500', minLevel: 471, stamp: 'XXI', color: '#fff1b8',
    a: [0.865, 0.895], R: 8, land: 8.2,
    ...B({ hOff: 2.0, mtn: 0.5, rough: 0.5, snow: 0.55, cyan: 0.25, urban: 0.5, fog: 0.4, feat: 6, fr: 3.6, fh: 2.9 }) },
];

// Безименни земи — само за да не е морето празно (нямат регион/пин).
export const DECOR = [
  { a: [0.035, 0.900], land: 7 },
  { a: [0.500, 0.975], land: 7.5 },
  { a: [0.975, 0.360], land: 6 },
  { a: [0.700, 0.050], land: 6 },
];

/** Позиция на структурата (свят) за региона: [x, z, type, scale, rotRad, padRadius]. */
export function structOf(r) {
  if (!r.st) return null;
  const [type, scale, rotDeg, dx, dz, pad] = r.st;
  const [ax, az] = anchor(r);
  return { x: ax + dx, z: az + dz, type, scale, rot: (rotDeg * Math.PI) / 180, pad, slug: r.slug };
}

/** Световни координати на котвата на региона (среда на сегмента). */
export function anchor(r) {
  const b = r.b || r.a;
  return [((r.a[0] + b[0]) / 2) * WORLD.w, ((r.a[1] + b[1]) / 2) * WORLD.h];
}

// Камера на картата: поглед от юг към север, високо и наклонено.
export const MAP_CAM = {
  pos: [80, 104, 106], target: [80, 0, 53], fov: 40,
};
