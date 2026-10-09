// The fasteners are built to ISO dimensions (M10) and face outward: every triangle winds with its
// normals, the thread is right-handed (left-handed for a mirrored assembly, which reads right-
// handed once mirrored), and the head, nut, washer and N1 rail clip measure what they should.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { boltGeometry, nutGeometry, washerGeometry, M10 } from '../src/render/hardware.js';
import { clipGeometry, clipReach, N1 } from '../src/render/clip.js';
import { externalThread, threadProfile } from '../src/render/thread.js';
import { fastener } from '../src/render/fasteners.js';
import { stage } from '../src/render/stage.js';
import { byId } from '../src/catalog.js';

const v3 = (a, i) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);

// Share of non-degenerate triangles whose winding agrees with their vertex normals.
function windingAgreement(g) {
  const geo = g.index ? g.toNonIndexed() : g;
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  let ok = 0;
  let all = 0;
  for (let t = 0; t < p.length / 9; t++) {
    const [a, b, c] = [v3(p, 3 * t), v3(p, 3 * t + 1), v3(p, 3 * t + 2)];
    const face = b.clone().sub(a).cross(c.clone().sub(a));
    if (face.length() < 1e-6) continue;
    const vn = v3(n, 3 * t).add(v3(n, 3 * t + 1)).add(v3(n, 3 * t + 2));
    all++;
    if (face.dot(vn) > 0) ok++;
  }
  return ok / all;
}

const points = (g) => {
  const p = g.attributes.position.array;
  return Array.from({ length: p.length / 3 }, (_, i) => v3(p, i));
};

test('every fastener solid winds with its normals (seen from outside)', () => {
  for (const [name, g] of [['bolt 35', boltGeometry(35)], ['bolt 35 left', boltGeometry(35, { left: true })], ['nut', nutGeometry()], ['washer', washerGeometry()], ['clip', clipGeometry()], ['clip left', clipGeometry({ left: true })]]) {
    assert.ok(windingAgreement(g) > 0.999, `${name}: ${(windingAgreement(g) * 100).toFixed(2)} % of triangles agree`);
  }
});

test('the thread faces outward, is M10 x 1.5 and right-handed (left-handed when asked)', () => {
  const { R, R3 } = threadProfile();
  for (const left of [false, true]) {
    const g = externalThread({ from: 0, to: 20, left });
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    let outward = 0;
    let checked = 0;
    let rMax = 0;
    let rMin = Infinity;
    for (let i = 0; i < p.length / 3; i++) {
      const y = p[i * 3 + 1];
      if (y < 3 || y > 15) continue;
      const r = Math.hypot(p[i * 3], p[i * 3 + 2]);
      rMax = Math.max(rMax, r);
      rMin = Math.min(rMin, r);
      checked++;
      if ((n[i * 3] * p[i * 3] + n[i * 3 + 2] * p[i * 3 + 2]) / r > 0.3) outward++;
    }
    assert.equal(outward, checked, `${left ? 'left' : 'right'}: every normal of the thread points outward`);
    assert.ok(Math.abs(rMax - R) < 1e-3 && Math.abs(rMin - R3) < 1e-3, `major ${2 * rMax}, minor ${2 * rMin}`);
    // Two crest points one step apart along the sweep: the rise and the turn give the hand.
    const rows = threadProfile().pts.length;
    const c = 200;
    const a = v3(p, c * rows);
    const b = v3(p, (c + 1) * rows);
    const turn = a.z * b.x - a.x * b.z;
    assert.ok(b.y > a.y, 'the sweep rises');
    assert.ok(left ? turn < 0 : turn > 0, left ? 'left-hand sweep' : 'right-hand sweep');
  }
});

test('ISO 4017 head: 16 across flats, 17.77–18.2 across corners, k = 6.4, "8.8" standing 0.2 mm', () => {
  const L = 35;
  // The hexagon's walls: from the washer face up to the chamfer, outside the washer face radius.
  const head = points(boltGeometry(L)).filter((q) => q.y >= L + M10.c - 1e-6 && q.y <= L + M10.k && Math.hypot(q.x, q.z) > M10.dw / 2 + 0.01);
  const flats = Math.max(...head.map((q) => Math.max(...[0, 1, 2, 3, 4, 5].map((k) => q.x * Math.cos((k * Math.PI) / 3) + q.z * Math.sin((k * Math.PI) / 3)))));
  const corners = 2 * Math.max(...head.map((q) => Math.hypot(q.x, q.z)));
  assert.ok(Math.abs(flats - 8) < 1e-3, `across flats ${2 * flats}`);
  assert.ok(corners >= 17.77 && corners <= 18.2, `across corners ${corners}`);
  const top = Math.max(...points(boltGeometry(L)).map((q) => q.y));
  assert.ok(Math.abs(top - (L + M10.k + 0.2)) < 1e-3, `head top with the marking at ${top - L}`);
});

test('ISO 4032 nut and ISO 7089 washer measure right', () => {
  const nut = new THREE.Box3().setFromBufferAttribute(nutGeometry().attributes.position);
  assert.ok(Math.abs(nut.max.y - nut.min.y - M10.m) < 1e-3, `nut height ${nut.max.y - nut.min.y}`);
  const w = washerGeometry();
  const box = new THREE.Box3().setFromBufferAttribute(w.attributes.position);
  const radii = points(w).map((q) => Math.hypot(q.x, q.z));
  assert.ok(Math.abs(box.max.y - box.min.y - 2) < 1e-3, 'washer 2 mm thick');
  assert.ok(Math.abs(Math.max(...radii) - 10) < 1e-3 && Math.abs(Math.min(...radii) - 5.25) < 1e-3, 'washer 20 / 10.5');
});

test('the N1 clip: head 36 x 20 x 14 on its heel pad and nose ridge, M10 shank 25 under the bracket', () => {
  const g = clipGeometry();
  const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
  const near = (a, b, tol = 0.1) => Math.abs(a - b) < tol;
  assert.ok(near(box.min.x, -N1.nose) && near(box.max.x, N1.heel) && near(box.max.y, N1.width / 2) && near(box.min.y, -N1.width / 2), JSON.stringify(box));
  assert.ok(near(box.max.z, N1.top, 1e-3) && near(box.min.z, -N1.shank, 1e-3), `z ${box.min.z} to ${box.max.z}`);
  const pts = points(g);
  const low = (test) => Math.min(...pts.filter(test).map((q) => q.z));
  assert.ok(near(low((q) => q.x > 6 && q.z > -1), 0, 1e-3), 'the heel pad stands on the bracket');
  assert.ok(near(low((q) => q.x < -N1.nose + 3 && q.z > -1), N1.foot, 1e-3), 'the nose ridge stands on the rail foot');
  assert.ok(low((q) => q.x > -N1.nose + 5 && q.x < N1.pad - 0.5 && q.z > -1) > N1.foot + 0.5, 'clear of the foot in between');
  // The shank: M10 thread from its end to under the bracket, no wider than the 10 mm slot.
  const shank = pts.filter((q) => q.z < -1);
  assert.ok(Math.max(...shank.map((q) => Math.hypot(q.x, q.y))) <= 5, 'the shank fits the SG slot');
  assert.ok(near(Math.max(...shank.filter((q) => q.z < -6).map((q) => Math.hypot(q.x, q.y))), 4.95, 1e-3), 'M10 major diameter');
  assert.deepEqual(g.groups.map((gr) => gr.materialIndex), [0, 1], 'forged head, then the shank');
  const reach = clipReach(25);
  assert.ok(reach.min === 32.5 && reach.max === 40.5, JSON.stringify(reach));
});

test('each bolt is the shortest ISO length with at least one thread past its nut', () => {
  for (const grip of [8, 9, 10, 14]) {
    const group = new THREE.Group();
    const length = fastener(group, new THREE.MeshBasicNodeMaterial(), new THREE.Vector3(), new THREE.Vector3(0, 0, 1), grip);
    const past = length - (grip + 2 * M10.washer.h + M10.m);
    assert.ok(length % 5 === 0 && past >= 1.5 && past < 6.5, `grip ${grip}: M10 x ${length}, ${past} mm past the nut`);
    assert.equal(group.children.length, 4, 'bolt, two washers, nut');
  }
});

test('every bolt and clip reads right-handed on screen, in both hands of both kinds of assembly', () => {
  const mat = new THREE.MeshBasicNodeMaterial();
  const M = { part: [mat, mat], hw: mat, rail: mat };
  for (const code of ['A-65-170-7', 'SU-220-160', 'SC-80-220']) {
    for (const hand of ['DX', 'SX']) {
      const { object } = stage(byId(code), hand, 'assembly', M);
      object.updateMatrixWorld(true);
      const bolts = [];
      object.traverse((o) => (o.name === 'bolt' || o.name === 'clip') && bolts.push(o));
      assert.ok(bolts.length >= 2, `${code} ${hand}: bolts on show`);
      for (const b of bolts) {
        // A left-hand sweep is right only when the world mirrors it (negative determinant).
        const mirrored = b.matrixWorld.determinant() < 0;
        assert.equal(b.geometry.userData.thread === 'left', mirrored, `${code} ${hand}: thread ${b.geometry.userData.thread}, mirrored ${mirrored}`);
      }
    }
  }
});
