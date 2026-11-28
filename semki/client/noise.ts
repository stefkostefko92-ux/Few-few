// Детерминистичен шум за семената: стойностен шум в 3D и fBm. Без three — тества се в Node.
// Същото зрънце дава същата шарка при всяко зареждане.

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441)) | 0;
  h = (h + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const fade = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Стойностен шум в [0, 1] — гладък, с решетка на цели числа. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = fade(x - xi);
  const ty = fade(y - yi);
  const tz = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), tx), lerp(c(0, 1, 0), c(1, 1, 0), tx), ty),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), tx), lerp(c(0, 1, 1), c(1, 1, 1), tx), ty),
    tz,
  );
}

/** Фрактален шум (няколко октави), нормиран обратно в [0, 1]. */
export function fbm3(x: number, y: number, z: number, seed = 0, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Безшевен шум за повърхността на семето: u обикаля около дългата ос (0..1, краищата се срещат),
 * v е по дължината (0..1). Взима се от цилиндър, затова u = 0 и u = 1 дават една и съща стойност.
 */
export function wrapFbm(
  u: number,
  v: number,
  scaleU: number,
  scaleV: number,
  seed: number,
  octaves = 4,
): number {
  const a = u * Math.PI * 2;
  return fbm3(Math.cos(a) * scaleU, Math.sin(a) * scaleU, v * scaleV, seed, octaves);
}
