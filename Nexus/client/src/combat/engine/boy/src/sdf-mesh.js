// 4b кръг 3 (Nexus порт, НЕ част от оригиналния boy) — SDF примитиви + naive surface nets, за
// да построим ИСТИНСКА имплицитна повърхност (не сплайн-профил лято тяло, виж beast-torso.js в
// кръг 2 — прегледът го отхвърли, тялото все още четеше "капсула с глава"). Портирано от
// координаторския spike (`spike/sdf.js`, доказан на вълк — `spike-wolf.png`), само с BG
// коментари; математиката е непроменена (IQ roundCone/ellipsoid/smin, surface nets). Строи се
// ВЕДНЪЖ при зареждане на вид (виж sdf-skin.js) — не всеки кадър.
import * as THREE from 'three';

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export function ellipsoid(c, r) {
  return (p) => {
    const x = (p.x - c.x) / r.x, y = (p.y - c.y) / r.y, z = (p.z - c.z) / r.z;
    const k0 = Math.hypot(x, y, z);
    const k1 = Math.hypot(x / r.x, y / r.y, z / r.z);
    return k1 === 0 ? -Math.min(r.x, r.y, r.z) : (k0 * (k0 - 1)) / k1;
  };
}

// Конус със заоблени краища (IQ roundCone) между a и b, радиуси r1/r2.
export function cone(a, b, r1, r2) {
  const ba = new THREE.Vector3().subVectors(b, a);
  const l2 = ba.lengthSq() || 1e-9;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (p) => {
    tmp.subVectors(p, a);
    const y = tmp.dot(ba);
    const z = y - l2;
    tmp2.copy(tmp).multiplyScalar(l2).addScaledVector(ba, -y);
    const x2 = tmp2.lengthSq();
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
}

// Верига от заоблени конуси през точки с радиуси (крак/опашка/врат) — минимумът е сливане.
export function chain(points, radii) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) parts.push(cone(points[i], points[i + 1], radii[i], radii[i + 1]));
  return (p) => { let d = Infinity; for (const f of parts) d = Math.min(d, f(p)); return d; };
}

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Групи: [{ f, k }] — всяка част се слива с досегашния сбор с меко k (0 = твърдо обединение,
// полезно за остри части — бивни/шипове — прикачени към гладкото тяло без да го "издуват").
export function blend(parts) {
  return (p) => {
    let d = Infinity;
    for (const { f, k } of parts) d = d === Infinity ? f(p) : smin(d, f(p), k ?? 0.05);
    return d;
  };
}

// Naive surface nets: връх в клетка със смяна на знака (средно на пресичанията по ръбовете),
// квадрат на видимо лице между вътрешна/външна клетка. Нормали от централна разлика на SDF
// градиента (по-гладки от лицевите, важно при нисък cell/производителност компромис).
export function polygonize(sdf, min, max, cell) {
  const nx = Math.ceil((max.x - min.x) / cell) + 1;
  const ny = Math.ceil((max.y - min.y) / cell) + 1;
  const nz = Math.ceil((max.z - min.z) / cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  const p = new THREE.Vector3();
  const idx = (x, y, z) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    p.set(min.x + x * cell, min.y + y * cell, min.z + z * cell);
    field[idx(x, y, z)] = sdf(p);
  }
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [cx, cy, cz] = corners[c];
      val[c] = field[idx(x + cx, y + cy, z + cz)];
      if (val[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = val[a], vb = val[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    vid[idx(x, y, z)] = pos.length / 3;
    pos.push(min.x + (x + sx / n) * cell, min.y + (y + sy / n) * cell, min.z + (z + sz / n) * cell);
  }
  const index = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const inside = field[idx(x, y, z)] < 0;
    if (inside !== (field[idx(x + 1, y, z)] < 0)) quad(vid[idx(x, y - 1, z - 1)], vid[idx(x, y, z - 1)], vid[idx(x, y, z)], vid[idx(x, y - 1, z)], !inside);
    if (inside !== (field[idx(x, y + 1, z)] < 0)) quad(vid[idx(x - 1, y, z - 1)], vid[idx(x - 1, y, z)], vid[idx(x, y, z)], vid[idx(x, y, z - 1)], !inside);
    if (inside !== (field[idx(x, y, z + 1)] < 0)) quad(vid[idx(x - 1, y - 1, z)], vid[idx(x, y - 1, z)], vid[idx(x, y, z)], vid[idx(x - 1, y, z)], !inside);
  }
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(pos);
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(index);
  const N = new Float32Array(P.length);
  const e = cell * 0.5;
  const q = new THREE.Vector3();
  for (let i = 0; i < P.length; i += 3) {
    p.set(P[i], P[i + 1], P[i + 2]);
    const dx = sdf(q.set(p.x + e, p.y, p.z)) - sdf(q.set(p.x - e, p.y, p.z));
    const dy = sdf(q.set(p.x, p.y + e, p.z)) - sdf(q.set(p.x, p.y - e, p.z));
    const dz = sdf(q.set(p.x, p.y, p.z + e)) - sdf(q.set(p.x, p.y, p.z - e));
    const l = Math.hypot(dx, dy, dz) || 1;
    N[i] = dx / l; N[i + 1] = dy / l; N[i + 2] = dz / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}
