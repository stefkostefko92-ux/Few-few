#!/usr/bin/env node
/**
 * Генератор на картата на света.
 *
 * Вход:  Natural Earth 110m admin-0 (GeoJSON) — ОБЩЕСТВЕНО ДОСТОЯНИЕ
 *        (https://www.naturalearthdata.com/about/terms-of-use/), затова няма
 *        нито лицензен, нито приватностен проблем: картата се рисува от нашия
 *        сървър, без нито една заявка към чужд доставчик на плочки.
 * Изход: `src/lib/world-map.generated.ts` — пътища в равноъгълна проекция
 *        1000×500 плюс центроид и обхват на всяка държава.
 *
 * Употреба:
 *   node scripts/build-map.mjs <път-до-ne_110m_admin_0_countries.geojson>
 *
 * Не редактирай генерирания файл на ръка — пусни скрипта наново.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "lib", "world-map.generated.ts");
/**
 * Силуетът на света е ЕДИН И СЪЩ на всяка страница, затова излиза като
 * отделен статичен файл и се ползва като CSS маска: браузърът го сваля веднъж
 * и го кешира, а цветът идва от темата (при `<img>` външният CSS не стига).
 * Така в самия HTML влиза само пътят на ЕДНА държава, а не 125 KB.
 */
const MASK_OUT = join(HERE, "..", "public", "world-mask.svg");

const WIDTH = 1000;
const HEIGHT = 500;
/** Закръгляне в единици на проекцията. 0.6 ≈ 0.2° ≈ 22 km — стига за локатор. */
const QUANTUM = 0.6;
/** Пръстени под този периметър са островчета, невидими при тази големина. */
const MIN_RING_EXTENT = 2.5;

/** Равноъгълна проекция: най-простата, и единствената, при която мащабът е линеен. */
function project([lon, lat]) {
  return [((lon + 180) / 360) * WIDTH, ((90 - lat) / 180) * HEIGHT];
}

function snap(value) {
  return Math.round(value / QUANTUM) * QUANTUM;
}

/** Площ и центроид на пръстен по формулата за многоъгълник (в проекцията). */
function ringStats(points) {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (twiceArea === 0) return { area: 0, centroid: points[0] ?? [0, 0] };
  return { area: Math.abs(twiceArea / 2), centroid: [cx / (3 * twiceArea), cy / (3 * twiceArea)] };
}

function ringExtent(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

/** Проектира, закръгля и маха последователните дубли. */
function prepareRing(coordinates) {
  const points = [];
  for (const coordinate of coordinates) {
    const [x, y] = project(coordinate);
    const point = [snap(x), snap(y)];
    const previous = points[points.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    points.push(point);
  }
  // Затвореният контур не се нуждае от повторена последна точка — `Z` я връща.
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) points.pop();
  return points;
}

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function toPath(rings) {
  const parts = [];
  for (const ring of rings) {
    const [start, ...rest] = ring;
    parts.push(`M${fmt(start[0])} ${fmt(start[1])}`);
    for (const [x, y] of rest) parts.push(`L${fmt(x)} ${fmt(y)}`);
    parts.push("Z");
  }
  return parts.join("");
}

function fmt(value) {
  // Едно знакче след запетаята е достатъчно при квант 0.6 и спестява байтове.
  return Number(value.toFixed(1)).toString();
}

// ── Същинската работа ─────────────────────────────────────────────────────

const source = process.argv[2];
if (!source) {
  console.error("Употреба: node scripts/build-map.mjs <ne_110m_admin_0_countries.geojson>");
  process.exit(2);
}

const collection = JSON.parse(readFileSync(source, "utf8"));
const countries = new Map();

for (const feature of collection.features ?? []) {
  const properties = feature.properties ?? {};
  const code = String(
    properties.ISO_A2_EH ?? properties.ISO_A2 ?? properties.WB_A2 ?? "",
  ).toUpperCase();
  if (!code || code === "-99" || code.length !== 2) continue;

  const rings = [];
  let biggest = { area: 0, centroid: [0, 0] };

  for (const polygon of polygonsOf(feature.geometry)) {
    for (let index = 0; index < polygon.length; index++) {
      const ring = prepareRing(polygon[index]);
      if (ring.length < 3) continue;
      if (ringExtent(ring) < MIN_RING_EXTENT) continue;
      rings.push(ring);
      // Центроидът се взима от НАЙ-ГОЛЯМАТА външна част: иначе отвъдморските
      // територии дърпат точката на Франция насред Атлантика.
      if (index === 0) {
        const stats = ringStats(ring);
        if (stats.area > biggest.area) biggest = stats;
      }
    }
  }

  if (rings.length === 0) continue;

  const existing = countries.get(code);
  const entry = existing ?? { code, name: String(properties.NAME ?? code), rings: [], biggest };
  entry.rings.push(...rings);
  if (biggest.area > entry.biggest.area) entry.biggest = biggest;
  countries.set(code, entry);
}

const rows = [...countries.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((entry) => {
    const [cx, cy] = entry.biggest.centroid;
    // Обратна проекция на центроида — за да покажем и градуси, не само пиксели.
    const lon = (cx / WIDTH) * 360 - 180;
    const lat = 90 - (cy / HEIGHT) * 180;
    return (
      `  { code: ${JSON.stringify(entry.code)}, name: ${JSON.stringify(entry.name)}, ` +
      `cx: ${fmt(cx)}, cy: ${fmt(cy)}, lon: ${lon.toFixed(2)}, lat: ${lat.toFixed(2)}, ` +
      `d: ${JSON.stringify(toPath(entry.rings))} }`
    );
  });

const output = `// ГЕНЕРИРАН ФАЙЛ — не го редактирай на ръка.
// Източник: Natural Earth 110m admin-0 (обществено достояние).
// Пресъздаване: node scripts/build-map.mjs <ne_110m_admin_0_countries.geojson>
//
// Проекция: равноъгълна, ${WIDTH}×${HEIGHT}. Координатите са закръглени до
// ${QUANTUM} единици (≈ 22 km) — стига за локатор на света и пести байтове.

export interface CountryShape {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Английско име от източника (за подсказка, не за интерфейса). */
  name: string;
  /** Центроид на най-голямата част, в координати на проекцията. */
  cx: number;
  cy: number;
  /** Същият център в градуси. */
  lon: number;
  lat: number;
  /** SVG път на всички части. */
  d: string;
}

export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${HEIGHT};

export const COUNTRIES: readonly CountryShape[] = [
${rows.join(",\n")},
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function countryShape(code: string): CountryShape | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}
`;

writeFileSync(OUT, output);

const maskPaths = [...countries.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((entry) => toPath(entry.rings))
  .join("");
const mask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}"><title>Силует на континентите</title><path fill="#000" fill-rule="evenodd" d="${maskPaths}"/></svg>\n`;
writeFileSync(MASK_OUT, mask);

console.log(
  `Записан ${OUT}: ${countries.size} държави, ${(output.length / 1024).toFixed(1)} KB (само за сървъра)\n` +
    `Записан ${MASK_OUT}: ${(mask.length / 1024).toFixed(1)} KB (статичен, кешира се)`,
);
