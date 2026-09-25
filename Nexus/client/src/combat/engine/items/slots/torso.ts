// Нагръдник/роба — плоча (RoundedBox стъпаловидно торсо) за плоча/ризница/кожа/кост, лате конус
// (роба) за плат/арканни фамилии.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lathe, merge, mesh, xf } from '../geoHelpers';
import type { ItemTheme } from '../theme';
import type { Role } from '../materials';

function plateChest(M: Record<Role, THREE.Material>, tier: number): THREE.Object3D {
  const g = new THREE.Group();
  const bulk = 0.06 + Math.min(0.03, tier * 0.002);
  g.add(mesh(merge([
    xf(new RoundedBoxGeometry(0.34, 0.38, bulk, 3, 0.03), [0, 0.02, 0]),
    xf(new RoundedBoxGeometry(0.18, 0.14, bulk * 0.9, 2, 0.02), [0, 0.24, 0]),
  ]), M.primary));
  g.add(mesh(merge([
    xf(new THREE.SphereGeometry(0.075, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), [-0.2, 0.22, 0], [0, 0, Math.PI * 0.12]),
    xf(new THREE.SphereGeometry(0.075, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), [0.2, 0.22, 0], [0, 0, -Math.PI * 0.12]),
  ]), M.secondary));
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.016, bulk + 0.006), M.trim));
  return g;
}

function robe(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.02, -0.5], [0.16, -0.3], [0.18, -0.05], [0.15, 0.15], [0.1, 0.28]];
  g.add(mesh(lathe(P as [number, number][], 28, -0.9, Math.PI * 2 - 1.8), M.primary));
  g.add(mesh(xf(new THREE.TorusGeometry(0.16, 0.012, 8, 32), [0, 0.28, 0], [Math.PI / 2, 0, 0]), M.trim));
  return g;
}

export function buildTorso(M: Record<Role, THREE.Material>, theme: ItemTheme, tier: number): THREE.Object3D {
  if (theme.family === 'cloth' || theme.family === 'void' || theme.family === 'arcane') return robe(M);
  return plateChest(M, tier);
}
