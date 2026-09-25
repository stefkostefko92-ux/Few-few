// Ръкавици / ботуши — една форма, огледално дублирана (mirrored) за лявата страна.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { merge, mesh, mirrored, xf } from '../geoHelpers';
import type { Role } from '../materials';

function glove(): THREE.BufferGeometry {
  const fingers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) fingers.push(xf(new THREE.CapsuleGeometry(0.011, 0.05, 4, 8), [-0.045 + i * 0.03, -0.06, 0]));
  return merge([
    xf(new RoundedBoxGeometry(0.11, 0.09, 0.04, 2, 0.02), [0, 0.03, 0]),
    xf(new THREE.CapsuleGeometry(0.016, 0.06, 4, 8), [0.07, 0.0, 0], [0, 0, Math.PI / 2.4]),
    ...fingers,
  ]);
}

function boot(): THREE.BufferGeometry {
  return merge([
    xf(new THREE.CylinderGeometry(0.055, 0.045, 0.22, 14), [0, 0.11, 0]),
    xf(new RoundedBoxGeometry(0.08, 0.06, 0.18, 2, 0.02), [0, -0.02, 0.05]),
  ]);
}

function pair(base: () => THREE.BufferGeometry, primary: THREE.Material, trim: THREE.Material, spacing: number): THREE.Object3D {
  const right = base();
  const g = new THREE.Group();
  g.add(mesh(right, primary));
  const cuff = xf(new THREE.TorusGeometry(0.06, 0.012, 8, 20), [0, spacing, 0], [Math.PI / 2, 0, 0]);
  g.add(mesh(cuff, trim));
  const mirroredPieces = mirrored([[right, primary], [cuff, trim]], 'x') as [THREE.BufferGeometry, THREE.Material][];
  const left = new THREE.Group();
  for (const [geo, mat] of mirroredPieces) left.add(mesh(geo, mat));
  left.position.x = -0.16;
  g.position.x = 0.16;
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.add(left);
  return wrap;
}

export function buildGloves(M: Record<Role, THREE.Material>): THREE.Object3D {
  return pair(glove, M.primary, M.trim, 0.06);
}

export function buildBoots(M: Record<Role, THREE.Material>): THREE.Object3D {
  return pair(boot, M.primary, M.trim, 0.2);
}
