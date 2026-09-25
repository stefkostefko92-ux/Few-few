// Plate harness geometry per body part, flattened per material for batching.
// Arms and hands are built for the right side and legs for the left; the opposite side is a mirrored copy.
import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lathe, tube, cap, ring, xf, merge, scaleUV, mesh, flatten, mirrored } from './geo.js';
import { buildHelmet } from './helmets.js';

const TAU = Math.PI * 2;
const sm = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function part(name) {
  const g = new THREE.Group();
  g.name = name;
  g.matrixAutoUpdate = false;
  return g;
}

function add(group, geo, mat, opts) {
  const m = mesh(geo, mat, opts);
  group.add(m);
  return m;
}

function rivets(points, r) {
  return merge(points.map((p) => xf(new THREE.SphereGeometry(r, 8, 6), p)));
}

// Torso shell: globose breastplate with a medial ridge, cut low at the armpits.
// The Gothic harness adds shallow flutes that catch the light like the real thing.
function cuirass(fluted) {
  return (u, v, target) => {
    const th = (u - 0.5) * TAU;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const W = 0.158 + 0.026 * sm(0, 0.55, v) - 0.024 * sm(0.72, 1, v);
    const Df = 0.116 + 0.038 * sm(0, 0.6, v) - 0.042 * sm(0.68, 1, v);
    const Db = 0.104 + 0.02 * sm(0.1, 0.7, v) - 0.02 * sm(0.8, 1, v);
    let z = (c > 0 ? Df : Db) * c;
    if (c > 0) z += 0.012 * Math.exp(-(th * th) / 0.02) * (1 - 0.5 * v);
    if (fluted && c > 0.2) {
      const flute = Math.pow(0.5 + 0.5 * Math.cos(th * 15 * (1 - 0.35 * v)), 6);
      z += 0.0042 * flute * sm(0.05, 0.35, v) * (1 - sm(0.72, 0.95, v)) * sm(0.2, 0.5, c);
    }
    const x = W * Math.sign(s) * Math.pow(Math.abs(s), 0.85);
    const yTop = 0.1 + 0.058 * Math.max(c, 0) + 0.1 * Math.max(-c, 0);
    target.set(x, -0.2 + (yTop + 0.2) * v, z);
  };
}

function edgeTube(fn, v, radius) {
  const pts = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < 72; i++) {
    fn(i / 72, v, p);
    pts.push(p.clone().multiplyScalar(1.015));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.TubeGeometry(curve, 144, radius, 6, true);
}

function buildPelvis(M, st) {
  const g = part('pelvis');
  const plates = [];
  const trims = [];
  for (let i = 0; i < 4; i++) {
    const y0 = 0.05 - i * 0.05;
    const r0 = 0.165 + i * 0.009;
    plates.push(xf(lathe([[r0 + 0.013, y0 - 0.064], [r0 + 0.004, y0 - 0.03], [r0, y0]], 40), [0, 0, 0], [0, 0, 0], [1, 1, 0.8]));
    trims.push(xf(ring(r0 + 0.013, 0.0048, TAU, 6, 48), [0, y0 - 0.064, 0], [0, 0, 0], [1, 1, 0.8]));
  }
  add(g, merge(plates), st.plate);
  add(g, merge(trims), st.trim);
  const skirt = xf(lathe([[0.222, -0.3], [0.205, -0.21], [0.19, -0.15]], 40), [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  add(g, scaleUV(skirt, 22, 2.6), M.mail);
  add(g, xf(ring(0.174, 0.013, TAU, 8, 48), [0, 0.036, 0], [0, 0, 0], [1, 1, 0.8]), M.leather);
  add(g, xf(new RoundedBoxGeometry(0.04, 0.034, 0.014, 2, 0.004), [0, 0.036, 0.148]), st.trim);
  add(g, xf(new THREE.SphereGeometry(0.155, 20, 14), [0, -0.07, 0], [0, 0, 0], [1, 0.85, 0.8]), M.gambeson);
  // Tassets hinge on the lowest fauld and swing with the thighs.
  const tassets = [];
  for (const side of [-1, 1]) {
    const t = new THREE.Group();
    t.position.set(side * 0.1, -0.152, 0);
    const lames = merge([
      tube(0.118, 0.124, 0.12, 14, -0.55, 1.1, 0),
      tube(0.124, 0.13, 0.11, 14, -0.58, 1.16, -0.1),
    ]);
    add(t, lames, st.plate);
    add(t, rivets([[-0.045, -0.02, 0.113], [0.045, -0.02, 0.113]], 0.006), st.rivet);
    g.add(t);
    tassets.push(t);
  }
  return { group: g, tassets };
}

// Arming points where the cape is laced to the harness — pure closed-form, independent of the
// cuirass shell shape. Exported so item icons (cloak slot) can drape a real boy Cape (cloth.js)
// without building a throwaway chest mesh just to read these nine points.
export function chestCapeAnchors() {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const a = (t - 0.5) * 2.3;
    pts.push(new THREE.Vector3(Math.sin(a) * 0.185, 0.168 + 0.035 * Math.cos(a * 1.3), -0.118 - 0.02 * Math.cos(a)));
  }
  return pts;
}

export function buildChest(M, st) {
  const g = part('chest');
  const cuirassPoint = cuirass(st.fluted);
  const shell = new ParametricGeometry(cuirassPoint, st.fluted ? 120 : 64, 30);
  add(g, shell, st.plate);
  add(g, edgeTube(cuirassPoint, 1, 0.0065), st.trim);
  add(g, edgeTube(cuirassPoint, 0, 0.0065), st.trim);
  const p = new THREE.Vector3();
  const pts = [];
  for (const u of [0.3, 0.38, 0.62, 0.7]) {
    cuirassPoint(u, 0.07, p);
    pts.push([p.x * 1.03, p.y, p.z * 1.03]);
  }
  add(g, rivets(pts, 0.0065), st.rivet);
  if (st.lanceRest) {
    cuirassPoint(0.43, 0.55, p);
    add(g, xf(new RoundedBoxGeometry(0.045, 0.02, 0.03, 2, 0.006), [p.x, p.y, p.z + 0.012]), st.plate);
  }
  const gorget = merge([
    xf(lathe([[0.146, 0.172], [0.132, 0.19], [0.11, 0.212], [0.093, 0.232]], 40), [0, 0, -0.01], [0, 0, 0], [1, 1, 0.94]),
    xf(lathe([[0.094, 0.228], [0.086, 0.26], [0.088, 0.292], [0.094, 0.302]], 40), [0, 0, -0.012], [0, 0, 0], [1, 1, 0.94]),
  ]);
  add(g, gorget, st.plate);
  add(g, xf(ring(0.094, 0.005, TAU, 6, 40), [0, 0.302, -0.012], [0, 0, 0], [1, 1, 0.94]), st.trim);
  add(g, xf(new THREE.SphereGeometry(0.17, 24, 16), [0, 0.0, -0.005], [0, 0, 0], [1, 1.35, 0.78]), M.gambeson);
  add(g, scaleUV(tube(0.058, 0.064, 0.14, 16, 0, TAU, 0.32), 7, 2.5), M.mail);
  return { group: g, capeAnchors: chestCapeAnchors() };
}

export function buildUpperArm(M, st) {
  const g = part('upperArm');
  add(g, tube(0.056, 0.05, 0.17, 20, 0, TAU, -0.07), st.plate);
  g.add(buildPauldron(M, st));
  add(g, scaleUV(xf(new THREE.CapsuleGeometry(0.046, 0.2, 4, 12), [0, -0.13, 0]), 5, 4), M.mail);
  return g;
}

// Just the shoulder cap+lames+rivets, no arm tube underneath — factored out of buildUpperArm so
// the armor-slot item icon (torso.ts) can show a pauldron without the full sleeve (which read as
// a long "vase neck" when framed alone, see task quality-gate notes). flatten() doesn't care
// about the extra nesting level, so buildUpperArm's merged output is byte-identical to before.
export function buildPauldron(M, st) {
  const g = part('pauldron');
  const r = st.pauldron;
  add(g, xf(cap(r, 1.2, 28, 12), [0.012, 0.0, 0], [0, 0, -0.78]), st.plate);
  add(g, xf(xf(ring(r * Math.sin(1.2), 0.005, TAU, 6, 44), [0, r * Math.cos(1.2), 0]), [0.012, 0, 0], [0, 0, -0.78]), st.trim);
  const lames = [];
  for (let k = 0; k < 3; k++) {
    lames.push(tube(0.094 - k * 0.006, 0.1 - k * 0.006, 0.046, 20, Math.PI / 2 - 1.65, 3.3, -0.035 - k * 0.034));
  }
  add(g, merge(lames), st.plate);
  add(g, rivets([[0.07, 0.07, 0.03], [0.07, 0.07, -0.03], [0.1, 0.02, 0]], 0.006), st.rivet);
  return g;
}

export function buildForearm(M, st) {
  const g = part('foreArm');
  add(g, xf(cap(0.058, 1.3, 20, 10), [0, 0, 0.004], [Math.PI / 2, 0, 0]), st.plate);
  add(g, xf(new THREE.SphereGeometry(0.05, 16, 10), [0.048, 0, 0.016], [0, 0.35, 0], [0.24, 1.1, 0.95]), st.plate);
  add(g, tube(0.047, 0.038, 0.2, 20, 0, TAU, -0.045), st.plate);
  add(g, xf(ring(0.0385, 0.0042, TAU, 6, 32), [0, -0.245, 0]), st.trim);
  add(g, scaleUV(xf(new THREE.CapsuleGeometry(0.04, 0.19, 4, 12), [0, -0.13, 0]), 4, 4), M.mail);
  return g;
}

// Clenched gauntlet: +X towards the knuckles, +Y along the grip, +Z back of the hand.
export function buildHand(M, st) {
  const g = part('hand');
  const cuff = lathe([[0.058, -0.085], [0.05, -0.05], [0.043, -0.012], [0.044, 0.012]], 22);
  add(g, xf(cuff, [0, 0, 0], [0, 0, -Math.PI / 2]), st.plate);
  add(g, xf(new RoundedBoxGeometry(0.072, 0.086, 0.04, 3, 0.014), [0.042, 0, 0.018]), st.plate);
  const fingers = [];
  for (let k = 0; k < 4; k++) {
    const t = new THREE.TorusGeometry(0.026 - k * 0.0012, 0.0105, 8, 14, Math.PI + 0.5);
    t.rotateZ(-Math.PI / 2 - 0.3);
    t.rotateX(Math.PI / 2);
    fingers.push(xf(t, [0.072, 0.031 - k * 0.0205, 0]));
  }
  add(g, merge(fingers), st.plate);
  add(g, xf(new THREE.CapsuleGeometry(0.011, 0.034, 4, 8), [0.058, 0.046, -0.02], [0.3, 0, -1.2]), st.plate);
  add(g, xf(new THREE.SphereGeometry(0.04, 12, 10), [0.045, 0, -0.014], [0, 0, 0], [0.9, 1.05, 0.55]), M.leather);
  return g;
}

function buildThigh(M, st) {
  const g = part('thigh');
  add(g, tube(0.086, 0.066, 0.31, 24, -2.4, 4.8, -0.06), st.plate);
  add(g, xf(new THREE.TorusGeometry(0.086, 0.0055, 6, 36, 4.8), [0, -0.06, 0], [Math.PI / 2, 0, -2.4 + Math.PI / 2]), st.trim);
  add(g, scaleUV(xf(new THREE.CapsuleGeometry(0.07, 0.33, 4, 14), [0, -0.22, 0]), 6, 6), M.mail);
  return g;
}

export function buildShin(M, st) {
  const g = part('shin');
  add(g, xf(cap(0.064, 1.25, 22, 10), [0, 0.0, 0.028], [Math.PI / 2, 0, 0]), st.plate);
  add(g, merge([tube(0.07, 0.072, 0.03, 16, -1.4, 2.8, 0.064), tube(0.066, 0.064, 0.028, 16, -1.3, 2.6, -0.048)]), st.plate);
  add(g, xf(new THREE.SphereGeometry(0.052, 16, 10), [0.058, 0, 0.012], [0, 0, 0], [0.22, 1, 1]), st.plate);
  const greave = lathe([[0.046, -0.42], [0.043, -0.37], [0.052, -0.28], [0.062, -0.19], [0.06, -0.12], [0.053, -0.07]], 24);
  add(g, xf(greave, [0, 0, -0.004], [0, 0, 0], [1, 1, 1.1]), st.plate);
  add(g, xf(ring(0.046, 0.0045, TAU, 6, 32), [0, -0.42, -0.004], [0, 0, 0], [1, 1, 1.1]), st.trim);
  add(g, scaleUV(xf(new THREE.CapsuleGeometry(0.05, 0.3, 4, 12), [0, -0.24, 0]), 4, 5), M.mail);
  return g;
}

export function buildFoot(M, st) {
  const g = part('foot');
  const lames = [];
  for (let k = 0; k < 4; k++) {
    lames.push(xf(new THREE.SphereGeometry(0.058 - k * 0.004, 18, 8, 0, TAU, 0, Math.PI / 2), [0, -0.058, -0.01 + k * 0.046], [0, 0, 0], [0.95, 0.75, 1.45]));
  }
  lames.push(xf(new THREE.SphereGeometry(0.042, 16, 8, 0, TAU, 0, Math.PI / 2), [0, -0.062, 0.158], [0, 0, 0], [0.95, 0.7, 1.6]));
  lames.push(xf(new THREE.SphereGeometry(0.05, 16, 10), [0, -0.045, -0.035], [0, 0, 0], [0.95, 0.8, 0.9]));
  add(g, merge(lames), st.plate);
  add(g, xf(new RoundedBoxGeometry(0.086, 0.022, 0.27, 2, 0.008), [0, -0.078, 0.058]), M.leather);
  if (st.spurs) {
    add(g, merge([xf(ring(0.024, 0.0035, Math.PI, 6, 16), [0, -0.05, -0.052], [0, Math.PI / 2, 0]), xf(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 8), [0, -0.05, -0.098], [0, 0, Math.PI / 2])]), st.trim);
  }
  return g;
}

// Per-piece material/proportion recipe for the two knight styles — Ser Aldric's bright fluted
// plate (A) vs. the Warden's blackened, unfluted harness (B). Exported so item icons (armor
// slot) can build a lone breastplate+pauldrons in the exact same finish, without duplicating
// the recipe.
export function harnessStyle(M, style) {
  return style === 'A'
    ? { plate: M.steelA, trim: M.steelA, rivet: M.brass, pauldron: 0.116, lanceRest: true, spurs: true, fluted: true }
    : { plate: M.steelB, trim: M.goldB, rivet: M.goldB, pauldron: 0.128, lanceRest: false, spurs: false, fluted: false };
}

export function buildKnight(M, style) {
  const st = harnessStyle(M, style);
  const pelvis = buildPelvis(M, st);
  const chest = buildChest(M, st);
  const head = part('head');
  head.add(buildHelmet(M, style));
  const upperArm = flatten(buildUpperArm(M, st));
  const foreArm = flatten(buildForearm(M, st));
  const hand = flatten(buildHand(M, st));
  const thigh = flatten(buildThigh(M, st));
  const shin = flatten(buildShin(M, st));
  const foot = flatten(buildFoot(M, st));
  const pieces = {
    pelvis: flatten(pelvis.group, pelvis.tassets),
    tassetR: flatten(pelvis.tassets[0]),
    tassetL: flatten(pelvis.tassets[1]),
    chest: flatten(chest.group),
    head: flatten(head),
    upperArmR: upperArm,
    upperArmL: mirrored(upperArm, 'x'),
    foreArmR: foreArm,
    foreArmL: mirrored(foreArm, 'x'),
    handR: hand,
    handL: mirrored(hand, 'z'),
    thighL: thigh,
    thighR: mirrored(thigh, 'x'),
    shinL: shin,
    shinR: mirrored(shin, 'x'),
    footR: foot,
    footL: foot,
  };
  const parts = {};
  for (const name of Object.keys(pieces)) parts[name] = { matrix: new THREE.Matrix4() };
  return { parts, pieces, tassetHinges: pelvis.tassets.map((t) => t.position.clone()), capeAnchors: chest.capeAnchors };
}
