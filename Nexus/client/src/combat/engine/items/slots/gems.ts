// Фасетирани камъни и обков за украсите (пръстен/амулет/корона/…): всички с плоски нормали,
// за да се чупи светлината по ръбовете като при шлифован камък. Размерите са в метри.
import * as THREE from 'three/webgpu';

/** Брилянтна шлифовка: маса, звезда, скос, пояс, висок павилион и калет — профил с 9 пръстена × `segs`
 *  сегмента (≈ 3 редици фасети на половина), с огънато завъртане на всеки втори пръстен за
 *  „кайт/звезда" фасети. ~ 30+ фасети при segs ≥ 12. */
export function brilliant(r: number, h: number, segs = 16): THREE.BufferGeometry {
  const prof: Array<[number, number, number]> = [
    [0, h * 0.64, 0], [r * 0.52, h * 0.64, 0], [r * 0.7, h * 0.58, 0.5], [r * 0.92, h * 0.5, 0], [r, h * 0.42, 0.5],
    [r * 0.99, h * 0.38, 0], [r * 0.62, h * 0.18, 0.5], [r * 0.3, h * 0.06, 0], [0, 0, 0],
  ];
  const n = Math.max(segs, 16);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < prof.length; i++) {
    for (let j = 0; j < n; j++) {
      const a = ((j + prof[i][2]) / n) * Math.PI * 2;
      pos.push(Math.sin(a) * prof[i][0], prof[i][1], Math.cos(a) * prof[i][0]);
    }
  }
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j; const b = i * n + ((j + 1) % n); const c = (i + 1) * n + j; const d = (i + 1) * n + ((j + 1) % n);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
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
