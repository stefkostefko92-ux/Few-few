// A board as it comes off the edge bander: a box whose twelve edges are rounded with the radius of the band (raw and
// HDF edges almost sharp), smooth normals over the round, and six material groups in BoxGeometry order
// (+x, -x, +y, -y, +z, -z) so the faces, bands and raw edges keep their own materials. Sizes in metres.
import * as THREE from 'three';

const FACES = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
];

// Grid lines along one axis: the flat part is one span, each round gets `steps` segments on this face.
function lines(half, r, steps) {
  if (r <= 0) return [-half, half];
  const a = [];
  for (let i = 0; i <= steps; i++) a.push(-half + (r * i) / steps);
  for (let i = steps; i >= 0; i--) a.push(half - (r * i) / steps);
  return a;
}

// uvFor(axis, sign, position[3]) → [u, v] in metres; called for every vertex of the face (axis, sign).
// steps: segments per face over each round (2 for boards; more for big radii such as a mattress).
// faces: which of the six faces to build (indices in the order above); a part of the box gets no groups.
export function panelGeometry(size, radius, uvFor, steps = 2, faces = null) {
  const h = size.map((s) => s / 2);
  const r = Math.max(0, Math.min(radius, ...h.map((x) => x * 0.9)));
  const inner = h.map((x) => Math.max(0, x - r));
  const pos = [];
  const nor = [];
  const uv = [];
  const index = [];
  const geo = new THREE.BufferGeometry();
  let start = 0;
  FACES.forEach(([a, s], group) => {
    if (faces && !faces.includes(group)) return;
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    const gb = lines(h[b], r, steps);
    const gc = lines(h[c], r, steps);
    const base = pos.length / 3;
    for (const vc of gc) {
      for (const vb of gb) {
        const p = [0, 0, 0];
        p[a] = s * h[a];
        p[b] = vb;
        p[c] = vc;
        const cl = p.map((x, i) => Math.min(inner[i], Math.max(-inner[i], x)));
        const d = p.map((x, i) => x - cl[i]);
        const len = Math.hypot(...d);
        const n = len > 1e-9 ? d.map((x) => x / len) : [0, 0, 0].map((_, i) => (i === a ? s : 0));
        const q = r > 0 ? cl.map((x, i) => x + n[i] * r) : p;
        pos.push(...q);
        nor.push(...n);
        uv.push(...uvFor(a, s, q));
      }
    }
    const nb = gb.length;
    // b × c points along +a; flip the winding on the negative faces
    const flip = s < 0;
    for (let j = 0; j < gc.length - 1; j++) {
      for (let i = 0; i < nb - 1; i++) {
        const v0 = base + j * nb + i;
        const v1 = v0 + 1;
        const v2 = v0 + nb;
        const v3 = v2 + 1;
        if (flip) index.push(v0, v2, v1, v1, v2, v3);
        else index.push(v0, v1, v2, v1, v3, v2);
      }
    }
    const count = (gc.length - 1) * (nb - 1) * 6;
    if (!faces) geo.addGroup(start, count, group);
    start += count;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}
