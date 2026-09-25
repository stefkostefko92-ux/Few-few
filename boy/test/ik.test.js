import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveTwoBone } from '../src/rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('reachable target: bones keep their length and the hand arrives', () => {
  const root = V(0, 1.4, 0);
  const target = V(0.2, 1.05, 0.25);
  const mid = V();
  const end = V();
  solveTwoBone(root, target, 0.29, 0.27, V(0, -1, -0.3), mid, end);
  assert.ok(Math.abs(mid.distanceTo(root) - 0.29) < 1e-6);
  assert.ok(Math.abs(end.distanceTo(mid) - 0.27) < 1e-6);
  assert.ok(end.distanceTo(target) < 1e-6);
});

test('the elbow bends towards the pole', () => {
  const root = V(0, 1.4, 0);
  const mid = V();
  const end = V();
  solveTwoBone(root, V(0, 1.4, 0.4), 0.29, 0.27, V(0, -1, 0), mid, end);
  assert.ok(mid.y < 1.4, 'elbow should drop below the shoulder line');
});

test('out-of-reach target: the limb straightens along the line to it', () => {
  const root = V(0, 1.4, 0);
  const target = V(0, 1.4, 2);
  const mid = V();
  const end = V();
  solveTwoBone(root, target, 0.29, 0.27, V(0, -1, 0), mid, end);
  assert.ok(Math.abs(end.distanceTo(root) - 0.56) < 2e-3);
  assert.ok(end.clone().sub(root).normalize().distanceTo(V(0, 0, 1)) < 1e-6);
});
