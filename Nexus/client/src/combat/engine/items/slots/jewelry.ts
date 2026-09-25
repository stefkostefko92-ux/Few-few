// Пръстен и амулет — метален band/верижка (от звена) + камък в легло (bezel), светещ при
// finish=glowing.
import * as THREE from 'three/webgpu';
import { merge, mesh, xf } from '../geoHelpers';
import type { ItemTheme } from '../theme';
import type { Role } from '../materials';

export function buildRing(M: Record<Role, THREE.Material>, theme: ItemTheme): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.032, 0.007, 12, 32), M.trim));
  // Легло (bezel) + камък — ВИНАГИ (не само при motif≠plain): пръстен без камък не се чете
  // като пръстен, чете се като гола халка.
  g.add(mesh(xf(new THREE.TorusGeometry(0.017, 0.004, 8, 16), [0, 0.034, 0], [Math.PI / 2, 0, 0]), M.trim));
  const claws: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    claws.push(xf(new THREE.ConeGeometry(0.003, 0.014, 6), [Math.cos(a) * 0.016, 0.038, Math.sin(a) * 0.016], [0, 0, 0]));
  }
  g.add(mesh(merge(claws), M.trim));
  g.add(mesh(xf(new THREE.OctahedronGeometry(0.017, theme.motif === 'plain' ? 0 : 1), [0, 0.039, 0]), M.secondary));
  return g;
}

/** Верижка от отделни звена (не единична дъга) — виси реалистично от врата. */
function chain(): THREE.BufferGeometry {
  const links: THREE.BufferGeometry[] = [];
  const pts: [number, number][] = [
    [-0.09, 0.12], [-0.07, 0.145], [-0.045, 0.163], [-0.018, 0.172],
    [0.018, 0.172], [0.045, 0.163], [0.07, 0.145], [0.09, 0.12],
  ];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    links.push(xf(new THREE.TorusGeometry(0.008, 0.0022, 6, 10), [x, y, 0], [0, 0, (i % 2) * Math.PI / 2]));
  }
  return merge(links);
}

export function buildAmulet(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(chain(), M.trim));
  // Медальон: рамка (bezel диск) + гнездо + камък.
  g.add(mesh(xf(new THREE.CylinderGeometry(0.032, 0.032, 0.008, 24), [0, 0.06, 0], [Math.PI / 2, 0, 0]), M.trim));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.024, 0.024, 0.01, 24), [0, 0.06, 0.006], [Math.PI / 2, 0, 0]), M.primary));
  g.add(mesh(xf(new THREE.OctahedronGeometry(0.02, 0), [0, 0.06, 0.014]), M.secondary));
  return g;
}
