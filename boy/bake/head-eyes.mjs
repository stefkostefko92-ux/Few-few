// Opens the scan's closed eyes around real eyeballs. The scan models each eye as a pocket behind
// two lids that meet at a real slit, so the lids open by sliding over the eyeball: the upper lid
// rises and its skin folds away under the brow, the lower lid drops a little, and the margins
// settle onto the eyeball. The untouched scan stays the target of the blink.

import { EYE, eyeFront } from '../src/eye-shape.js';

export { EYE, eyeFront };

const sub = (P, i, c) => [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]];
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function fitSphere(points) {
  const M = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const v = [0, 0, 0, 0];
  for (const p of points) {
    const a = [2 * p[0], 2 * p[1], 2 * p[2], 1];
    const b = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) {
      v[i] += a[i] * b;
      for (let j = 0; j < 4; j++) M[i][j] += a[i] * a[j];
    }
  }
  for (let i = 0; i < 4; i++) {
    let p = i;
    for (let r = i + 1; r < 4; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    [v[i], v[p]] = [v[p], v[i]];
    for (let r = 0; r < 4; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
      v[r] -= f * v[i];
    }
  }
  const x = v.map((vi, i) => vi / M[i][i]);
  return { centre: x.slice(0, 3), radius: Math.sqrt(x[3] + x[0] ** 2 + x[1] ** 2 + x[2] ** 2) };
}

// Pocket behind the lids (faces that look at the guess), then the eyeball: centred in the pocket
// and pushed forward until its cornea sits `gap` behind the closed lids.
export function locateEye(mesh, normal, rep, guess, gap = 0.0015) {
  const P = mesh.position;
  const inward = [];
  for (let i = 0; i < P.length / 3; i++) {
    if (rep[i] !== i) continue;
    const d = sub(P, i, guess);
    const r = Math.hypot(...d);
    if (r < 0.018 && (normal[i * 3] * d[0] + normal[i * 3 + 1] * d[1] + normal[i * 3 + 2] * d[2]) / r < -0.3) inward.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  }
  const pocket = fitSphere(inward);
  const c = pocket.centre;
  // The outermost surface straight ahead of the pocket is the closed lid.
  let lid = -Infinity;
  const idx = mesh.index;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, e] = [idx[t], idx[t + 1], idx[t + 2]].map((v) => sub(P, v, c));
    const d = (b[1] - e[1]) * (a[0] - e[0]) + (e[0] - b[0]) * (a[1] - e[1]);
    if (Math.abs(d) < 1e-14) continue;
    const w1 = ((b[1] - e[1]) * -e[0] + (e[0] - b[0]) * -e[1]) / d;
    const w2 = ((e[1] - a[1]) * -e[0] + (a[0] - e[0]) * -e[1]) / d;
    const w3 = 1 - w1 - w2;
    if (w1 < 0 || w2 < 0 || w3 < 0) continue;
    const z = a[2] * w1 + b[2] * w2 + e[2] * w3;
    if (z > 0 && z < 0.03) lid = Math.max(lid, z);
  }
  if (!Number.isFinite(lid)) throw new Error('eye: no closed lid in front of the pocket');
  const forward = lid - gap - eyeFront(0);
  return { centre: [c[0], c[1], c[2] + forward], pocket: c, pocketRadius: pocket.radius };
}

// Lining of the pocket: faces that look back at the pocket centre (the conjunctiva).
function liningTest(P, normal, eye) {
  return (i) => {
    const d = sub(P, i, eye.pocket);
    const r = Math.hypot(...d);
    return r < 0.024 && (normal[i * 3] * d[0] + normal[i * 3 + 1] * d[1] + normal[i * 3 + 2] * d[2]) / r < -0.2;
  };
}

// Slit between the lids: margin vertices face out but touch the pocket lining. Returns the
// canthi (azimuth range) and the slit elevation as a smoothed table over the azimuth.
export function findSlit(mesh, normal, adj, rep, eye) {
  const P = mesh.position;
  const c = eye.centre;
  const facing = liningTest(P, normal, eye);
  const pts = [];
  for (let i = 0; i < P.length / 3; i++) {
    if (rep[i] !== i) continue;
    const d = sub(P, i, c);
    const r = Math.hypot(...d);
    const ahead = P[i * 3 + 2] - eye.pocket[2];
    if (r > 0.02 || ahead < 0.01 || facing(i) || !adj[i].some((j) => facing(j))) continue;
    pts.push([Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]);
  }
  if (pts.length < 8) throw new Error('eye: slit not found');
  pts.sort((a, b) => a[0] - b[0]);
  const lo = pts[Math.floor(pts.length * 0.01)][0];
  const hi = pts[Math.ceil(pts.length * 0.99) - 1][0];
  const bins = 24;
  const table = Array.from({ length: bins + 1 }, (_, k) => {
    const th = lo + ((hi - lo) * k) / bins;
    let s = 0;
    let w = 0;
    for (const [t, p] of pts) {
      const g = Math.exp(-(((t - th) / 0.08) ** 2));
      s += p * g;
      w += g;
    }
    return s / w;
  });
  return { lo, hi, phi: (th) => {
    const f = Math.min(bins, Math.max(0, ((th - lo) / (hi - lo)) * bins));
    const k = Math.min(bins - 1, Math.floor(f));
    return table[k] + (table[k + 1] - table[k]) * (f - k);
  } };
}

// Upper lid peaks a little towards the nose, the lower lid dips a little towards the temple.
const almond = (t, peak) => {
  if (t <= 0 || t >= 1) return 0;
  const q = t < peak ? t / peak : (1 - t) / (1 - peak);
  return Math.pow(Math.sin((q * Math.PI) / 2), 0.9);
};

// Moves every lid vertex of one eye (in place on `out`). With `open` 0 the lids stay closed as
// scanned; either way the pocket lining in front of the eyeball is tucked inside it, and skin
// the eyeball would pierce is lifted clear. opts: rise/drop (rad) of the upper/lower margin at
// the widest point; `medial` +1 when the nose lies towards +azimuth for this eye.
export function shapeLids(mesh, normal, rep, eye, slit, out, { open = 1, rise = 0.66, drop = 0.12, medial = 1, crease = 0.0022, clear = 0.0004, puff = 0.0009 } = {}) {
  const P = mesh.position;
  const c = eye.centre;
  const lining = liningTest(P, normal, eye);
  const span = slit.hi - slit.lo;
  const done = new Map();
  for (let i = 0; i < P.length / 3; i++) {
    const r0 = rep[i];
    if (done.has(r0)) {
      out.set(done.get(r0), i * 3);
      continue;
    }
    const d = sub(P, r0, c);
    const r = Math.hypot(...d);
    const th = Math.atan2(d[0], d[2]);
    const ph = Math.atan2(d[1], Math.hypot(d[0], d[2]));
    const inner = lining(r0);
    // Fade out past the canthi, deep in the pocket and far from the eye.
    const t = (th - slit.lo) / span;
    const tm = medial > 0 ? t : 1 - t;
    const reach0 = (1 - smooth(0.019, 0.026, r)) * smooth(-0.006, 0.002, d[2]);
    const reach = open * reach0;
    const ps = slit.phi(Math.min(slit.hi, Math.max(slit.lo, th)));
    const s = ph - ps;
    let phN = ph;
    let rN = r;
    if (reach > 0 && s >= 0) {
      const w = almond(tm, 0.42) * reach;
      const u = s / 0.85;
      // Pretarsal strip stays visible above the margin; the rest folds away under the brow.
      const lift = u <= 0.25 ? ps + rise + (u / 0.25) * 0.15 : mix(ps + rise + 0.15, ph, smooth(0.25, 0.9, u));
      phN = ph + (lift - ph) * w;
      const hug = eyeFront(Math.acos(Math.cos(th) * Math.cos(phN))) + 0.0011 + 0.001 * smooth(0, 0.25, u);
      rN = r + (mix(hug, r, smooth(0.2, 0.85, u)) - r) * w - crease * w * Math.exp(-(((u - 0.45) / 0.14) ** 2));
    } else if (reach > 0) {
      const w = almond(tm, 0.58) * reach;
      const u = -s / 0.4;
      phN = ph + (mix(ps - drop, ph, smooth(0, 1, u)) - ph) * w;
      const hug = eyeFront(Math.acos(Math.cos(th) * Math.cos(phN))) + 0.0011 + 0.0006 * smooth(0, 0.4, u);
      rN = r + (mix(hug, r, smooth(0.15, 0.9, u)) - r) * w;
    }
    // Closed lids sit a little proud of the scan, so the straight path of a blink clears the
    // cornea on its way down.
    if (open === 0 && !inner && reach0 > 0) rN += puff * almond(tm, 0.5) * reach0 * (1 - smooth(0.25, 0.6, Math.abs(s)));
    const a = Math.acos(Math.max(-1, Math.min(1, Math.cos(th) * Math.cos(phN))));
    if (inner) {
      if (a < 1.75) rN = Math.min(rN, eyeFront(a) - clear);
    } else if (a < 1.75 && r < 0.022) rN = Math.max(rN, eyeFront(a) + clear + (open === 0 ? puff : 0));
    const h = Math.cos(phN) * rN;
    const p = [c[0] + Math.sin(th) * h, c[1] + Math.sin(phN) * rN, c[2] + Math.cos(th) * h];
    out.set(p, i * 3);
    done.set(r0, p);
  }
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

// Triangles that bridge the slit from the upper to the lower margin (a skin film across the eye
// once the lids part). Near the canthi, where the lids barely part, the film stays and keeps the
// corners closed. Returns the set of triangle starts in `mesh.index` to drop.
export function slitBridges(mesh, normal, rep, eye, slit, { medial = 1, corner = 0.2 } = {}) {
  const P = mesh.position;
  const c = eye.centre;
  const lining = liningTest(P, normal, eye);
  const side = (v) => {
    const d = sub(P, v, c);
    const th = Math.atan2(d[0], d[2]);
    const t = (th - slit.lo) / (slit.hi - slit.lo);
    const tm = medial > 0 ? t : 1 - t;
    if (Math.hypot(...d) > 0.02 || P[v * 3 + 2] - eye.pocket[2] < 0.008 || Math.min(almond(tm, 0.42), almond(tm, 0.58)) < corner) return 0;
    return Math.atan2(d[1], Math.hypot(d[0], d[2])) > slit.phi(th) ? 1 : -1;
  };
  const cut = new Set();
  for (let t = 0; t < mesh.index.length; t += 3) {
    const vs = [mesh.index[t], mesh.index[t + 1], mesh.index[t + 2]];
    if (vs.some((v) => lining(rep[v]))) continue;
    const s = vs.map((v) => side(rep[v]));
    if (s.includes(1) && s.includes(-1)) cut.add(t);
  }
  return cut;
}
