// Places fasteners in an assembly: an ISO 4017 M10 bolt with an ISO 7089 washer under the head,
// clamping `grip` mm of plate, then a washer and an ISO 4032 nut on the far side, all on one axis.
// `left`: the assembly is shown mirrored, so its threads are swept left-handed and read right-
// handed on screen, as every M10 is. Millimetres.
import * as THREE from 'three/webgpu';
import { M10, boltGeometry, nutGeometry, washerGeometry } from './hardware.js';

const UP = new THREE.Vector3(0, 1, 0);
const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};

// Orients a mesh built along +Y so its local origin sits at `at` and +Y points along `dir`.
function place(mesh, at, dir, spin, name) {
  mesh.name = name;
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  if (spin) mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  mesh.position.copy(at);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// start: the plate surface the head bears on; axis: unit direction through the joint.
export function fastener(parent, material, start, axis, grip, { spin = 0, left = false } = {}) {
  const ax = axis.clone().normalize();
  const washerT = M10.washer.h;
  const nutH = M10.m;
  // The shortest ISO 4017 length (5 mm steps) that leaves at least one full thread past the nut:
  // longer would hit the far wall of a B rib, as it would on site.
  const length = Math.ceil((grip + 2 * washerT + nutH + 1.5) / 5) * 5;
  const s = start.clone();
  const at = (k) => s.clone().addScaledVector(ax, k);
  parent.add(place(new THREE.Mesh(cached('washer', () => washerGeometry()), material), at(-washerT), ax, 0, 'washer'));
  const back = ax.clone().negate();
  parent.add(place(new THREE.Mesh(cached(`bolt${length}${left ? 'L' : 'R'}`, () => boltGeometry(length, { left })), material), at(-washerT + length), back, spin, 'bolt'));
  parent.add(place(new THREE.Mesh(cached('washer', () => washerGeometry()), material), at(grip), ax, 0, 'washer'));
  parent.add(place(new THREE.Mesh(cached('nut', () => nutGeometry()), material), at(grip + washerT), ax, spin + 0.4, 'nut'));
  return length;
}
