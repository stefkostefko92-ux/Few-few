// Per-vertex region masks for the skin, hair and beard shaders, measured on the scan: the
// hairline and beard follow anatomy in the head frame, brows and lips follow the scan's own
// colour. Packed as 12 bytes per vertex:
//   [hair, beard, brow, lips] · [wet lining, mouth depth, flush, scar] · [curvature, thickness, 0, 0]

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerpTable = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
};
// Cheap hash noise per position (stable across bakes) for ragged hairlines.
const jitter = (x, y, z) => {
  const s = Math.sin(x * 1271.3 + y * 3117.7 + z * 1789.1) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

// Hairline height (m) against the azimuth around the skull (0 = forehead, π = nape).
const HAIRLINE = [[0, 0.192], [0.45, 0.19], [0.7, 0.178], [0.95, 0.158], [1.12, 0.118], [1.2, 0.086], [1.34, 0.086], [1.42, 0.126], [1.9, 0.124], [2.3, 0.074], [2.7, 0.046], [Math.PI, 0.036]];
// Upper edge of the beard (m) against the distance from the midline, front of the face.
const CHEEK_LINE = [[0, 0.063], [0.012, 0.064], [0.025, 0.066], [0.035, 0.071], [0.05, 0.079], [0.062, 0.086], [0.08, 0.09]];
const EARS = [-1, 1].map((s) => [s * 0.071, 0.09, 0.008]);

function inEar(p) {
  let e = 0;
  for (const c of EARS) e = Math.max(e, 1 - smooth(0.8, 1.25, Math.hypot((p[0] - c[0]) / 0.02, (p[1] - c[1]) / 0.034, (p[2] - c[2]) / 0.024)));
  return e;
}

function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}
// The Warden's scar: through the left brow, then on across the cheekbone below the eye.
const SCAR = [[[0.017, 0.152, 0.097], [0.029, 0.127, 0.1]], [[0.041, 0.094, 0.089], [0.05, 0.068, 0.081]]];

// albedo(u, v) → [r, g, b] in 0..1; L: landmarks { eyes, lipY(x), lipZ(x) }; lining(i), bag(i):
// pocket and mouth-bag tests; curv (1/m) and thick (m) per vertex.
export function regionMasks(P, N, uv, albedo, L, { lining, bag, curv, thick }) {
  const n = P.length / 3;
  const out = new Uint8Array(n * 12);
  const b = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let i = 0; i < n; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const [r, g, bl] = albedo(uv[i * 2], uv[i * 2 + 1]);
    const lum = 0.3 * r + 0.59 * g + 0.11 * bl;
    const az = Math.abs(Math.atan2(p[0], p[2] - 0.012));
    const ear = inEar(p);
    const inner = lining(i) || bag(i);
    const ragged = jitter(p[0], p[1], p[2]) * 0.006;
    const hair = inner ? 0 : smooth(-0.003, 0.007, p[1] - lerpTable(HAIRLINE, az) + ragged) * (1 - ear);
    // Beard: below the cheek line, above the throat, in front of the ears, off the lips. It thins
    // out over ~1.5 cm up the cheek, wider than a triangle, so its edge never follows the mesh.
    const lipY = L.lipY(Math.max(-0.02, Math.min(0.02, p[0])));
    const lips = inner ? 0 : smooth(0.035, 0.012, Math.abs(p[0])) * smooth(0.02, 0.04, r - (g + bl) / 2) * (1 - smooth(0.006, 0.012, Math.abs(p[1] - lipY))) * smooth(0.09, 0.1, p[2]);
    const cheek = lerpTable(CHEEK_LINE, Math.abs(p[0]));
    const throat = lerpTable([[0, -0.028], [0.03, -0.018], [0.05, 0.004], [0.065, 0.03]], Math.abs(p[0]));
    let beard = smooth(0.007, -0.008, p[1] - cheek + ragged) * smooth(-0.004, 0.004, p[1] - throat - ragged) * smooth(-0.002, 0.012, p[2]) * (1 - ear);
    beard *= (1 - smooth(0.15, 0.5, lips)) * (inner ? 0 : 1);
    // Brows: the scan's dark brow hairs inside a band above each eye.
    let brow = 0;
    for (const { centre: e } of L.eyes) {
      const band = smooth(0.034, 0.024, Math.abs(p[0] - e[0] - Math.sign(e[0]) * 0.002)) * smooth(0.004, 0.009, p[1] - e[1]) * smooth(0.03, 0.02, p[1] - e[1]) * smooth(e[2], e[2] + 0.006, p[2]);
      brow = Math.max(brow, band * smooth(0.56, 0.4, lum));
    }
    const wet = lining(i) ? 1 : bag(i) ? 0.85 : 0;
    const depth = bag(i) ? smooth(0.002, 0.014, L.lipZ(Math.max(-0.02, Math.min(0.02, p[0]))) - p[2]) : 0;
    let flush = 0;
    for (const s of [-1, 1]) flush = Math.max(flush, Math.exp(-0.5 * (Math.hypot(p[0] - s * 0.045, p[1] - 0.075, p[2] - 0.085) / 0.016) ** 2), ear * 0.8);
    flush = Math.max(flush, Math.exp(-0.5 * (Math.hypot(p[0], p[1] - 0.077, p[2] - 0.122) / 0.009) ** 2));
    const scar = Math.max(...SCAR.map(([a, c]) => 1 - smooth(0.0008, 0.0024, segDist(p, a, c)))) * (inner ? 0 : 1);
    out.set([b(hair), b(beard), b(brow), b(lips), b(wet), b(depth), b(flush), b(scar), b(curv[i] / 500), b(thick[i] / 0.03), 0, 0], i * 12);
  }
  return out;
}
