// Пръстен и амулет — метален band/верижка + скъпоценен камък (октаедър, светещ при finish=glowing).
import * as THREE from 'three/webgpu';
import { mesh, xf } from '../geoHelpers';
import type { ItemTheme } from '../theme';
import type { Role } from '../materials';

export function buildRing(M: Record<Role, THREE.Material>, theme: ItemTheme): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 12, 32), M.trim));
  if (theme.motif !== 'plain') {
    g.add(mesh(xf(new THREE.OctahedronGeometry(0.014, 0), [0, 0.03, 0]), M.secondary));
  }
  return g;
}

export function buildAmulet(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.09, 0.12, 0), new THREE.Vector3(-0.05, 0.16, 0.02), new THREE.Vector3(0, 0.17, 0),
    new THREE.Vector3(0.05, 0.16, 0.02), new THREE.Vector3(0.09, 0.12, 0),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 32, 0.003, 6, false), M.trim));
  g.add(mesh(xf(new THREE.TorusGeometry(0.02, 0.005, 10, 20), [0, 0.06, 0], [Math.PI / 2, 0, 0]), M.trim));
  g.add(mesh(xf(new THREE.OctahedronGeometry(0.028, 0), [0, 0.0, 0]), M.secondary));
  return g;
}
