// Great helm with a brass cross (Ser Aldric) and a hounskull bascinet with aventail (the Warden).
import * as THREE from 'three';
import { lathe, xf, merge, scaleUV, mesh } from './geo.js';

const TAU = Math.PI * 2;

function profileRadius(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][0];
}

// Small dark discs pressed into a surface of revolution (breaths).
function breaths(points, radius) {
  const zAxis = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  return merge(
    points.map(([pos, nrm]) => {
      const d = new THREE.CircleGeometry(radius, 10);
      q.setFromUnitVectors(zAxis, nrm);
      m.compose(pos, q, new THREE.Vector3(1, 1, 1));
      return d.applyMatrix4(m);
    }),
  );
}

function greatHelm(M) {
  const g = new THREE.Group();
  g.position.set(0, 0.005, 0.012);
  g.scale.set(0.93, 1, 1.07);
  const P = [[0.117, -0.075], [0.124, -0.04], [0.127, 0.03], [0.127, 0.09], [0.122, 0.14], [0.108, 0.18], [0.084, 0.21], [0.05, 0.232], [0.0, 0.242]];
  g.add(mesh(lathe(P, 48), M.steelA));
  const up = (pts, dr) => pts.map(([r, y]) => [r + dr, y]);
  const band = merge([
    lathe(up(P.slice(0, 8), 0.0035), 3, -0.075, 0.15),
    lathe([[0.1305, 0.06], [0.1308, 0.079]], 28, -1.55, 3.1),
    lathe([[0.1255, 0.128], [0.1195, 0.15]], 48),
  ]);
  g.add(mesh(band, M.brass));
  g.add(mesh(merge([lathe([[0.1286, 0.083], [0.1286, 0.099]], 12, -0.97, 0.82), lathe([[0.1286, 0.083], [0.1286, 0.099]], 12, 0.15, 0.82)]), M.slit, { cast: false }));
  const pts = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const phi = -0.95 + i * 0.13 + (j % 2) * 0.065;
      const y = -0.035 + j * 0.02;
      const r = profileRadius(P, y) + 0.0016;
      pts.push([new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r), new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi))]);
    }
  }
  g.add(mesh(breaths(pts, 0.0043), M.slit, { cast: false }));
  const rim = [];
  for (let k = 0; k < 14; k++) {
    const phi = (k / 14) * TAU;
    rim.push(xf(new THREE.SphereGeometry(0.0045, 8, 6), [Math.sin(phi) * 0.129, 0.14, Math.cos(phi) * 0.129]));
  }
  g.add(mesh(merge(rim), M.brass));
  return g;
}

function shear(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.04) p.setZ(i, p.getZ(i) - (y - 0.04) * 0.28);
  }
  geo.computeVertexNormals();
  return geo;
}

function hounskull(M) {
  const g = new THREE.Group();
  g.position.set(0, 0.005, 0.005);
  const skullG = new THREE.Group();
  skullG.scale.set(0.93, 1, 1.05);
  const S = [[0.118, -0.07], [0.122, -0.02], [0.123, 0.05], [0.117, 0.11], [0.1, 0.165], [0.072, 0.21], [0.038, 0.245], [0.0, 0.268]];
  skullG.add(mesh(shear(lathe(S, 48)), M.steelB));
  skullG.add(mesh(shear(lathe([[0.1205, 0.1], [0.117, 0.118]], 48)), M.goldB));
  g.add(skullG);
  // Snouted visor: a lathe around its own axis, turned to point forward and slightly down.
  const V = [[0.108, 0.0], [0.104, 0.045], [0.084, 0.1], [0.052, 0.15], [0.02, 0.18], [0.0, 0.188]];
  const visor = new THREE.Group();
  visor.position.set(0, 0.07, 0.036);
  visor.rotation.x = Math.PI / 2 + 0.1;
  visor.scale.set(1, 1, 0.9);
  visor.add(mesh(lathe(V, 40), M.steelB));
  visor.add(mesh(lathe([[0.1085, -0.004], [0.1085, 0.012]], 40), M.goldB));
  const slitA = lathe([[0.1062, 0.026], [0.1052, 0.04]], 12, Math.PI + 0.3, 0.85);
  const slitB = lathe([[0.1062, 0.026], [0.1052, 0.04]], 12, Math.PI - 1.15, 0.85);
  visor.add(mesh(merge([slitA, slitB]), M.slit, { cast: false }));
  const pts = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      for (const side of [-1, 1]) {
        const phi = side * (0.35 + i * 0.2);
        const y = 0.07 + j * 0.022;
        const r = profileRadius(V, y) + 0.0015;
        pts.push([new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r), new THREE.Vector3(Math.sin(phi), 0.35, Math.cos(phi)).normalize()]);
      }
    }
  }
  visor.add(mesh(breaths(pts, 0.0036), M.slit, { cast: false }));
  g.add(visor);
  g.add(mesh(merge([xf(new THREE.SphereGeometry(0.012, 10, 8), [0.113, 0.07, 0.03]), xf(new THREE.SphereGeometry(0.012, 10, 8), [-0.113, 0.07, 0.03])]), M.goldB));
  const aventail = lathe([[0.205, -0.21], [0.165, -0.15], [0.132, -0.09], [0.121, -0.052]], 40);
  g.add(mesh(scaleUV(aventail, 18, 2.5), M.mail));
  return g;
}

export function buildHelmet(M, style) {
  return style === 'A' ? greatHelm(M) : hounskull(M);
}
