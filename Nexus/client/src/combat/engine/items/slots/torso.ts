// Нагръдник/роба — оформено торсо (гърди→талия→ханш), рамене (pauldrons), яка, колан.
// Плоча/ризница/кожа/кост → метален/кожен корсет; плат/арканни/void → лате роба.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lathe, merge, mesh, xf } from '../geoHelpers';
import type { ItemTheme } from '../theme';
import type { Role } from '../materials';

function plateChest(M: Record<Role, THREE.Material>, tier: number): THREE.Object3D {
  const g = new THREE.Group();
  const bulk = 0.075 + Math.min(0.025, tier * 0.0015);

  // Торсо: гърди (широко) → талия (стеснено) → ханш (леко разширено) — не права кутия.
  const chest = new RoundedBoxGeometry(0.32, 0.2, bulk, 3, 0.03);
  chest.translate(0, 0.15, 0);
  const waist = new RoundedBoxGeometry(0.25, 0.15, bulk * 0.88, 2, 0.025);
  waist.translate(0, -0.01, 0);
  const hip = new RoundedBoxGeometry(0.27, 0.09, bulk * 0.85, 2, 0.02);
  hip.translate(0, -0.12, 0);
  g.add(mesh(merge([chest, waist, hip]), M.primary));

  // Яка — пръстен на врата.
  g.add(mesh(xf(new THREE.TorusGeometry(0.085, 0.011, 8, 20), [0, 0.245, 0], [Math.PI / 2, 0, 0]), M.trim));

  // Рамене (pauldrons) — прилепнали закръглени капачки на раменната линия, не летящи топки.
  g.add(mesh(merge([
    xf(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), [-0.185, 0.235, 0], [0.15, 0, Math.PI * 0.08]),
    xf(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), [0.185, 0.235, 0], [0.15, 0, -Math.PI * 0.08]),
  ]), M.secondary));

  // Колан на талията + катарама + централен кант.
  g.add(mesh(xf(new THREE.CylinderGeometry(0.128, 0.132, 0.032, 20), [0, -0.07, 0]), M.trim));
  g.add(mesh(merge([
    xf(new THREE.BoxGeometry(0.018, 0.4, bulk + 0.005), [0, 0.05, 0]),
    xf(new RoundedBoxGeometry(0.045, 0.045, bulk + 0.012, 2, 0.006), [0, -0.07, 0]),
  ]), M.trim));

  return g;
}

function robe(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.02, -0.5], [0.16, -0.3], [0.18, -0.05], [0.15, 0.15], [0.1, 0.28]];
  g.add(mesh(lathe(P as [number, number][], 28, -0.9, Math.PI * 2 - 1.8), M.primary));
  g.add(mesh(xf(new THREE.TorusGeometry(0.16, 0.012, 8, 32), [0, 0.28, 0], [Math.PI / 2, 0, 0]), M.trim));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.145, 0.155, 0.03, 24), [0, -0.02, 0]), M.trim));
  return g;
}

export function buildTorso(M: Record<Role, THREE.Material>, theme: ItemTheme, tier: number): THREE.Object3D {
  if (theme.family === 'cloth' || theme.family === 'void' || theme.family === 'arcane') return robe(M);
  return plateChest(M, tier);
}
