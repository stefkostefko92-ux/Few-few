// Видовете семена се различават на вид — като в истински семенен каталог. Формата (дълго и тънко или
// закръглено), основният цвят и шарката (тигрови ивици, петна като на леопард, ситни точици) са на вида;
// развалянето (seed-textures.ts, seed-shape.ts) се добавя отгоре еднакво за всички.
//   Amnesia — дълго и тънко, светло бежово-сиво, тънки гъсти ивици.
//   AK      — средно, топло кафяво, широки контрастни тигрови ивици.
//   OG Kush — закръглено и пълно, сиво-маслинено, тъмни петна.
//   Purple  — средно, сливово-лилав оттенък, тъмнолилави ивици.
//   Skunk   — по-дребно и заострено, бледо сиво, гъсти черни точици.

export type RGB = [number, number, number];

export interface Strain {
  // полуосите: дължина (x), дебелина (y), ширина (z) и колко се стеснява към върха
  axes: { x: number; y: number; z: number; taper: number };
  light: RGB;
  grey: RGB;
  stripe: RGB;
  dark: RGB;
  // шарката: мащаб около оста (u) и по дължината (v) — по-малко v = по-дълги ивици
  stripeU: number;
  stripeV: number;
  stripeFrom: number; // от колко нагоре шумът е ивица
  darkFrom: number; // от колко нагоре е тъмното ядро на ивицата
  speckleFrom: number; // от колко нагоре са точиците
  speckle: number; // колко са тъмни точиците (0..1)
  seed: number; // шумът на вида — различна шарка
}

export const STRAINS: Readonly<Record<string, Strain>> = {
  amnesia: {
    axes: { x: 1, y: 0.54, z: 0.66, taper: 0.36 },
    light: [198, 184, 156],
    grey: [156, 148, 130],
    stripe: [104, 80, 58],
    dark: [58, 42, 30],
    stripeU: 4.2,
    stripeV: 0.75,
    stripeFrom: 0.5,
    darkFrom: 0.61,
    speckleFrom: 0.72,
    speckle: 0.5,
    seed: 101,
  },
  ak: {
    axes: { x: 1, y: 0.63, z: 0.8, taper: 0.28 },
    light: [174, 144, 106],
    grey: [134, 108, 80],
    stripe: [74, 50, 32],
    dark: [38, 25, 16],
    stripeU: 2.0,
    stripeV: 1.15,
    stripeFrom: 0.47,
    darkFrom: 0.58,
    speckleFrom: 0.7,
    speckle: 0.6,
    seed: 202,
  },
  ogkush: {
    axes: { x: 1, y: 0.7, z: 0.86, taper: 0.22 },
    light: [146, 143, 120],
    grey: [110, 108, 90],
    stripe: [64, 58, 44],
    dark: [34, 31, 24],
    stripeU: 4.2,
    stripeV: 4.2, // без посока — петна, не ивици
    stripeFrom: 0.6,
    darkFrom: 0.67,
    speckleFrom: 0.64,
    speckle: 0.75,
    seed: 303,
  },
  purple: {
    axes: { x: 1, y: 0.6, z: 0.76, taper: 0.3 },
    light: [138, 116, 128],
    grey: [104, 86, 100],
    stripe: [68, 42, 62],
    dark: [36, 20, 34],
    stripeU: 2.6,
    stripeV: 1.0,
    stripeFrom: 0.5,
    darkFrom: 0.62,
    speckleFrom: 0.7,
    speckle: 0.6,
    seed: 404,
  },
  skunk: {
    axes: { x: 1, y: 0.56, z: 0.72, taper: 0.42 },
    light: [188, 186, 174],
    grey: [148, 146, 136],
    stripe: [96, 92, 84],
    dark: [30, 28, 26],
    stripeU: 3.0,
    stripeV: 1.4,
    stripeFrom: 0.6,
    darkFrom: 0.72,
    speckleFrom: 0.58,
    speckle: 0.95,
    seed: 505,
  },
};

export function strainOf(key: string): Strain {
  return STRAINS[key] ?? (STRAINS.amnesia as Strain);
}
