// Teeth behind the lips: the upper arch stays with the skull, the lower one rides the jaw.
// Crowns are rounded boxes along a dental arch; the mouth's shadow darkens them towards the back.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { positionLocal, smoothstep, vec3, uniform } from 'three/tsl';
import { FaceLitMaterial } from './face-light.js';

// Crown width and height (m) from the midline outwards: incisors, canine, premolars.
const UPPER = [[0.0085, 0.0104], [0.0066, 0.0092], [0.0078, 0.0102], [0.007, 0.0084], [0.0068, 0.008]];
const LOWER = [[0.0054, 0.0088], [0.006, 0.0088], [0.007, 0.0096], [0.007, 0.008], [0.0072, 0.0078]];
const ARCH = 0.024;

// One arch: teeth hang from (upper) or stand on (lower) the edge line y = 0, front at z = 0.
function arch(sizes, dir) {
  const parts = [];
  for (const side of [-1, 1]) {
    let s = 0;
    for (const [w, h] of sizes) {
      const phi = side * (s + w / 2) / ARCH;
      s += w;
      const g = new RoundedBoxGeometry(w * 0.94, h, 0.0065, 2, 0.0016);
      g.translate(0, (dir * h) / 2, -0.00325);
      g.rotateY(phi);
      g.translate(Math.sin(phi) * ARCH, 0, (Math.cos(phi) - 1) * ARCH);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

// mouth: { lipY, lipZ, pivot } from the head bake.
export function createTeeth(mouth, id) {
  const m = new FaceLitMaterial({ name: `teeth${id}`, color: new THREE.Color(0.55, 0.5, 0.42), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.12 });
  // Little light gets in between barely parted lips; deeper teeth sit in the mouth's shadow.
  const open = uniform(0);
  m.colorNode = vec3(0.55, 0.5, 0.42).mul(smoothstep(-0.03, -0.004, positionLocal.z).mul(0.8).add(0.2)).mul(smoothstep(0.02, 0.3, open).mul(0.85).add(0.15));
  const front = mouth.lipZ - 0.0105;
  const upper = new THREE.Mesh(arch(UPPER, 1), m);
  upper.position.set(0, mouth.lipY - 0.0012, front);
  const lowerTeeth = new THREE.Mesh(arch(LOWER, -1), m);
  lowerTeeth.position.set(0, mouth.lipY - 0.0022 - mouth.pivot[1], front - 0.0016 - mouth.pivot[2]);
  const jaw = new THREE.Group();
  jaw.position.set(...mouth.pivot);
  jaw.add(lowerTeeth);
  for (const o of [upper, lowerTeeth]) o.castShadow = false;
  return { upper, jaw, material: m, open };
}
