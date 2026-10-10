// Отвари (стъкленица с течност, корк, восъчен печат) и скъпоценни камъци — общите предмети от
// магазина/наградите, които не са в каталога на екипировката (потион-*, gem-t*).
import * as THREE from 'three/webgpu';
import { lathe, merge, xf, mesh, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';
import type { Rand } from '../rng';
import { brilliant, elongated } from './gems';

type Pieces = [THREE.BufferGeometry, THREE.Material][];

function collect(g: THREE.Group): THREE.Object3D {
  g.updateMatrixWorld(true);
  const out = new THREE.Group();
  for (const [geo, mat] of flatten(g) as Pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}

export interface VesselMats { glass: THREE.Material; liquid: THREE.Material; cork: THREE.Material; wax: THREE.Material }

/** Стъкленица: колба + дълго гърло; течността е малко по-малък лате с емисия; корк и печат отгоре. */
export function buildPotion(M: BoyMaterials, mats: VesselMats, shape: number, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const outer = shape === 1
    ? [[0, 0], [0.036, 0.002], [0.05, 0.02], [0.048, 0.06], [0.03, 0.09], [0.016, 0.105], [0.0155, 0.15], [0.02, 0.158], [0.019, 0.162]]
    : [[0, 0], [0.03, 0.002], [0.046, 0.016], [0.052, 0.045], [0.046, 0.075], [0.022, 0.105], [0.0145, 0.125], [0.0145, 0.16], [0.019, 0.168], [0.018, 0.172]];
  g.add(mesh(lathe(outer, 48), mats.glass));
  const inner = outer.slice(0, shape === 1 ? 5 : 5).map(([r, y]) => [Math.max(0, r - 0.0035), Math.max(0.003, y)]);
  inner.push([0, inner[inner.length - 1][1] + 0.0004]);
  g.add(mesh(lathe(inner, 40), mats.liquid));
  g.add(mesh(lathe([[0.0, 0.156], [0.013, 0.157], [0.0155, 0.17], [0.014, 0.19], [0.0, 0.19]], 24), mats.cork));
  g.add(mesh(merge([xf(new THREE.TorusGeometry(0.017, 0.0022, 8, 28), [0, 0.164, 0], [Math.PI / 2, 0, 0]), xf(new THREE.SphereGeometry(0.0075, 12, 8), [0.016, 0.158, 0.003], [0, 0, 0], [1, 0.6, 1]), xf(new THREE.SphereGeometry(0.006, 12, 8), [0.0155, 0.14, 0.004], [0, 0, 0], [1, 1.6, 0.8])]), mats.wax));
  g.add(mesh(xf(new THREE.TorusGeometry(0.0135, 0.0016, 6, 24), [0, 0.128, 0], [Math.PI / 2, 0, 0]), M.goldB));
  g.rotation.z = (rand() - 0.5) * 0.08;
  return collect(g);
}

/** Камък: тир → размер/шлифовка (1–3 брилянт, 4–6 емеральд, 7–10 удължен кристален гроздов). */
export function buildGemstone(gem: THREE.Material, tier: number, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const s = 0.9 + tier * 0.06;
  if (tier <= 3) g.add(mesh(xf(brilliant(0.026 * s, 0.042 * s, 8), [0, 0, 0], [0.3, 0, 0.2]), gem));
  else if (tier <= 6) g.add(mesh(xf(elongated(0.024 * s, 0.04 * s, 1.5, 8), [0, 0, 0], [0.4, 0.4, 0.1]), gem));
  else {
    for (let i = 0; i < 5; i++) {
      const h = 0.05 + rand() * 0.04 + tier * 0.002;
      const c = new THREE.CylinderGeometry(0.009, 0.012, h, 6);
      const tip = new THREE.ConeGeometry(0.009, 0.014, 6); tip.translate(0, h / 2 + 0.007, 0);
      const k = merge([c, tip]);
      g.add(mesh(xf(k, [(i - 2) * 0.016, h / 2, (rand() - 0.5) * 0.02], [(rand() - 0.5) * 0.4, rand() * 3, (i - 2) * 0.12]), gem));
    }
  }
  return collect(g);
}
