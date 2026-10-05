// Longsword, arming sword and heater shield. Sword origin = sword-hand grip point,
// +Y along the blade, +X towards the true edge, +Z the flat.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lathe, xf, merge, mesh, flatten } from './geo.js';
import { heaterShape, SHIELD_BOUNDS } from './heraldry.js';

const TAU = Math.PI * 2;
const sm = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function bladeGeometry({ len, halfW, halfT, fuller, base }) {
  const N = 32;
  const rings = [];
  for (let s = 0; s <= N; s++) {
    const f = s / N;
    let w = halfW * (1 - 0.36 * f);
    if (f > 0.8) w *= Math.pow(Math.max(0, 1 - (f - 0.8) / 0.2), 0.8);
    const t = halfT * (1 - 0.5 * f) * Math.min(1, (w / halfW) * 4) + 0.0002;
    const fd = f < fuller ? 1 - sm(fuller - 0.1, fuller, f) : 0;
    const tc = t * (1 - 0.42 * fd);
    rings.push([[w, 0], [0.62 * w, t], [0.3 * w, 0.93 * t], [0, tc], [-0.3 * w, 0.93 * t], [-0.62 * w, t], [-w, 0], [-0.62 * w, -t], [-0.3 * w, -0.93 * t], [0, -tc], [0.3 * w, -0.93 * t], [0.62 * w, -t]]);
  }
  const pos = [];
  const uv = [];
  const push = (p, y, u, v) => {
    pos.push(p[0], y, p[1]);
    uv.push(u, v);
  };
  for (let s = 0; s < N; s++) {
    const y0 = base + (len * s) / N;
    const y1 = base + (len * (s + 1)) / N;
    for (let k = 0; k < 12; k++) {
      const k2 = (k + 1) % 12;
      const a = rings[s][k];
      const b = rings[s][k2];
      const c = rings[s + 1][k2];
      const d = rings[s + 1][k];
      const u0 = k / 12;
      const u1 = (k + 1) / 12;
      const v0 = s / N;
      const v1 = (s + 1) / N;
      push(a, y0, u0, v0);
      push(b, y0, u1, v0);
      push(c, y1, u1, v1);
      push(a, y0, u0, v0);
      push(c, y1, u1, v1);
      push(d, y1, u0, v1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

class Helix extends THREE.Curve {
  constructor(r, y0, y1, turns, sx) {
    super();
    Object.assign(this, { r, y0, y1, turns, sx });
  }

  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * TAU;
    return target.set(Math.cos(a) * this.r * this.sx, this.y0 + (this.y1 - this.y0) * t, Math.sin(a) * this.r);
  }
}

export function longsword(M) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const len = 0.96;
  g.add(mesh(bladeGeometry({ len, halfW: 0.026, halfT: 0.0042, fuller: 0.62, base: 0.066 }), M.blade));
  const guard = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.126, 0.068, 0),
    new THREE.Vector3(-0.06, 0.052, 0),
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(0.06, 0.052, 0),
    new THREE.Vector3(0.126, 0.068, 0),
  ]);
  g.add(mesh(merge([
    new THREE.TubeGeometry(guard, 32, 0.0085, 8, false),
    xf(new THREE.SphereGeometry(0.013, 12, 10), [-0.128, 0.069, 0]),
    xf(new THREE.SphereGeometry(0.013, 12, 10), [0.128, 0.069, 0]),
    xf(new RoundedBoxGeometry(0.036, 0.032, 0.026, 2, 0.006), [0, 0.056, 0]),
  ]), M.blade));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.0135, 0.0148, 0.225, 16), [0, -0.0775, 0], [0, 0, 0], [1.22, 1, 1]), M.leather));
  g.add(mesh(new THREE.TubeGeometry(new Helix(0.0152, 0.028, -0.184, 13, 1.22), 220, 0.0011, 5, false), M.brass, { cast: false }));
  g.add(mesh(lathe([[0.0, -0.262], [0.009, -0.26], [0.019, -0.251], [0.025, -0.232], [0.021, -0.214], [0.013, -0.2], [0.01, -0.19]], 22), M.brass));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(g), bladeBase: 0.066, bladeLen: len };
}

export function armingSword(M) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const len = 0.8;
  g.add(mesh(bladeGeometry({ len, halfW: 0.024, halfT: 0.004, fuller: 0.55, base: 0.058 }), M.bladeDark));
  g.add(mesh(merge([
    xf(new THREE.CylinderGeometry(0.008, 0.009, 0.21, 10), [0, 0.045, 0], [0, 0, Math.PI / 2]),
    xf(new RoundedBoxGeometry(0.032, 0.028, 0.024, 2, 0.006), [0, 0.046, 0]),
  ]), M.goldB));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.014, 0.0145, 0.12, 14), [0, -0.025, 0], [0, 0, 0], [1.2, 1, 1]), M.leather));
  g.add(mesh(merge([
    xf(new THREE.CylinderGeometry(0.031, 0.031, 0.018, 28), [0, -0.11, 0], [Math.PI / 2, 0, 0]),
    xf(new THREE.CylinderGeometry(0.013, 0.013, 0.028, 16), [0, -0.11, 0], [Math.PI / 2, 0, 0]),
  ]), M.goldB));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(g), bladeBase: 0.058, bladeLen: len };
}

// Shield frame: +X along the forearm (elbow to wrist), +Z the painted face, top edge at -Y.
export const SHIELD_WRIST = new THREE.Vector3(0.1, -0.08, -0.075);

export function heaterShield(M) {
  const outer = new THREE.Group();
  outer.matrixAutoUpdate = false;
  const inner = new THREE.Group();
  inner.rotation.z = Math.PI;
  outer.add(inner);
  const B = SHIELD_BOUNDS;
  const bend = (geo, z0) => {
    const p = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, z0 - x * x * 0.55);
      uv.setXY(i, (x - B.x0) / (B.x1 - B.x0), (y - B.y0) / (B.y1 - B.y0));
    }
    geo.computeVertexNormals();
    return geo;
  };
  const face = bend(new THREE.ShapeGeometry(heaterShape(new THREE.Shape()), 24), 0.012);
  const back = bend(new THREE.ShapeGeometry(heaterShape(new THREE.Shape()), 24), -0.012);
  inner.add(mesh(face, M.shieldFace));
  inner.add(mesh(back, M.wood));
  const outline = heaterShape(new THREE.Shape()).getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, -p.x * p.x * 0.55));
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline, true), 160, 0.012, 8, true);
  inner.add(mesh(rim, M.steelB));
  inner.add(mesh(merge([
    xf(new RoundedBoxGeometry(0.03, 0.1, 0.014, 2, 0.004), [-0.1, 0.08, -0.028]),
    xf(new RoundedBoxGeometry(0.03, 0.1, 0.014, 2, 0.004), [0.14, 0.08, -0.028]),
    xf(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), [-0.172, 0.08, -0.05]),
  ]), M.leather));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(outer) };
}
