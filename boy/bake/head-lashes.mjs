// Eyelashes: a strip along each lid margin that the shader (src/lashes.js) cuts into single
// lashes. The strip is rebuilt from the moved margin for every expression, so a blink or a squint
// carries the lashes with the lid; the head bake appends it to the mesh as a group of its own.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const at = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];

// Upper lashes are long, dense and curl up; the lower ones are short and sparse. length (m),
// count (lashes per eye, the strip's u range), lift/curl (rad away from the eye at the root and
// added towards the tip), fan (lean towards the temple at the outer end), inset (bare margin at
// the inner and outer corner, as a share of the margin).
export const LASHES = {
  upper: { length: 0.0095, count: 110, lift: 0.55, curl: 1.1, fan: 0.4, inset: [0.12, 0.04], away: 1 },
  lower: { length: 0.0038, count: 30, lift: 0.4, curl: 0.45, fan: 0.3, inset: [0.25, 0.1], away: -1 },
};
const STATIONS = 22;
const ROWS = 4;
// Lashes grow from the front edge of the margin, a little proud of the skin.
const ROOT = 0.0003;

// Orders one margin from the nose outwards and measures it along its length, on the open face:
// every expression then walks it the same way, so each lash keeps its place on the lid.
// eye: { centre, medial (+1 when the nose lies towards +azimuth) }; ids: welded margin vertices.
function planMargin(P, eye, ids, spec) {
  const c = eye.centre;
  const key = (i) => -Math.atan2(P[i * 3] - c[0], P[i * 3 + 2] - c[2]) * eye.medial;
  const order = [...ids].sort((a, b) => key(a) - key(b));
  const arc = [0];
  for (let k = 1; k < order.length; k++) arc.push(arc[k - 1] + Math.hypot(...sub(at(P, order[k]), at(P, order[k - 1]))));
  const total = arc[arc.length - 1];
  return { eye, spec, order, t: arc.map((a) => a / total) };
}

// Smooth point of the margin at `t` (0 nose .. 1 temple) in the positions P.
function marginPoint(P, plan, t) {
  const p = [0, 0, 0];
  let w = 0;
  plan.order.forEach((i, k) => {
    const g = Math.exp(-(((plan.t[k] - t) / 0.05) ** 2));
    const q = at(P, i);
    for (let a = 0; a < 3; a++) p[a] += q[a] * g;
    w += g;
  });
  return p.map((v) => v / w);
}

// eyes: [{ centre, medial, margins: { upper, lower } }] measured on the open face P0.
export function planLashes(eyes, P0) {
  const plans = eyes.flatMap((eye) => ['upper', 'lower'].map((lid) => planMargin(P0, eye, eye.margins[lid], LASHES[lid])));
  // Which way is "away from the slit" for each strip, fixed on the open face.
  for (const plan of plans) plan.sign = Math.sign(dot(frame(P0, plan, 0.5, 1).bend, [0, plan.spec.away, 0])) || 1;
  return plans;
}

// Root and frame of the lash at t: out of the eye (radial), along the margin, and the bend
// direction away from the slit.
function frame(P, plan, t, sign) {
  const c = plan.eye.centre;
  const m = marginPoint(P, plan, t);
  const out = unit(sub(m, c));
  let along = sub(marginPoint(P, plan, Math.min(1, t + 0.02)), marginPoint(P, plan, Math.max(0, t - 0.02)));
  along = unit(sub(along, out.map((v) => v * dot(along, out))));
  const bend = unit(cross(along, out)).map((v) => v * sign);
  return { root: m.map((v, a) => v + out[a] * ROOT), out, along, bend };
}

// The strips for the positions P (any expression): { count, position, normal, uv, index }.
export function lashStrips(plans, P) {
  const position = [];
  const normal = [];
  const uv = [];
  const index = [];
  for (const plan of plans) {
    const { spec } = plan;
    const first = position.length / 3;
    for (let k = 0; k <= STATIONS; k++) {
      const u = k / STATIONS;
      const t = spec.inset[0] + (1 - spec.inset[0] - spec.inset[1]) * u;
      const f = frame(P, plan, t, plan.sign);
      const len = spec.length * (0.45 + 0.55 * Math.sin(Math.PI * Math.pow(u, 0.8)));
      const dir = (s) => {
        const a = spec.lift + spec.curl * s ** 1.5;
        return unit([0, 1, 2].map((i) => f.out[i] * Math.cos(a) + f.bend[i] * Math.sin(a) + f.along[i] * spec.fan * (u - 0.35) * s));
      };
      let p = f.root;
      for (let j = 0; j <= ROWS; j++) {
        const s = j / ROWS;
        if (j > 0) p = p.map((v, i) => v + dir(s - 0.5 / ROWS)[i] * (len / ROWS));
        const n = unit(cross(dir(s), f.along));
        position.push(...p);
        normal.push(...(dot(n, f.out) < 0 ? n.map((v) => -v) : n));
        uv.push(u * spec.count, s);
      }
    }
    for (let k = 0; k < STATIONS; k++) {
      for (let j = 0; j < ROWS; j++) {
        const a = first + k * (ROWS + 1) + j;
        const b = a + ROWS + 1;
        index.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  return { count: position.length / 3, position: Float32Array.from(position), normal: Float32Array.from(normal), uv: Float32Array.from(uv), index: Uint32Array.from(index) };
}
