// Формата на семе от канабис и как се променя, когато се разваля. Чиста математика, без three:
// от точка на единичната сфера (дългата ос е x) до точка на семето. Тества се в Node.
//
// Свежото семе е яйцевидно, сплеснато отстрани, с по-остър връх и лек ръб (шев) по контура.
// Колкото по-развалено, толкова повече се свива, сплесква и набръчква; изтеклото е сбръчкано.
import { fbm3, smoothstep } from './noise.js';

// Полуосите в единици на сцената: дължина 2 (x), дебелина (y — нагоре, лежи на масата), ширина (z),
// плюс колко се стеснява към върха. Видът ги дава (strains.ts); тук е подразбирането.
export interface SeedAxes {
  x: number;
  y: number;
  z: number;
  taper: number;
}

export const DEFAULT_AXES: SeedAxes = { x: 1, y: 0.6, z: 0.76, taper: 0.32 };

export interface ShapeParams {
  decay: number; // 0 — свежо, 1 — напълно развалено
  dead: boolean;
  variant: number; // различно зрънце за всяко семе
  axes?: SeedAxes;
}

/** Колко се е свило семето (множител за размера). */
export function shrinkOf(p: ShapeParams): number {
  return 1 - 0.1 * p.decay - (p.dead ? 0.05 : 0);
}

/** Амплитудата на бръчките: нула до „остарява“, расте към гниене. */
export function wrinkleOf(p: ShapeParams): number {
  return 0.07 * smoothstep(0.35, 1, p.decay) + (p.dead ? 0.03 : 0);
}

/** Точка (x, y, z) от единичната сфера → точка на семето. */
export function seedPoint(
  x: number,
  y: number,
  z: number,
  p: ShapeParams,
): [number, number, number] {
  // яйце: към върха (x > 0) се стеснява, отзад е заоблено
  const a = p.axes ?? DEFAULT_AXES;
  const taper = x > 0 ? 1 - a.taper * x * x : 1 + 0.04 * x;
  let X = x * a.x;
  let Y = y * a.y * taper;
  let Z = z * a.z * taper;
  // шевът: лек ръб по контура (там, където дебелината е нула)
  const ridge = 1 + 0.045 * Math.exp(-((y / 0.16) ** 2));
  X *= x < 0.97 ? ridge : 1;
  Z *= ridge;
  // разваляне: свиване, сплескване, бръчки по нормалата (≈ посоката на точката)
  const s = shrinkOf(p);
  Y *= 1 - 0.2 * p.decay;
  const w = wrinkleOf(p);
  if (w > 0) {
    // широки вдлъбнатини + по-ситни бръчки по дължината, изкривени от шума (не правилни вълни)
    const n = fbm3(x * 2.2 + p.variant, y * 2.2, z * 2.2, 7 + p.variant, 3) - 0.5;
    const fine = fbm3(x * 7 + n * 3, y * 7, z * 7, 13 + p.variant, 2) - 0.5;
    const k = 1 + w * (n * 1.8 + fine * 0.9 * smoothstep(0.6, 1, p.decay));
    X *= k;
    Y *= k;
    Z *= k;
  }
  return [X * s, Y * s, Z * s];
}
