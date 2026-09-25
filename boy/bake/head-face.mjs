// Facial expressions and the Warden's own face as smooth displacement fields over the scan
// (metres, head frame, +X towards the knight's left). Each returns per-vertex deltas; the lids'
// own shapes come from head-eyes.mjs and the jaw from head-mouth.mjs.
// L: { eyes: [{ centre }], lipY(x), nose: [x, y, z] } — landmarks measured on the scan.

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Anisotropic Gaussian bump, s = [sx, sy, sz] (Infinity drops an axis).
function bump(p, c, s) {
  let d = 0;
  for (let k = 0; k < 3; k++) if (Number.isFinite(s[k])) d += ((p[k] - c[k]) / s[k]) ** 2;
  return Math.exp(-0.5 * d);
}
const XY = (sx, sy) => [sx, sy, Infinity];

function field(P, N, fn) {
  const n = P.length / 3;
  const out = new Float32Array(n * 3);
  const p = [0, 0, 0];
  const nrm = [0, 0, 0];
  const d = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    p[0] = P[i * 3];
    p[1] = P[i * 3 + 1];
    p[2] = P[i * 3 + 2];
    nrm[0] = N[i * 3];
    nrm[1] = N[i * 3 + 1];
    nrm[2] = N[i * 3 + 2];
    d[0] = d[1] = d[2] = 0;
    fn(p, nrm, d);
    out[i * 3] = d[0];
    out[i * 3 + 1] = d[1];
    out[i * 3 + 2] = d[2];
  }
  return out;
}

// Only skin that faces forward on the front of the face takes part (not the eye pockets).
const front = (p, n, z0) => smooth(z0, z0 + 0.008, p[2]) * smooth(-0.1, 0.3, n[2]);

// Corrugator and procerus: brows drawn down and together, skin bunched between them.
export function browDown(P, N, L) {
  return field(P, N, (p, n, d) => {
    for (const { centre: e } of L.eyes) {
      const s = Math.sign(e[0]);
      const g = front(p, n, e[2] + 0.004);
      const med = bump(p, [e[0] - s * 0.012, e[1] + 0.015, 0], XY(0.01, 0.008)) * g;
      const lat = bump(p, [e[0] + s * 0.012, e[1] + 0.016, 0], XY(0.012, 0.008)) * g;
      const hood = bump(p, [e[0], e[1] + 0.009, 0], XY(0.014, 0.004)) * g;
      d[0] -= s * 0.0025 * med;
      d[1] -= 0.003 * med + 0.0015 * lat + 0.0006 * hood;
      d[2] += 0.001 * med;
    }
    const gl = bump(p, [0, L.eyes[0].centre[1] + 0.006, 0], XY(0.007, 0.012)) * front(p, n, 0.095);
    d[1] -= 0.001 * gl;
    d[2] += 0.0008 * gl;
  });
}

// Frontalis: brows and the lower forehead lifted.
export function browUp(P, N, L) {
  return field(P, N, (p, n, d) => {
    for (const { centre: e } of L.eyes) {
      const b = bump(p, [e[0], e[1] + 0.016, 0], XY(0.018, 0.009)) * front(p, n, e[2] + 0.004);
      d[1] += 0.0035 * b;
      d[2] -= 0.0004 * b;
    }
    d[1] += 0.0018 * bump(p, [0, 0.155, 0], XY(0.045, 0.02)) * front(p, n, 0.07);
  });
}

// Effort and pain: upper lip raised, nostrils flared, nasolabial folds deepened, mouth corners
// pulled back and down, chin bunched.
export function snarl(P, N, L) {
  return field(P, N, (p, n, d) => {
    const g = front(p, n, 0.085);
    const lip = L.lipY(0);
    const ul = bump(p, [0, lip + 0.006, 0], XY(0.012, 0.005)) * g;
    d[1] += 0.0018 * ul;
    d[2] += 0.0005 * ul;
    for (const s of [-1, 1]) {
      const fold = bump(p, [s * 0.022, lip + 0.016, 0], XY(0.007, 0.012)) * g;
      d[0] += s * 0.0005 * fold;
      d[1] += 0.0015 * fold;
      d[2] += 0.0012 * fold;
      const ala = bump(p, [L.nose[0] + s * 0.016, L.nose[1] - 0.003, L.nose[2] - 0.018], [0.006, 0.006, 0.008]);
      d[0] += s * 0.0012 * ala;
      const corner = bump(p, [s * 0.021, L.lipY(s * 0.021), 0], XY(0.008, 0.006)) * g;
      d[0] += s * 0.0015 * corner;
      d[1] -= 0.0012 * corner;
      d[2] -= 0.0015 * corner;
    }
    const chin = bump(p, [0, lip - 0.028, 0], XY(0.012, 0.01)) * g;
    d[1] += 0.001 * chin;
    d[2] += 0.001 * chin;
  });
}

// Cheeks lifted under a squint (added to the squinting lids).
export function cheekRaise(P, N, L) {
  return field(P, N, (p, n, d) => {
    for (const { centre: e } of L.eyes) {
      const c = bump(p, [e[0] + Math.sign(e[0]) * 0.004, e[1] - 0.03, 0], XY(0.014, 0.012)) * front(p, n, e[2] - 0.004);
      d[1] += 0.0022 * c;
      d[2] += 0.0015 * c;
    }
  });
}

// The Warden: heavier brow ridge over deeper-set eyes, a broken nose, a broad square jaw and
// chin, hollow cheeks under high cheekbones, a wider skull.
export function wardenFace(P, N, L) {
  return field(P, N, (p, n, d) => {
    for (const { centre: e } of L.eyes) {
      const ridge = bump(p, [e[0] * 0.9, e[1] + 0.019, 0], XY(0.02, 0.006)) * front(p, n, e[2] + 0.006);
      d[1] -= 0.0012 * ridge;
      d[2] += 0.003 * ridge;
    }
    const nose = front(p, n, 0.1);
    d[0] += 0.0028 * bump(p, [0, L.nose[1] + 0.015, 0], XY(0.01, 0.014)) * nose;
    d[2] += 0.002 * bump(p, [0, L.nose[1] + 0.02, 0], XY(0.005, 0.006)) * nose;
    const chin = bump(p, [0, L.lipY(0) - 0.04, 0.105], [0.014, 0.014, 0.014]);
    d[1] -= 0.0025 * chin;
    d[2] += 0.0035 * chin;
    for (const s of [-1, 1]) {
      const jaw = bump(p, [s * 0.058, 0.035, 0.045], [0.018, 0.018, 0.018]);
      d[0] += s * 0.006 * jaw;
      d[1] -= 0.0025 * jaw;
      const hollow = -0.003 * bump(p, [s * 0.04, 0.058, 0.085], [0.011, 0.011, 0.011]);
      const bone = 0.002 * bump(p, [s * 0.047, 0.088, 0.08], [0.012, 0.012, 0.012]);
      for (let k = 0; k < 3; k++) d[k] += n[k] * (hollow + bone);
    }
    d[0] += p[0] * 0.035 * smooth(0.12, 0.2, p[1]);
    // The eyes and lids keep their fit: nothing moves within reach of an eyeball.
    let keep = 1;
    for (const { centre: e } of L.eyes) keep = Math.min(keep, smooth(0.014, 0.02, Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])));
    for (let k = 0; k < 3; k++) d[k] *= keep;
  });
}
