#!/usr/bin/env node
// devig.mjs — обезмаржване (маха overround на буки → честни вероятности). Прецизността зависи от метода:
// power универсално бие proportional (коригира favorite-longshot bias); Shin за insider-биас кросчек.
// Вход: масив от десетични коефициенти (напр. [2.10, 3.40, 3.60] за 1/X/2). Изход: вероятности, Σ=1.

// Проста (мултипликативна): дели implied на booksum. ОК за балансирани пазари; игнорира FL-bias.
export function proportional(odds) {
  const r = odds.map((o) => 1 / o);
  const B = r.reduce((a, b) => a + b, 0);
  return r.map((x) => x / B);
}

// Power: намери k>0 с Σ r_i^k = 1; p_i = r_i^k. Маха повече от аутсайдерите (FL-bias корекция).
export function power(odds) {
  const r = odds.map((o) => 1 / o);
  const f = (k) => r.reduce((s, x) => s + Math.pow(x, k), 0) - 1;
  // f(1) = overround-1 > 0; f расте k → −1. Монотонно намаляващо → бисекция.
  let lo = 0.2, hi = 8;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  const k = (lo + hi) / 2;
  const p = r.map((x) => Math.pow(x, k));
  const s = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / s); // числена нормализация за сигурност
}

// Shin (1993): извежда вероятностите при допускане за дял инсайдерски залози z. Бисекция по z∈[0,1).
export function shin(odds) {
  const r = odds.map((o) => 1 / o);
  const B = r.reduce((a, b) => a + b, 0);
  const pOf = (z) => r.map((x) => (Math.sqrt(z * z + 4 * (1 - z) * (x * x) / B) - z) / (2 * (1 - z)));
  const sumOf = (z) => pOf(z).reduce((a, b) => a + b, 0) - 1;
  // sum(0) = B/... ; при z→ покрай коренуване sum намалява. Бисекция за sum=1.
  let lo = 0, hi = 0.5;
  // разшири hi ако трябва
  if (sumOf(hi) > 0) hi = 0.99;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (sumOf(mid) > 0) lo = mid; else hi = mid;
  }
  const z = (lo + hi) / 2;
  const p = pOf(z);
  const s = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / s);
}

// Overround (маржът на буки) в проценти: Σ(1/o) − 1.
export function overround(odds) {
  return odds.reduce((s, o) => s + 1 / o, 0) - 1;
}

// Удобен избор по име (power = препоръчаната база).
export function devig(odds, method = "power") {
  if (method === "proportional") return proportional(odds);
  if (method === "shin") return shin(odds);
  return power(odds);
}
