// 4a.4 (Nexus порт, НЕ част от оригиналния boy) — снаряди за далечни атаки (маг/жезъл,
// стрелец/лък). Малък пул (MAX едновременни, рундовете са последователни — никога не изчерпва
// се), обикновени THREE материали (не TSL — единичен светещ обект не оправдава node-граф).
// Контактът (кога пада числото на щетата) идва от choreo-gen EVENTS 'roundmark' в момента на
// ПОПАДЕНИЕ, зададен от избраната продължителност на полета — НЕ от IK/blade близост.
import * as THREE from 'three/webgpu';

const MAX = 6;

export function createProjectiles() {
  const group = new THREE.Group();
  const pool = [];
  const geoHead = new THREE.SphereGeometry(0.07, 12, 10);
  const geoGlint = new THREE.SphereGeometry(0.03, 8, 6); // 4a.4-fix: малка светла точка на върха на стрелата — четимо на тъмна сцена
  const geoArrow = new THREE.CylinderGeometry(0.012, 0.024, 0.5, 6, 1, true);
  for (let i = 0; i < MAX; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const tailMat = mat.clone();
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const head = new THREE.Mesh(geoHead, mat);
    const arrow = new THREE.Mesh(geoArrow, tailMat);
    const glint = new THREE.Mesh(geoGlint, glintMat); // бял връх — вижда се и на 'arrow', не само 'bolt'
    const light = new THREE.PointLight(0xffffff, 0, 5, 2);
    const g = new THREE.Group();
    g.add(head, arrow, glint, light);
    g.visible = false;
    group.add(g);
    pool.push({ g, head, arrow, glint, mat, tailMat, glintMat, light, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 1, shape: 'bolt' });
  }
  let next = 0;

  /** shape: 'bolt' (магически снаряд — светеща сфера) | 'arrow' (стрела — само стреловидно тяло). */
  function spawn(from, to, t0, dur, color = 0xffffff, shape = 'bolt') {
    const p = pool[next++ % MAX];
    p.from.copy(from);
    p.to.copy(to);
    p.t0 = t0;
    p.dur = Math.max(0.05, dur);
    p.shape = shape;
    p.active = true;
    p.mat.color.set(color);
    p.tailMat.color.set(color);
    p.light.color.set(color);
    p.head.visible = shape === 'bolt';
    p.light.intensity = 0;
    return p;
  }

  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  function update(T) {
    for (const p of pool) {
      if (!p.active) continue;
      const u = (T - p.t0) / p.dur;
      if (u < 0 || u >= 1) {
        p.g.visible = false;
        p.light.intensity = 0;
        if (u >= 1) p.active = false;
        continue;
      }
      p.g.visible = true;
      // Лека дъга (не права линия) — по-жив полет; височината расте с дистанцията.
      const arcH = Math.min(0.3, p.from.distanceTo(p.to) * 0.06);
      const arc = Math.sin(u * Math.PI) * arcH;
      p.g.position.lerpVectors(p.from, p.to, u).addScaledVector(up, arc);
      dir.subVectors(p.to, p.from).normalize();
      const fade = Math.min(1, u * 8) * Math.min(1, (1 - u) * 10 + 0.25);
      p.mat.opacity = fade;
      p.tailMat.opacity = fade * (p.shape === 'arrow' ? 0.95 : 0.5);
      p.glintMat.opacity = fade;
      p.arrow.position.copy(dir).multiplyScalar(-0.21);
      p.glint.position.copy(dir).multiplyScalar(0.12);
      q.setFromUnitVectors(up, dir);
      p.arrow.quaternion.copy(q);
      // 4a.4-fix: стрелата беше твърде тъмна на нощна сцена (докладвано при преглед) —
      // светлината ѝ вдигната ~3.6× (0.5→1.8), плюс глинт-точката за силует дори без светене.
      p.light.intensity = p.shape === 'bolt' ? 3.2 * fade : 1.8 * fade;
    }
  }

  return { group, spawn, update };
}
