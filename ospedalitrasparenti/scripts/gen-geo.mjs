import { readFileSync, writeFileSync } from 'node:fs';
const g = JSON.parse(readFileSync('italia-reg.geojson', 'utf8'));
const [lonMin, latMin, lonMax, latMax] = g.bbox;
const latMid = (latMin + latMax) / 2;
const kx = Math.cos((latMid * Math.PI) / 180); // корекция за дължина
const W = 1000;
const scale = W / ((lonMax - lonMin) * kx);
const H = Math.round((latMax - latMin) * scale);
const px = (lon) => (lon - lonMin) * kx * scale;
const py = (lat) => (latMax - lat) * scale;

// Douglas–Peucker опростяване (в проектирани пиксели)
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      const t = ((x - ax) * dx + (y - ay) * dy) / len2;
      const projx = ax + t * dx, projy = ay + t * dy;
      const d = (x - projx) ** 2 + (y - projy) ** 2;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > tol * tol && idx > -1) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const TOL = 1.1;             // опростяване (px)
const MIN_RING_AREA = 6;     // px² — под този праг ринговете (островчета) се хвърлят

function ringToPath(ring) {
  let pts = ring.map(([lon, lat]) => [px(lon), py(lat)]);
  // площ (за да отсеем миниатюрни островчета)
  let area = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  if (Math.abs(area / 2) < MIN_RING_AREA) return null;
  pts = dp(pts, TOL);
  if (pts.length < 3) return null;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return d + 'Z';
}

function geomToPath(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const parts = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const p = ringToPath(ring);
      if (p) parts.push(p);
    }
  }
  return parts.join('');
}

const REG = {};
for (const f of g.features) {
  REG[f.properties.reg_istat_code] = geomToPath(f.geometry);
}
const out =
  `// Граници на италианските региони (ISTAT — „Confini delle unità amministrative\n` +
  `// a fini statistici", лиценз CC BY 4.0). Проектирани (equirectangular с корекция\n` +
  `// по ширина) и опростени (Douglas–Peucker) за inline SVG. Генериран асет.\n` +
  `export const VIEWBOX = '0 0 ${W} ${H}';\n` +
  `export const REGIONI_GEO = ${JSON.stringify(REG)};\n`;
writeFileSync('italia-geo.js', out);
console.log(`viewBox 0 0 ${W} ${H}; регион пътища: ${Object.keys(REG).length}; размер ${(out.length/1024).toFixed(1)} KB`);
