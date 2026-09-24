// Ravenhold's inner ward: curtain walls, gatehouse and portcullis, corner towers, the keep, props.
// Masonry is merged per wall or tower so the camera and shadow frusta can cull whole chunks.
import * as THREE from 'three';
import { merge, xf, worldUV, cylUV, mesh, lathe, ring, flatten } from './geo.js';

const box = (cx, cy, cz, sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz);

function tower(x, z, r, h) {
  const out = [];
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, 40, 1, false);
  g.translate(0, h / 2, 0);
  cylUV(g, r, 4);
  g.translate(x, 0, z);
  out.push(g);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const m = box(0, 0, 0, 0.9, 1.1, 0.55);
    m.rotateY(-a);
    m.translate(x + Math.sin(a) * (r - 0.2), h + 0.55, z + Math.cos(a) * (r - 0.2));
    out.push(worldUV(m, 4));
  }
  return out;
}

export function createCastle(M) {
  const group = new THREE.Group();
  const chunks = new Map();
  const add = (key, g) => {
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(worldUV(g, 4));
  };
  const addRaw = (key, list) => {
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(...list);
  };
  // Curtain walls; the north wall carries the arched gate.
  add('north', box(-10, 4.5, -16.25, 14, 9, 2.5));
  add('north', box(10, 4.5, -16.25, 14, 9, 2.5));
  const arch = new THREE.Shape();
  arch.moveTo(-3, 0);
  arch.lineTo(-2.2, 0);
  arch.lineTo(-2.2, 4.4);
  arch.absarc(0, 4.4, 2.2, Math.PI, 0, true);
  arch.lineTo(2.2, 0);
  arch.lineTo(3, 0);
  arch.lineTo(3, 9);
  arch.lineTo(-3, 9);
  arch.lineTo(-3, 0);
  add('north', new THREE.ExtrudeGeometry(arch, { depth: 2.5, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -17.5));
  add('south', box(0, 4.5, 16.25, 34, 9, 2.5));
  add('west', box(-17.25, 4.5, 0, 2.5, 9, 30));
  add('east', box(17.25, 4.5, 0, 2.5, 9, 30));
  for (let x = -15; x <= 15; x += 2) {
    add('north', box(x, 9.6, -17.2, 1.0, 1.2, 0.6));
    add('south', box(x, 9.6, 17.2, 1.0, 1.2, 0.6));
  }
  for (let z = -13; z <= 13; z += 2) {
    add('west', box(-18.2, 9.6, z, 0.6, 1.2, 1.0));
    add('east', box(18.2, 9.6, z, 0.6, 1.2, 1.0));
  }
  for (const x of [-13, -8.5, 8.5, 13]) add('north', box(x, 3, -14.6, 1.3, 6, 0.8));
  for (const x of [-12, -4, 4, 12]) add('south', box(x, 3, 14.6, 1.3, 6, 0.8));
  for (const z of [-11, -2.8, 2.8, 11]) {
    add('west', box(-15.6, 3, z, 0.8, 6, 1.3));
    add('east', box(15.6, 3, z, 0.8, 6, 1.3));
  }
  addRaw('gateTowerW', tower(-4.7, -15.8, 2.4, 11.5));
  addRaw('gateTowerE', tower(4.7, -15.8, 2.4, 11.5));
  [[-17.5, -16.5], [17.5, -16.5], [-17.5, 16.5], [17.5, 16.5]].forEach(([x, z], k) => addRaw(`tower${k}`, tower(x, z, 3.3, 14)));
  add('keep', box(8, 12, -34, 13, 24, 10));
  for (let x = 2; x <= 14; x += 2) add('keep', box(x, 24.6, -29.2, 1.0, 1.2, 0.6));
  for (const list of chunks.values()) group.add(mesh(merge(list), M.stone));

  const roofs = [];
  for (const [x, z] of [[-17.5, -16.5], [17.5, -16.5], [-17.5, 16.5], [17.5, 16.5]]) roofs.push(xf(new THREE.ConeGeometry(3.95, 5.6, 32, 1, true), [x, 14 + 2.8, z]));
  group.add(mesh(merge(roofs), M.roof));

  const windows = [];
  for (const [x, y] of [[4, 8], [9, 8], [13, 12], [5, 16], [10.5, 19]]) windows.push(box(x, y, -28.95, 0.5, 1.1, 0.1));
  windows.push(box(-17.5, 9.5, -13.15, 0.35, 0.8, 0.1), box(17.5, 11, 13.15, 0.35, 0.8, 0.1));
  group.add(mesh(merge(windows), M.windowGlow, { cast: false, receive: false }));

  // Props are laid out as ordinary meshes, then baked into one mesh per material.
  const props = new THREE.Group();
  const bars = [];
  for (let x = -2.0; x <= 2.01; x += 0.33) {
    bars.push(box(x, 4.6, -15.9, 0.07, 4.0, 0.07));
    bars.push(xf(new THREE.ConeGeometry(0.05, 0.22, 6), [x, 2.49, -15.9], [Math.PI, 0, 0]));
  }
  for (let y = 3.0; y <= 6.4; y += 0.6) bars.push(box(0, y, -15.9, 4.3, 0.07, 0.07));
  props.add(mesh(merge(bars), M.iron));
  for (const s of [-1, 1]) {
    props.add(mesh(box(s * 15.95, 1.7, 0, 0.14, 3.4, 2.0), M.slit, { cast: false }));
    props.add(mesh(box(s * 15.9, 1.55, 0, 0.12, 3.1, 1.75), M.wood));
  }
  const barrel = merge([
    lathe([[0.25, 0], [0.3, 0.22], [0.32, 0.45], [0.3, 0.68], [0.25, 0.9]], 20),
    xf(new THREE.CircleGeometry(0.25, 20), [0, 0.9, 0], [-Math.PI / 2, 0, 0]),
  ]);
  const hoops = merge([[0.1, 0.281], [0.3, 0.315], [0.6, 0.315], [0.8, 0.281]].map(([y, r]) => xf(ring(r, 0.012, Math.PI * 2, 5, 28), [0, y, 0])));
  for (const [x, z, k] of [[-14.2, 9.5, 0], [-13.4, 10.4, 1], [-14.6, 10.8, 2]]) {
    for (const m of [mesh(barrel, M.wood), mesh(hoops, M.iron)]) {
      m.position.set(x, 0, z);
      m.rotation.y = k * 1.3;
      props.add(m);
    }
  }
  const lying = new THREE.Group();
  lying.add(mesh(barrel, M.wood), mesh(hoops, M.iron));
  lying.position.set(-12.6, 0.32, 11.6);
  lying.rotation.set(0, 0.6, Math.PI / 2);
  props.add(lying);
  for (const [x, y, z, r] of [[14.2, 0.4, -8.6, 0.1], [14.3, 0.4, -7.7, -0.2], [14.25, 1.2, -8.2, 0.5], [13.4, 0.4, -9.2, 0.9]]) {
    const c = mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), M.wood);
    c.position.set(x, y, z);
    c.rotation.y = r;
    props.add(c);
  }
  const well = mesh(merge([
    cylUV(new THREE.CylinderGeometry(1.05, 1.1, 0.95, 32, 1, true).translate(0, 0.475, 0), 1.05, 2),
    cylUV(new THREE.CylinderGeometry(0.85, 0.85, 0.95, 32, 1, true).translate(0, 0.475, 0), 0.85, 2),
    xf(new THREE.RingGeometry(0.85, 1.08, 32, 1), [0, 0.95, 0], [-Math.PI / 2, 0, 0]),
  ]), M.stone);
  well.position.set(-9.5, 0, 9);
  props.add(well);
  const posts = mesh(merge([box(-0.95, 1.2, 0, 0.14, 2.4, 0.14), box(0.95, 1.2, 0, 0.14, 2.4, 0.14), box(0, 2.3, 0, 2.2, 0.12, 0.12), xf(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 12), [0, 1.95, 0], [0, 0, Math.PI / 2])]), M.wood);
  posts.position.set(-9.5, 0, 9);
  posts.rotation.y = 0.4;
  props.add(posts);
  for (const [g, mat] of flatten(props)) group.add(mesh(g, mat, { cast: mat !== M.slit, receive: true }));
  return { group };
}

// Heraldic banners with a wind ripple done in the vertex shader.
export function createBanners(M, uTime) {
  const group = new THREE.Group();
  const mat = M.banner;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hang = clamp((1.5 - position.y) / 3.0, 0.0, 1.0);
        transformed.z += (sin(position.x * 2.2 + uTime * 2.4 + position.y * 1.4) * 0.1 + sin(uTime * 1.2 + position.y * 0.8) * 0.12) * hang;
        transformed.x += sin(uTime * 1.7 + position.y * 1.1) * 0.05 * hang;`,
      );
  };
  mat.customProgramCacheKey = () => 'banner';
  const geo = new THREE.PlaneGeometry(1.4, 3.0, 10, 20);
  for (const [x, z, ry] of [[-10.8, -14.85, 0], [10.8, -14.85, 0], [-15.85, 9.5, Math.PI / 2], [15.85, -2.2, -Math.PI / 2]]) {
    const b = mesh(geo, mat);
    b.position.set(x, 6.9, z);
    b.rotation.y = ry;
    group.add(b);
  }
  return group;
}
