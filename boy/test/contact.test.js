import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { closestSegSeg } from '../src/events.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('crossing blades meet at the crossing point', () => {
  const a = V();
  const b = V();
  closestSegSeg(V(-1, 0, 0), V(1, 0, 0), V(0, -1, 0), V(0, 1, 0), a, b);
  assert.ok(a.length() < 1e-9 && b.length() < 1e-9);
});

test('skew blades: the gap is the offset between their lines', () => {
  const a = V();
  const b = V();
  closestSegSeg(V(-1, 0, 0), V(1, 0, 0), V(0.25, -1, 0.3), V(0.25, 1, 0.3), a, b);
  assert.ok(Math.abs(a.distanceTo(b) - 0.3) < 1e-9);
  assert.ok(a.distanceTo(V(0.25, 0, 0)) < 1e-9);
});

test('blades that do not overlap are measured from their nearest ends', () => {
  const a = V();
  const b = V();
  closestSegSeg(V(0, 0, 0), V(1, 0, 0), V(2, 0, 0), V(3, 0, 0), a, b);
  assert.ok(a.distanceTo(V(1, 0, 0)) < 1e-9 && b.distanceTo(V(2, 0, 0)) < 1e-9);
});
