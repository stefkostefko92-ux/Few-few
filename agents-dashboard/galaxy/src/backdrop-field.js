// backdrop-field.js — детерминистично генерирани полета (фин звезден прах, амбиентни мъглявини) за
// 2D фоновия слой. Чист JS (mulberry32 seed) → тестваем без canvas/GPU.
import { mulberry32 } from "./hash.js";

export function buildDustField(seed = 1, count = 320) {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    nx: rand() * 2 - 1,
    ny: rand() * 2 - 1,
    d: 0.25 + rand() * 0.9,
    r: 0.4 + rand() * 1.6,
    ph: rand() * 6.28,
    tw: 1.3 + rand() * 2.5,
    warm: rand() < 0.22,
  }));
}

// Амбиентни цветни мъглявини (лека фонова окраска — синьо-виолетово-тюркоазено-розово, в тон
// с blackbody/HII/емисионната палитра на WebGL слоя, не произволни хекс стойности).
export function buildAmbientNebulae() {
  return [
    { nx: -0.42, ny: -0.3, r: 0.52, c: "#3a2b6e", ph: 0 },
    { nx: 0.48, ny: 0.1, r: 0.6, c: "#0e3b52", ph: 1.7 },
    { nx: 0.06, ny: 0.46, r: 0.46, c: "#5a2450", ph: 3.3 },
    { nx: -0.3, ny: 0.36, r: 0.42, c: "#123f39", ph: 4.9 },
  ];
}
