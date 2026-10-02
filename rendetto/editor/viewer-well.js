// The cup of a recessed pull. The front stays whole, so the cup is a flat insert in the handle's frame that looks
// sunk: a normal map tilts its walls in towards the floor (the real lights shade them), the colour darkens down the
// walls and on the wall next to the key light, which the frame shades (the upper one; on a vertical pull, turned a
// quarter, the left one), and ambient occlusion deepens into the corners. In the finish of the frame.
import * as THREE from 'three';

const PX_PER_MM = 6;

// Signed distance to a rounded rectangle with half sizes (a, b) and corner radius r (negative inside).
function roundedRect(x, y, a, b, r) {
  const qx = Math.abs(x) - (a - r);
  const qy = Math.abs(y) - (b - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Normal, cavity (colour) and occlusion maps of a cup w × h mm (round: diameter w) with walls `wall` mm wide.
function cupMaps(w, h, round, wall) {
  const W = THREE.MathUtils.ceilPowerOfTwo(Math.max(16, w * PX_PER_MM));
  const H = THREE.MathUtils.ceilPowerOfTwo(Math.max(16, h * PX_PER_MM));
  const sdf = (x, y) =>
    round ? Math.hypot(x, y) - w / 2 : roundedRect(x, y, w / 2, h / 2, Math.min(6, h / 2));
  const normal = new Uint8Array(W * H * 4);
  const ao = new Uint8Array(W * H * 4);
  const cavity = new Uint8Array(W * H * 4);
  const e = 0.05;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ((i + 0.5) / W - 0.5) * w;
      const y = ((j + 0.5) / H - 0.5) * h;
      const t = -sdf(x, y) / wall; // 0 at the rim, 1 where the wall meets the floor
      let nx = 0;
      let ny = 0;
      let nz = 1;
      let occ = 1;
      let cav = 1;
      if (t > 0) {
        // the wall faces the centre: towards falling distance to the floor
        const gx = sdf(x - e, y) - sdf(x + e, y);
        const gy = sdf(x, y - e) - sdf(x, y + e);
        const gl = Math.hypot(gx, gy) || 1;
        const tilt = THREE.MathUtils.degToRad(62) * (1 - THREE.MathUtils.smoothstep(t, 0, 1));
        nx = (gx / gl) * Math.sin(tilt);
        ny = (gy / gl) * Math.sin(tilt);
        nz = Math.cos(tilt);
        occ = t < 1 ? 0.95 - 0.4 * t : 0.55 + 0.3 * THREE.MathUtils.smoothstep(t, 1, 2.6);
        cav =
          (t < 1 ? 1 - 0.68 * t : 0.32 + 0.1 * THREE.MathUtils.smoothstep(t, 1, 2.6)) *
          (1 + 0.55 * Math.min(ny, 0));
      }
      const k = (j * W + i) * 4;
      normal.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], k);
      ao.set([occ * 255, occ * 255, occ * 255, 255], k);
      cavity.set([cav * 255, cav * 255, cav * 255, 255], k);
    }
  }
  const tex = (data) => {
    const t = new THREE.DataTexture(data, W, H);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { normalMap: tex(normal), aoMap: tex(ao), cavityMap: tex(cavity) };
}

// The cup insert, w × h mm (round: diameter w) facing +z; the caller lays it on the frame's face.
export function wellMesh(mats, metal, w, hIn, round) {
  const h = round ? w : hIn;
  const key = `well:${metal.uuid}:${round ? `o${Math.round(w)}` : `${Math.round(w)}x${Math.round(h)}`}`;
  const material = mats.get(key, () => {
    const { normalMap, aoMap, cavityMap } = cupMaps(w, h, round, round ? w * 0.11 : 4.5);
    const m = metal.clone();
    // a textured finish (wood) keeps its own colour map
    if (!m.map) m.map = cavityMap;
    m.normalMap = normalMap;
    m.normalScale = new THREE.Vector2(1, 1);
    m.aoMap = aoMap;
    m.aoMapIntensity = 1;
    m.addEventListener('dispose', () => {
      normalMap.dispose();
      aoMap.dispose();
      cavityMap.dispose();
    });
    return m;
  });
  const geo = round
    ? new THREE.CircleGeometry((w / 2) * 0.001, 48)
    : new THREE.PlaneGeometry(w * 0.001, h * 0.001);
  return new THREE.Mesh(geo, material);
}
