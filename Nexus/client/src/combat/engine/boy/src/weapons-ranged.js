// 4a.4 (Nexus порт, НЕ част от оригиналния boy) — далечни оръжия (маг/жезъл, стрелец/лък) и
// разбойническия къс меч, в СЪЩАТА конвенция като weapons.js: произход = хватката, +Y по
// дължината, +X "истинският ръб" (тук по-скоро условен — жезълът/лъкът нямат острие, но
// fighter.js очаква bladeBase/bladeLen за IK и disarm-полета, затова числата остават смислени
// геометрични мерки дори без сеч). Контактът за далечни атаки НЕ идва от тези мерки — виж
// ranged.js/choreo-gen-attack.js (снарядът е отделна система).
import * as THREE from 'three';
import { lathe, xf, merge, mesh, flatten } from './geo.js';

// Разбойник: по-къс едноръчен меч, хваната двуръчно като Ser Aldric (без отделна лява IK цел —
// виж fighter.js `this.shield` клона). Камата на кръста е СЪЗНАТЕЛНО пропусната този кръг
// (иска котва на бедрото в rig.js, не е закачена — козметичен пропуск, не грешка).
export function shortSword(M) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const len = 0.58;
  g.add(mesh(lathe([[0, 0], [0.02, len * 0.06], [0.024, len * 0.5], [0.014, len * 0.85], [0, len]], 20), M.bladeDark));
  g.add(mesh(merge([
    xf(new THREE.CylinderGeometry(0.007, 0.008, 0.16, 10), [0, 0.036, 0], [0, 0, Math.PI / 2]),
    xf(new THREE.SphereGeometry(0.018, 12, 10), [0, 0.04, 0]),
  ]), M.goldB));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.011, 0.0115, 0.1, 12), [0, -0.02, 0], [0, 0, 0], [1.15, 1, 1]), M.leather));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(g), bladeBase: 0.0, bladeLen: len };
}

// Маг: дървена дръжка + светещо връхче (M.blade — loadout.js вече го тонира по клас/тема, така
// че жезълът автоматично носи тона на заклинанието без отделна материя тук).
export function staff(M) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const len = 1.08;
  g.add(mesh(xf(new THREE.CylinderGeometry(0.014, 0.019, len - 0.09, 14), [0, (len - 0.09) / 2 - 0.02, 0]), M.wood));
  g.add(mesh(xf(new THREE.TorusGeometry(0.021, 0.006, 8, 20), [0, len - 0.11, 0], [Math.PI / 2, 0, 0]), M.brass));
  g.add(mesh(xf(new THREE.IcosahedronGeometry(0.052, 1), [0, len - 0.035, 0]), M.blade));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.016, 0.02, 0.1, 12), [0, -0.02, 0], [0, 0, 0], [1.1, 1, 1]), M.leather));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(g), bladeBase: -0.1, bladeLen: len - 0.1 };
}

// Стрелец: дъга от лък (TubeGeometry по крива) + тетива. bladeBase/bladeLen отразяват
// вертикалния обхват на лъка (за bladeTip следата/disarm полета — не за контакт).
export function bow(M) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.5, 0.09), new THREE.Vector3(0, -0.26, -0.015),
    new THREE.Vector3(0, 0, -0.03), new THREE.Vector3(0, 0.26, -0.015), new THREE.Vector3(0, 0.5, 0.09),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 44, 0.0135, 8, false), M.wood));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.0022, 0.0022, 0.985, 6), [0, 0, 0.088], [0.09, 0, 0]), M.leather));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.017, 0.019, 0.15, 10), [0, 0, -0.01]), M.leather));
  g.add(mesh(xf(new THREE.TorusGeometry(0.0145, 0.004, 6, 12), [0, 0.5, 0.09], [Math.PI / 2, 0, 0]), M.brass));
  g.add(mesh(xf(new THREE.TorusGeometry(0.0145, 0.004, 6, 12), [0, -0.5, 0.09], [Math.PI / 2, 0, 0]), M.brass));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(g), bladeBase: -0.5, bladeLen: 1.0 };
}

// Орк/трол — по-тежко едноръчно оръжие (боздуган); силуетът, не тонирането, носи "тежкия" вид.
export function mace(M) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const len = 0.72;
  const spikes = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2;
    return xf(new THREE.ConeGeometry(0.016, 0.075, 6), [Math.cos(a) * 0.058, len - 0.09, Math.sin(a) * 0.058], [0, 0, 0]);
  });
  g.add(mesh(merge([
    xf(new THREE.SphereGeometry(0.07, 16, 12), [0, len - 0.09, 0]),
    ...spikes,
  ]), M.steelB));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.017, 0.021, len - 0.16, 12), [0, (len - 0.16) / 2 - 0.02, 0]), M.iron));
  g.add(mesh(xf(new THREE.CylinderGeometry(0.021, 0.025, 0.1, 12), [0, -0.03, 0], [0, 0, 0], [1.1, 1, 1]), M.leather));
  return { part: { matrix: new THREE.Matrix4() }, pieces: flatten(g), bladeBase: 0.0, bladeLen: len };
}
