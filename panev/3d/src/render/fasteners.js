// Places fasteners in an assembly: an M10 bolt with a washer under the head, clamping `grip` mm
// of plate, then a washer and a nut on the far side, all on one axis. Millimetres.
import * as THREE from 'three/webgpu';
import { boltGeometry, nutGeometry, washerGeometry } from './hardware.js';

const UP = new THREE.Vector3(0, 1, 0);
const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};

// Orients a mesh built along +Y so its local origin sits at `at` and +Y points along `dir`.
function place(mesh, at, dir, spin = 0) {
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  if (spin) mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  mesh.position.copy(at);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// start: the plate surface the head bears on; axis: unit direction through the joint.
export function fastener(parent, material, start, axis, grip, spin = 0) {
  const ax = axis.clone().normalize();
  const washerT = 2;
  const nutH = 8;
  const length = Math.ceil((grip + 2 * washerT + nutH + 3) / 5) * 5;
  const s = start.clone();
  const at = (k) => s.clone().addScaledVector(ax, k);
  parent.add(place(new THREE.Mesh(cached('washer', () => washerGeometry()), material), at(-washerT), ax));
  const back = ax.clone().negate();
  parent.add(place(new THREE.Mesh(cached(`bolt${length}`, () => boltGeometry(length)), material), at(-washerT + length), back, spin));
  parent.add(place(new THREE.Mesh(cached('washer', () => washerGeometry()), material), at(grip), ax));
  parent.add(place(new THREE.Mesh(cached('nut', () => nutGeometry()), material), at(grip + washerT), ax, spin + 0.4));
  return length;
}
