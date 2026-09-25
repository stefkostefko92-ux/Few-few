// Ръкавици / ботуши — чифт, плътно един до друг (не разпилени), леко извърнати навътре, като
// поставени един до друг за витрина. Една форма, огледално дублирана (mirrored) за лявата.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { merge, mesh, mirrored, xf } from '../geoHelpers';
import type { Role } from '../materials';

function glove(): THREE.BufferGeometry {
  const fingers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const fx = -0.048 + i * 0.032;
    const len = 0.048 + (i === 0 || i === 3 ? -0.006 : 0.004);
    fingers.push(xf(new THREE.CapsuleGeometry(0.012, len, 4, 8), [fx, -0.075 - len / 2, 0]));
  }
  return merge([
    xf(new RoundedBoxGeometry(0.115, 0.1, 0.045, 2, 0.02), [0, 0.03, 0]),
    xf(new THREE.CapsuleGeometry(0.017, 0.07, 4, 8), [0.075, -0.01, 0], [0, 0, Math.PI / 2.3]),
    xf(new THREE.CapsuleGeometry(0.015, 0.06, 4, 6), [-0.03, -0.11, 0], [0, 0, Math.PI / 2]),
    ...fingers,
    xf(new THREE.TorusGeometry(0.062, 0.013, 8, 20), [0, 0.09, 0], [Math.PI / 2, 0, 0]),
  ]);
}

function boot(): THREE.BufferGeometry {
  return merge([
    xf(new THREE.CylinderGeometry(0.05, 0.058, 0.2, 14), [0, 0.13, 0]),
    xf(new THREE.CylinderGeometry(0.058, 0.052, 0.03, 14), [0, 0.02, 0]),
    xf(new RoundedBoxGeometry(0.085, 0.055, 0.19, 2, 0.02), [0, -0.02, 0.055]),
    xf(new RoundedBoxGeometry(0.09, 0.02, 0.2, 2, 0.008), [0, -0.05, 0.05]),
  ]);
}

/** Чифт: дясна форма (base) + огледална лява, разположени близо, с лек ъгъл навътре —
 *  четат се като ЕДИН предмет-двойка, не като разпилени части. */
function pair(base: () => THREE.BufferGeometry, primary: THREE.Material, trim: THREE.Material, cuffY: number, gap: number): THREE.Object3D {
  const right = base();
  const g = new THREE.Group();
  g.add(mesh(right, primary));
  const cuff = xf(new THREE.TorusGeometry(0.062, 0.012, 8, 20), [0, cuffY, 0], [Math.PI / 2, 0, 0]);
  g.add(mesh(cuff, trim));
  const mirroredPieces = mirrored([[right, primary], [cuff, trim]], 'x') as [THREE.BufferGeometry, THREE.Material][];
  const left = new THREE.Group();
  for (const [geo, mat] of mirroredPieces) left.add(mesh(geo, mat));
  left.position.x = -gap;
  left.rotation.y = 0.16;
  g.position.x = gap;
  g.rotation.y = -0.16;
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.add(left);
  return wrap;
}

export function buildGloves(M: Record<Role, THREE.Material>): THREE.Object3D {
  return pair(glove, M.primary, M.trim, 0.09, 0.078);
}

export function buildBoots(M: Record<Role, THREE.Material>): THREE.Object3D {
  return pair(boot, M.primary, M.trim, 0.22, 0.07);
}
