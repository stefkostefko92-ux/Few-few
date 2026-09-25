#!/usr/bin/env node
// tools/print/printability.mjs — проверка за печатаемост на STL за Creality K2 Plus (Принтаджията v2.0).
//
// Употреба:
//   node tools/print/printability.mjs model.stl
//
// Чете binary STL (или открива ASCII и казва) и докладва:
//   bounding box vs обема 350×350×350 mm, единици (флагва вероятно cm/inch/m),
//   брой триъгълници, watertight (гранични/non-manifold ръбове), изродени триъгълници,
//   предложена ориентация. Exit 1 при критично (non-manifold/над обема). Без външни зависимости.

import { readFileSync } from "node:fs";

const BED = { x: 350, y: 350, z: 350 }; // K2 Plus (Z маркетинг 350; Orca профил понякога 360)
const file = process.argv[2];
if (!file) { console.error("Употреба: node tools/print/printability.mjs <model.stl>"); process.exit(2); }

let buf;
try { buf = readFileSync(file); } catch (e) { console.error("Не мога да чета файла:", e.message); process.exit(2); }

// ASCII STL? (започва със "solid" и съдържа "facet")
const head = buf.slice(0, 256).toString("latin1").toLowerCase();
if (head.startsWith("solid") && buf.slice(0, 1024).toString("latin1").includes("facet")) {
  console.log("⚠ Изглежда ASCII STL. Този инструмент чете binary STL — преекспортирай като binary (по-малък, по-надежден).");
  process.exit(2);
}

if (buf.length < 84) { console.error("Файлът е твърде малък за валиден binary STL."); process.exit(2); }
const triCount = buf.readUInt32LE(80);
const expected = 84 + triCount * 50;
if (buf.length < expected) {
  console.error(`Повреден binary STL: декларира ${triCount} триъгълника (${expected} байта), а файлът е ${buf.length}.`);
  process.exit(2);
}

let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let degenerate = 0;
const edges = new Map(); // ключ -> брой
const Q = 1e4; // квантоване (0.1 µm) за съвпадане на върхове
const vkey = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
const ekey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

let off = 84;
for (let t = 0; t < triCount; t++) {
  const p = off + 12; // пропусни нормалата
  const v = [];
  for (let i = 0; i < 3; i++) {
    const x = buf.readFloatLE(p + i * 12), y = buf.readFloatLE(p + i * 12 + 4), z = buf.readFloatLE(p + i * 12 + 8);
    v.push([x, y, z]);
    for (let k = 0; k < 3; k++) { const c = [x, y, z][k]; if (c < min[k]) min[k] = c; if (c > max[k]) max[k] = c; }
  }
  // изродена площ?
  const ux = v[1][0]-v[0][0], uy = v[1][1]-v[0][1], uz = v[1][2]-v[0][2];
  const wx = v[2][0]-v[0][0], wy = v[2][1]-v[0][1], wz = v[2][2]-v[0][2];
  const cx = uy*wz-uz*wy, cy = uz*wx-ux*wz, cz = ux*wy-uy*wx;
  if (Math.sqrt(cx*cx+cy*cy+cz*cz) < 1e-9) degenerate++;
  // ръбове
  const k = [vkey(...v[0]), vkey(...v[1]), vkey(...v[2])];
  for (const [a, b] of [[k[0],k[1]],[k[1],k[2]],[k[2],k[0]]]) {
    const e = ekey(a, b); edges.set(e, (edges.get(e) || 0) + 1);
  }
  off += 50;
}

let boundary = 0, nonManifold = 0;
for (const c of edges.values()) { if (c === 1) boundary++; else if (c > 2) nonManifold++; }

const dim = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];
const fits = dim[0] <= BED.x && dim[1] <= BED.y && dim[2] <= BED.z;
const tallestAxis = ["X","Y","Z"][dim.indexOf(Math.max(...dim))];
const tiny = Math.max(...dim) < 1; // вероятно грешни единици (m/inch обявени като mm?)

const f2 = (n) => n.toFixed(2);
console.log(`Файл: ${file}`);
console.log(`Триъгълници: ${triCount}`);
console.log(`Размери (mm): ${f2(dim[0])} × ${f2(dim[1])} × ${f2(dim[2])}  [обем K2 Plus ${BED.x}×${BED.y}×${BED.z}]`);
console.log(`Побира се в леглото: ${fits ? "ДА" : "НЕ ❌"}`);
console.log(`Watertight (затворена обвивка): ${boundary === 0 && nonManifold === 0 ? "ДА" : "НЕ ❌"}  (гранични ръбове: ${boundary}, non-manifold: ${nonManifold})`);
console.log(`Изродени триъгълници: ${degenerate}`);
console.log(`Най-висока ос: ${tallestAxis} — ориентирай товара в равнината (XY е по-силно от Z).`);

const problems = [];
if (!fits) problems.push("моделът НЕ се побира в обема — мащабирай или раздели");
if (boundary > 0 || nonManifold > 0) problems.push("мрежата НЕ е watertight/manifold — поправи (Blender/MeshLab/slicer repair) преди слайс");
if (tiny) problems.push("всички размери < 1 mm — вероятно грешни единици (модел в m/inch?); потвърди mm");
if (degenerate > 0) problems.push(`${degenerate} изродени триъгълника — почисти мрежата`);

if (!problems.length) { console.log("\n✅ Базовата печатаемост е наред (геометрия). Толерансите се доказват с тест-печат."); process.exit(0); }
console.log("\nПроблеми:");
for (const p of problems) console.log(" • " + p);
const critical = !fits || boundary > 0 || nonManifold > 0;
process.exit(critical ? 1 : 0);
