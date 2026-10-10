// Фасетирани камъни и обков за украсите (пръстен/амулет/корона/…): всички с плоски нормали,
// за да се чупи светлината по ръбовете като при шлифован камък. Размерите са в метри.
import * as THREE from 'three/webgpu';

/** Брилянтна шлифовка: корона + павилион, `segs` фасети; `r` радиус на пояса, `h` обща височина. */
export function brilliant(r: number, h: number, segs = 8): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [[0, h * 0.62], [r * 0.55, h * 0.62], [r, h * 0.42], [r * 0.98, h * 0.36], [0, 0]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

/** Продълговат (емеральд/сълза) камък — изопната брилянтна шлифовка по една ос. */
export function elongated(r: number, h: number, stretch = 1.7, segs = 8): THREE.BufferGeometry {
  const g = brilliant(r, h, segs);
  g.scale(1, 1, stretch);
  g.computeVertexNormals();
  return g;
}

/** Кабошон (гладък купол) — за очи/ядра. */
export function cabochon(r: number, squash = 0.6): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, squash, 1);
  return g;
}

/** Кичури на чашка: n щифта около камък с радиус r на височина y. */
export function prongs(r: number, n: number, y: number, thick: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const c = new THREE.CapsuleGeometry(thick, r * 0.5, 4, 8);
    c.rotateZ(-0.25);
    c.rotateY(-a);
    c.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    out.push(c);
  }
  return out;
}

/** Верига: `n` звена по затворена/отворена крива; редуващи се завъртания на 90°. */
export function chainAlong(curve: THREE.Curve<THREE.Vector3>, n: number, linkR: number, tube: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const g = new THREE.TorusGeometry(linkR, tube, 8, 18);
    g.scale(1.45, 1, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan);
    const roll = new THREE.Quaternion().setFromAxisAngle(tan, i % 2 ? Math.PI / 2 : 0);
    g.applyQuaternion(roll.multiply(q));
    g.translate(p.x, p.y, p.z);
    out.push(g);
  }
  void up;
  return out;
}
