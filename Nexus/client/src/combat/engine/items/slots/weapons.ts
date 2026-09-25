// Оръжия по sub_type: меч/брадва/боздуган/кама/лък/жезъл/копие. Остриета през ExtrudeGeometry
// (плосък 2D профил → дебелина) — чист, различим силует за всеки тип, олекотен спрямо boy/weapons.js
// (там острието следва цял скелет на боец; тук предметът стои сам, за икона/преглед/бъдещо обличане).
import * as THREE from 'three/webgpu';
import { mesh, merge, xf } from '../geoHelpers';
import type { ItemTheme } from '../theme';
import type { Rand } from '../rng';
import type { Role } from '../materials';

function bladeShape(len: number, baseW: number, tipW: number, taperFrom: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-baseW / 2, 0);
  s.lineTo(baseW / 2, 0);
  s.lineTo(baseW / 2, len * taperFrom);
  s.lineTo(tipW / 2, len);
  s.lineTo(-tipW / 2, len);
  s.lineTo(-baseW / 2, len * taperFrom);
  s.closePath();
  return s;
}

function extrudedBlade(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function grip(len: number, r: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r * 1.05, len, 12);
}

function sword(M: Record<Role, THREE.Material>, tier: number, rand: Rand): THREE.Object3D {
  const long = tier >= 5;
  const len = long ? 0.72 : 0.56;
  const baseW = 0.038 + rand() * 0.014;
  const g = new THREE.Group();
  g.add(mesh(xf(extrudedBlade(bladeShape(len, baseW, 0.006, 0.75), 0.008), [0, 0.06, 0]), M.trim));
  g.add(mesh(xf(new THREE.BoxGeometry(0.14 + rand() * 0.05, 0.022, 0.03), [0, 0.05, 0]), M.secondary));
  g.add(mesh(xf(grip(0.13, 0.014), [0, -0.02, 0]), M.primary));
  const pommel = rand() > 0.5
    ? new THREE.SphereGeometry(0.024, 12, 10)
    : new THREE.OctahedronGeometry(0.026, 0);
  g.add(mesh(xf(pommel, [0, -0.09, 0]), M.secondary));
  return g;
}

function dagger(M: Record<Role, THREE.Material>, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const baseW = 0.026 + rand() * 0.012;
  g.add(mesh(xf(extrudedBlade(bladeShape(0.22, baseW, 0.004, 0.6), 0.006), [0, 0.03, 0]), M.trim));
  g.add(mesh(xf(new THREE.BoxGeometry(0.06, 0.014, 0.02), [0, 0.02, 0]), M.secondary));
  g.add(mesh(xf(grip(0.09, 0.011), [0, -0.03, 0]), M.primary));
  return g;
}

function axe(M: Record<Role, THREE.Material>, tier: number, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const haftLen = 0.55 + (tier >= 6 ? 0.15 : 0);
  g.add(mesh(grip(haftLen, 0.013), M.primary));
  const head = new THREE.Shape();
  head.moveTo(0, -0.06);
  head.quadraticCurveTo(0.14, -0.02, 0.16, 0.06);
  head.quadraticCurveTo(0.1, 0.1, 0, 0.08);
  head.closePath();
  const headMesh = mesh(xf(extrudedBlade(head, 0.03), [0, haftLen / 2 - 0.05, 0], [0, 0, 0]), M.trim);
  g.add(headMesh);
  if (rand() > 0.5) {
    const back = new THREE.Shape();
    back.moveTo(0, -0.06);
    back.quadraticCurveTo(-0.1, -0.02, -0.1, 0.05);
    back.quadraticCurveTo(-0.06, 0.08, 0, 0.08);
    back.closePath();
    g.add(mesh(xf(extrudedBlade(back, 0.03), [0, haftLen / 2 - 0.05, 0]), M.trim));
  }
  g.add(mesh(xf(new THREE.SphereGeometry(0.018, 10, 8), [0, -haftLen / 2, 0]), M.secondary));
  return g;
}

function mace(M: Record<Role, THREE.Material>, tier: number, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const haftLen = 0.5;
  g.add(mesh(grip(haftLen, 0.014), M.primary));
  const headY = haftLen / 2 - 0.03;
  const flangeN = 5 + Math.floor(Math.min(3, tier / 3));
  const flanges: THREE.BufferGeometry[] = [];
  for (let i = 0; i < flangeN; i++) {
    const a = (i / flangeN) * Math.PI * 2;
    flanges.push(xf(new THREE.BoxGeometry(0.012, 0.09, 0.03), [Math.cos(a) * 0.045, headY, Math.sin(a) * 0.045], [0, a, 0]));
  }
  g.add(mesh(merge(flanges), M.trim));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12), [0, headY, 0]), M.secondary));
  if (rand() > 0.5) g.add(mesh(xf(new THREE.ConeGeometry(0.016, 0.03, 6), [0, headY + 0.06, 0]), M.trim));
  return g;
}

function spear(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const haftLen = 0.9;
  g.add(mesh(grip(haftLen, 0.011), M.primary));
  g.add(mesh(xf(extrudedBlade(bladeShape(0.22, 0.05, 0.004, 0.35), 0.01), [0, haftLen / 2, 0]), M.trim));
  g.add(mesh(xf(new THREE.ConeGeometry(0.014, 0.03, 8), [0, -haftLen / 2, 0], [Math.PI, 0, 0]), M.secondary));
  return g;
}

function bow(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.08, -0.2, 0), new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.08, 0.2, 0), new THREE.Vector3(0, 0.4, 0),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 48, 0.012, 8, false), M.primary));
  const stringPts = [new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, 0.4, 0)];
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stringPts), 24, 0.002, 5, false), M.secondary));
  g.add(mesh(xf(new THREE.SphereGeometry(0.016, 8, 6), [0, -0.4, 0]), M.trim));
  g.add(mesh(xf(new THREE.SphereGeometry(0.016, 8, 6), [0, 0.4, 0]), M.trim));
  return g;
}

function staff(M: Record<Role, THREE.Material>, theme: ItemTheme): THREE.Object3D {
  const g = new THREE.Group();
  const haftLen = 0.85;
  g.add(mesh(grip(haftLen, 0.013), M.primary));
  const gem = mesh(xf(new THREE.IcosahedronGeometry(0.05, 1), [0, haftLen / 2 + 0.03, 0]), M.trim);
  g.add(gem);
  const claws: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    claws.push(xf(new THREE.ConeGeometry(0.006, 0.05, 6), [Math.cos(a) * 0.03, haftLen / 2 - 0.01, Math.sin(a) * 0.03], [0.5, a, 0]));
  }
  g.add(mesh(merge(claws), M.secondary));
  void theme;
  return g;
}

export function buildWeapon(M: Record<Role, THREE.Material>, theme: ItemTheme, subType: string, tier: number, rand: Rand): THREE.Object3D {
  switch (subType) {
    case 'axe': return axe(M, tier, rand);
    case 'mace': return mace(M, tier, rand);
    case 'dagger': return dagger(M, rand);
    case 'bow': return bow(M);
    case 'staff': return staff(M, theme);
    case 'spear': return spear(M);
    case 'sword':
    default:
      return sword(M, tier, rand);
  }
}
