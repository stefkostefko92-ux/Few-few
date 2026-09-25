// hash.js — псевдослучаен CPU hash, огледален на GLSL hash21/hash22 в glsl-noise.js (същата
// fract/dot верига, БЕЗ тригонометрия — вижте бележката в glsl-noise.js защо sin() бе премахнат).
// Използва се за детерминистични тестове (същият seed → същото поле, независимо от GPU) и за
// разполагането на стъклените етикети на звездите-агенти (needsSeparation).
export function hash21(x, y) {
  let px = fractf(x * 123.34), py = fractf(y * 456.21);
  const d = px * px + px * py + py * py + 45.32 * px + 45.32 * py;
  px = fractf(px + d);
  py = fractf(py + d);
  return fractf(px * py);
}
export function hash22(x, y) {
  return [hash21(x, y), hash21(x + 19.19, y + 19.19)];
}
function fractf(v) {
  return v - Math.floor(v);
}

/** Детерминистичен PRNG (mulberry32) за CPU-генерирани полета (прах, метеори, HII клъстери). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Раздалечава етикети (кръгове с радиус r около {x,y}) с проста релаксация, за да не се
 * застъпват — детерминистично (същия вход → същия изход), спира до `iterations` или при сходимост.
 * items: [{x, y, r}] — мутира и връща новия масив от позиции (без да променя оригиналните обекти).
 */
export function separateLabels(items, iterations = 24, padding = 4) {
  const pts = items.map((it) => ({ x: it.x, y: it.y, r: it.r }));
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.r + b.r + padding;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return pts;
}
