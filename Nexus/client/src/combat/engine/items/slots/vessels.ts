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
  // мехурчета във течността + ярък спекуларен отблясък (мек правоъгълен софтбокс) по лявата стена
  const bub = new THREE.Group();
  const bm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2; const r = 0.012 + rand() * 0.02; const y = 0.02 + rand() * 0.05;
    bub.add(mesh(xf(new THREE.SphereGeometry(0.0016 + rand() * 0.0034, 12, 8), [Math.cos(a) * r, y, Math.sin(a) * r]), bm));
  }
  g.add(bub);
  const hl = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), transparent: true, opacity: 0.6, depthWrite: false });
  const strip = new THREE.CapsuleGeometry(0.003, 0.034, 4, 8);
  g.add(mesh(xf(strip, [-0.034, 0.06, 0.035], [0.1, 0.5, 0.3]), hl, { cast: false }));
  g.add(mesh(xf(new THREE.SphereGeometry(0.0034, 10, 8), [-0.018, 0.092, 0.03]), hl, { cast: false }));
  g.rotation.z = (rand() - 0.5) * 0.08;
  return collect(g);
}

/** Камък: тир → размер/шлифовка (1–3 брилянт, 4–6 емеральд, 7–10 удължен кристален гроздов). */
export function buildGemstone(gem: THREE.Material, tier: number, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const spark = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9, 9) });
  // искри върху реални върхове на камъка (горната половина), не във въздуха
  const sparks = (mesh0: THREE.Mesh, n: number, r = 0.0026): void => {
    const p = mesh0.geometry.attributes.position; let top = -1e9;
    for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
    for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
      const i = Math.floor(rand() * p.count);
      if (p.getY(i) < top * 0.55) continue;
      g.add(mesh(xf(new THREE.SphereGeometry(r * (0.6 + rand() * 0.8), 8, 6), [p.getX(i), p.getY(i), p.getZ(i)]), spark, { cast: false })); k++;
    }
  };
  const s = 0.9 + tier * 0.06;
  if (tier <= 3) {
    const m1 = mesh(xf(brilliant(0.026 * s, 0.042 * s, 12), [0, 0, 0], [0.3, 0, 0.2]), gem);
    g.add(m1);
    sparks(m1, 4);
  } else if (tier <= 6) {
    const m2 = mesh(xf(elongated(0.024 * s, 0.04 * s, 1.5, 12), [0, 0, 0], [0.4, 0.4, 0.1]), gem);
    g.add(m2);
    sparks(m2, 4);
  } else {
    for (let i = 0; i < 5; i++) {
      const h = 0.05 + rand() * 0.04 + tier * 0.002;
      const c = new THREE.CylinderGeometry(0.009, 0.012, h, 6);
      const tip = new THREE.ConeGeometry(0.009, 0.014, 6); tip.translate(0, h / 2 + 0.007, 0);
      const k = merge([c, tip]);
      const mc = mesh(xf(k, [(i - 2) * 0.016, h / 2, (rand() - 0.5) * 0.02], [(rand() - 0.5) * 0.4, rand() * 3, (i - 2) * 0.12]), gem);
      g.add(mc);
      sparks(mc, 1, 0.0022);
    }
  }
  return collect(g);
}
