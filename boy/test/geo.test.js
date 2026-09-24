import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mirrored } from '../src/geo.js';

function faceNormal(pos) {
  const a = new THREE.Vector3().fromBufferAttribute(pos, 0);
  const b = new THREE.Vector3().fromBufferAttribute(pos, 1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, 2);
  return b.sub(a).cross(c.sub(a)).normalize();
}

test('a mirrored limb keeps outward faces: winding and normals flip together', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0.1, 0, 0, 0.2, 0, 0, 0.1, 0.1, 0.05], 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  const [[m]] = mirrored([[g, null]], 'x');
  const n = new THREE.Vector3().fromBufferAttribute(m.attributes.normal, 0);
  assert.ok(faceNormal(m.attributes.position).distanceTo(n) < 1e-6, 'winding must agree with the mirrored normal');
  assert.ok(new THREE.Vector3().fromBufferAttribute(m.attributes.position, 0).x < 0);
});
