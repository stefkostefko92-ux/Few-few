// The scan's mouth, like its eyes, is a real slit between the lips in front of a mouth bag. The
// jaw opens by turning the lower lip, chin and jaw about the jaw joints; the upper lip and the
// palate stay with the skull. Triangles that sealed the lips in the middle are dropped.

const sub = (P, i, c) => [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]];
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Mouth bag lining: faces that look back at a point inside the mouth.
export function bagTest(P, normal, centre, reach = 0.036) {
  return (i) => {
    const d = sub(P, i, centre);
    const r = Math.hypot(...d);
    return r < reach && (normal[i * 3] * d[0] + normal[i * 3 + 1] * d[1] + normal[i * 3 + 2] * d[2]) / r < -0.2;
  };
}

// Lip line: margin vertices face out but touch the bag lining. Returns the mouth corners (x) and
// the lip line height as a smoothed table over x.
export function findLips(mesh, normal, adj, rep, centre) {
  const P = mesh.position;
  const bag = bagTest(P, normal, centre);
  const pts = [];
  for (let i = 0; i < P.length / 3; i++) {
    if (rep[i] !== i || bag(i) || P[i * 3 + 2] - centre[2] < 0.012 || !adj[i].some((j) => bag(j))) continue;
    if (Math.abs(P[i * 3 + 1] - centre[1]) > 0.012) continue;
    pts.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  }
  if (pts.length < 8) throw new Error('mouth: lip line not found');
  pts.sort((a, b) => a[0] - b[0]);
  const lo = pts[Math.floor(pts.length * 0.01)][0];
  const hi = pts[Math.ceil(pts.length * 0.99) - 1][0];
  const bins = 20;
  const avg = (k, x) => {
    let s = 0;
    let w = 0;
    for (const p of pts) {
      const g = Math.exp(-(((p[0] - x) / 0.004) ** 2));
      s += p[k] * g;
      w += g;
    }
    return s / w;
  };
  const table = Array.from({ length: bins + 1 }, (_, k) => lo + ((hi - lo) * k) / bins).map((x) => [avg(1, x), avg(2, x)]);
  const at = (x, k) => {
    const f = Math.min(bins, Math.max(0, ((x - lo) / (hi - lo)) * bins));
    const j = Math.min(bins - 1, Math.floor(f));
    return table[j][k] + (table[j + 1][k] - table[j][k]) * (f - j);
  };
  return { lo, hi, y: (x) => at(x, 0), z: (x) => at(x, 1), bag };
}

// How far the lips part along the mouth: nothing at the corners, most in the middle.
export function partProfile(lips, x) {
  const t = (x - lips.lo) / (lips.hi - lips.lo);
  return t <= 0 || t >= 1 ? 0 : Math.pow(Math.sin(t * Math.PI), 0.7);
}

// Triangles sealing the lips where they part, on the skin and on the lining behind it (the
// corners keep theirs).
export function lipBridges(mesh, rep, lips, centre, corner = 0.25) {
  const P = mesh.position;
  const side = (v) => {
    const x = P[v * 3];
    if (partProfile(lips, x) < corner || P[v * 3 + 2] - centre[2] < 0.012 || Math.abs(P[v * 3 + 1] - lips.y(x)) > 0.006) return 0;
    return P[v * 3 + 1] > lips.y(x) ? 1 : -1;
  };
  const cut = new Set();
  for (let t = 0; t < mesh.index.length; t += 3) {
    const s = [mesh.index[t], mesh.index[t + 1], mesh.index[t + 2]].map((v) => side(rep[v]));
    if (s.includes(1) && s.includes(-1)) cut.add(t);
  }
  return cut;
}

// Share of the jaw's turn each vertex follows: the lower lip, chin, jaw and the floor of the
// mouth fully; the upper lip, cheeks and palate not at all; the skin between stretches.
export function jawWeights(mesh, lips, centre, pivot) {
  const P = mesh.position;
  const n = P.length / 3;
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    const xc = Math.min(lips.hi, Math.max(lips.lo, x));
    const ly = lips.y(xc);
    // Line of the jaw from the mouth corners back to the joints below the ears.
    const back = smooth(lips.z(xc), pivot[2], z);
    const jawLine = ly + (pivot[1] - 0.012 - ly) * back;
    let k = 1 - smooth(jawLine - 0.004, jawLine + 0.012 * (0.4 + back), y);
    // Near the lips the split follows the lip line exactly.
    const nearLips = (1 - smooth(0.004, 0.012, Math.abs(y - ly))) * (1 - smooth(0.006, 0.014, lips.z(xc) - z)) * (1 - smooth(0, 0.01, Math.max(lips.lo - x, x - lips.hi)));
    if (nearLips > 0) k = k * (1 - nearLips) + (y < ly ? 1 : 0) * nearLips;
    if (lips.bag(i) && Math.hypot(...sub(P, i, centre)) < 0.036) k = y < ly ? 1 : 0;
    // The throat under the chin stretches instead of turning; ears and the nape stay put.
    k *= smooth(-0.045, -0.005, y) * smooth(pivot[2] - 0.01, pivot[2] + 0.02, z);
    for (const ear of [-1, 1]) k *= smooth(0.018, 0.03, Math.hypot(x - ear * 0.07, y - 0.09, z - 0.01));
    w[i] = k;
  }
  return w;
}

// Position of vertex i with the jaw turned by `angle` (rad) about the x axis through `pivot`,
// scaled by its weight (the jaw opens downwards and slightly back).
export function turnJaw(P, i, weight, angle, pivot, out) {
  const a = angle * weight;
  const y = P[i * 3 + 1] - pivot[1];
  const z = P[i * 3 + 2] - pivot[2];
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = P[i * 3];
  out[1] = pivot[1] + y * c - z * s;
  out[2] = pivot[2] + y * s + z * c;
  return out;
}
