/**
 * CombatSpectacle — AAA боен спектакъл слой за Nexus (WebGL2 path, зад !lite).
 *
 * Три самостоятелни, pool-нати ефекта, нула per-frame alloc:
 *   1) WeaponTrail  — ribbon lента по замаха на оръжието (base+tip).
 *   2) ImpactVFX    — shockwave ring + dome + spark burst + ground scorch (pool 4).
 *   3) HitFlash     — emissive пулс върху ударения риг, без да чупи материалите.
 *
 * Мащаб: бойци x=±2.2, крака y=0, ръст ~2.4, земя y=0. Всичко additive/bloom-safe
 * (depthWrite off). Никакви текстурни файлове — процедурни canvas текстури.
 *
 * ВАЖНО: не добавяй тези обекти в CombatScene3D.fxGroup — неговият tick фейдва
 * деца по userData.kind. Подай `scene` или собствен THREE.Group.
 */

import * as THREE from 'three';

/* ─────────── Класови палитри (по клас на бойеца) ─────────── */
// warrior стомана/оранж, mage арканно синьо-виолет, ranger зелено, rogue пурпур.
export const SPECTACLE_COLORS: Record<string, number> = {
  warrior: 0xffb347, // топла стомана/оранж
  mage:    0x8a6bff, // арканно синьо-виолет
  ranger:  0x57e08a, // зелено
  rogue:   0xc23bff, // пурпур
};

/* ─────────── Модул-скоуп scratch (споделен, нула alloc в update) ─────────── */
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _colScratch = new THREE.Color();

/* ══════════════════════════════════════════════════════════════════════════
 * 1) WeaponTrail — ribbon лента по замаха.
 *    Ring-buffer от N сегмента (2 точки: base на костта + tip на острието).
 *    Всеки кадър при active добавя сегмент; фейд по възраст; адитивен градиент
 *    от горещо ядро (към бяло) към класовия цвят по дължина.
 * ═════════════════════════════════════════════════════════════════════════ */
export class WeaponTrail {
  private readonly N: number;          // брой сегменти в лентата
  private readonly maxAge: number;     // живот на сегмент (сек) → дължина на следата
  private parent: THREE.Object3D;
  private mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  // Ring buffer с историята на сегментите.
  private baseX: Float32Array; private baseY: Float32Array; private baseZ: Float32Array;
  private tipX: Float32Array;  private tipY: Float32Array;  private tipZ: Float32Array;
  private age: Float32Array;
  private head = 0;   // индекс на най-новия сегмент
  private count = 0;  // живи сегменти (<= N)

  // GPU буфери (предалокирани).
  private posAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;

  /**
   * @param scene родителят (scene или собствен Group — НЕ fxGroup)
   * @param color класов цвят (виж SPECTACLE_COLORS)
   * @param opts.segments брой сегменти (default 24), opts.maxAge живот (default 0.18с)
   */
  constructor(
    scene: THREE.Object3D,
    color: number,
    opts?: { segments?: number; maxAge?: number },
  ) {
    this.parent = scene;
    this.N = Math.max(4, opts?.segments ?? 24);
    this.maxAge = opts?.maxAge ?? 0.18;

    const N = this.N;
    this.baseX = new Float32Array(N); this.baseY = new Float32Array(N); this.baseZ = new Float32Array(N);
    this.tipX = new Float32Array(N);  this.tipY = new Float32Array(N);  this.tipZ = new Float32Array(N);
    this.age = new Float32Array(N);

    // 2 върха на сегмент (base, tip).
    const verts = N * 2;
    const positions = new Float32Array(verts * 3);
    const alphas = new Float32Array(verts);
    const grad = new Float32Array(verts); // 0 = най-нов (глава), 1 = най-стар (опашка)
    for (let i = 0; i < N; i++) {
      const g = i / (N - 1);
      grad[i * 2] = g; grad[i * 2 + 1] = g;
    }

    // Индекси на strip-a: quad между сегмент i и i+1 (построени веднъж).
    const indices: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }

    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aAlpha', this.alphaAttr);
    this.geo.setAttribute('aGrad', new THREE.BufferAttribute(grad, 1));
    this.geo.setIndex(indices);
    this.geo.setDrawRange(0, 0); // празно докато няма сегменти

    // Горещо ядро (към бяло) → класов цвят по дължина.
    const cool = new THREE.Color(color);
    const hot = cool.clone().lerp(new THREE.Color(0xffffff), 0.6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uHot: { value: new THREE.Vector3(hot.r, hot.g, hot.b) },
        uCool: { value: new THREE.Vector3(cool.r, cool.g, cool.b) },
        uOpacity: { value: 1.0 },
      },
      vertexShader: /* glsl */`
        attribute float aAlpha;
        attribute float aGrad;
        varying float vAlpha;
        varying float vGrad;
        void main() {
          vAlpha = aAlpha; vGrad = aGrad;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 uHot; uniform vec3 uCool; uniform float uOpacity;
        varying float vAlpha; varying float vGrad;
        void main() {
          vec3 c = mix(uHot, uCool, vGrad);
          gl_FragColor = vec4(c, vAlpha * uOpacity);
        }`,
      transparent: true,
      depthWrite: false,       // bloom-safe
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false; // лентата се движи бързо извън bbox-а
    this.mesh.renderOrder = 5;
    this.parent.add(this.mesh);
  }

  /**
   * Всеки кадър. При active добавя нов сегмент от подадените световни точки.
   * basePos = позиция на оръжейната кост, tipPos = върха на острието.
   * При !active сегментите просто фейдват (лентата се разсейва естествено).
   */
  update(basePos: THREE.Vector3, tipPos: THREE.Vector3, dt: number, active: boolean): void {
    const N = this.N;

    // 1) остарявай живите сегменти.
    for (let i = 0; i < N; i++) this.age[i] += dt;

    // 2) добави нов сегмент на главата при active.
    if (active) {
      this.head = (this.head + 1) % N;
      const h = this.head;
      this.baseX[h] = basePos.x; this.baseY[h] = basePos.y; this.baseZ[h] = basePos.z;
      this.tipX[h] = tipPos.x;   this.tipY[h] = tipPos.y;   this.tipZ[h] = tipPos.z;
      this.age[h] = 0;
      if (this.count < N) this.count++;
    }

    // 3) построй върховете от глава (най-нов) към опашка (най-стар).
    const pos = this.posAttr.array as Float32Array;
    const alpha = this.alphaAttr.array as Float32Array;
    let live = 0;
    // последна валидна точка (за колапс на неизползваните върхове)
    let lbx = 0, lby = 0, lbz = 0, ltx = 0, lty = 0, ltz = 0;
    for (let i = 0; i < N; i++) {
      const vBase = i * 2 * 3, vTip = (i * 2 + 1) * 3, ai = i * 2;
      if (i < this.count) {
        const seg = (this.head - i + N) % N;
        const a = 1 - this.age[seg] / this.maxAge;
        lbx = this.baseX[seg]; lby = this.baseY[seg]; lbz = this.baseZ[seg];
        ltx = this.tipX[seg];  lty = this.tipY[seg];  ltz = this.tipZ[seg];
        pos[vBase] = lbx; pos[vBase + 1] = lby; pos[vBase + 2] = lbz;
        pos[vTip] = ltx;  pos[vTip + 1] = lty;  pos[vTip + 2] = ltz;
        const av = a > 0 ? a : 0;
        alpha[ai] = av; alpha[ai + 1] = av;
        if (av > 0) live = i + 1; // докъде има видима лента
      } else {
        // колапсирай към последната валидна точка (дегенерирал триъгълник, alpha 0)
        pos[vBase] = lbx; pos[vBase + 1] = lby; pos[vBase + 2] = lbz;
        pos[vTip] = ltx;  pos[vTip + 1] = lty;  pos[vTip + 2] = ltz;
        alpha[ai] = 0; alpha[ai + 1] = 0;
      }
    }

    // 4) drawRange само до последния видим сегмент (спестява GPU при къса лента).
    this.geo.setDrawRange(0, Math.max(0, (live - 1) * 6));
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  /** Глобален множител на прозрачност (напр. затихване при lite/пауза). */
  setOpacity(o: number): void { this.mat.uniforms.uOpacity.value = o; }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2) ImpactVFX — пакет за попадение с pool от N=4 едновременни.
 *    (а) shockwave ring + вертикален dome пулс
 *    (б) spark burst — собствена мини линейна система (НЕ пипа particle pool-а)
 *    (в) ground scorch — тъмен decal кръг, фейд ~2s
 * ═════════════════════════════════════════════════════════════════════════ */

const SPARKS = 40;              // макс искри на слот (20..40 активни по power)
const GROUND_Y = 0.02;          // над земята, да не z-fight-ва
const RING_LIFE = 0.55;
const DOME_LIFE = 0.35;
const SPARK_LIFE = 0.55;
const SCORCH_LIFE = 2.0;

interface ImpactSlot {
  active: boolean;
  t: number;
  color: number;
  power: number;
  ring: THREE.Mesh;
  dome: THREE.Mesh;
  sparks: THREE.LineSegments;
  sparkPos: Float32Array;   // текуща позиция на всяка искра (SPARKS*3)
  sparkVel: Float32Array;   // скорост (SPARKS*3)
  activeSparks: number;
  scorch: THREE.Mesh;
}

export class ImpactVFX {
  private parent: THREE.Object3D;
  private slots: ImpactSlot[] = [];
  private scorchTex: THREE.CanvasTexture;

  constructor(scene: THREE.Object3D, poolSize = 4) {
    this.parent = scene;
    this.scorchTex = makeScorchTexture();
    for (let i = 0; i < poolSize; i++) this.slots.push(this.buildSlot());
  }

  private buildSlot(): ImpactSlot {
    // (а) shockwave ring — тънък пръстен, лежи хоризонтално.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 48),
      new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false; ring.renderOrder = 4;

    // dome — отворена отдолу полусфера, пулсира нагоре.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, wireframe: false,
      }),
    );
    dome.visible = false; dome.renderOrder = 4;

    // (б) spark burst — една LineSegments, 2 върха на искра (глава+опашка).
    const sg = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS * 3);
    const linePos = new Float32Array(SPARKS * 2 * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.LineSegments(
      sg,
      new THREE.LineBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sparks.frustumCulled = false; sparks.visible = false; sparks.renderOrder = 6;

    // (в) ground scorch — тъмен decal.
    const scorch = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.scorchTex, transparent: true, opacity: 0, depthWrite: false,
        color: 0x1a1008, blending: THREE.NormalBlending,
      }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.visible = false; scorch.renderOrder = 2;

    this.parent.add(ring, dome, sparks, scorch);
    return {
      active: false, t: 0, color: 0xffffff, power: 1,
      ring, dome, sparks, sparkPos, sparkVel, activeSparks: SPARKS, scorch,
    };
  }

  /** Пусни попадение. Взима свободен слот; ако няма — рециклира най-стария. */
  spawn(pos: THREE.Vector3, color: number, power: number): void {
    const p = Math.max(0, Math.min(1, power));
    let slot = this.slots.find((s) => !s.active);
    if (!slot) slot = this.slots.reduce((a, b) => (a.t >= b.t ? a : b));

    slot.active = true; slot.t = 0; slot.color = color; slot.power = p;
    _colScratch.set(color);

    // ground обекти на земята под точката на попадение.
    slot.ring.position.set(pos.x, GROUND_Y, pos.z);
    (slot.ring.material as THREE.MeshBasicMaterial).color.copy(_colScratch);
    slot.ring.visible = true;

    slot.dome.position.set(pos.x, GROUND_Y, pos.z);
    (slot.dome.material as THREE.MeshBasicMaterial).color.copy(_colScratch);
    slot.dome.visible = true;

    const scorchSize = 1.4 + p * 1.6;
    slot.scorch.position.set(pos.x, GROUND_Y, pos.z);
    slot.scorch.scale.set(scorchSize, scorchSize, 1);
    slot.scorch.visible = true;

    // sparks от височината на попадението (pos.y ≈ гърди 1.2..1.4).
    const originY = pos.y > 0.2 ? pos.y : 1.2;
    slot.activeSparks = 20 + Math.round(p * 20);
    (slot.sparks.material as THREE.LineBasicMaterial).color.copy(_colScratch);
    slot.sparks.visible = true;
    for (let i = 0; i < SPARKS; i++) {
      const idx = i * 3;
      if (i < slot.activeSparks) {
        // радиално разлитане + нагоре, скалирано по power.
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * Math.PI * 0.5; // елевация нагоре
        const speed = (3.5 + Math.random() * 4.5) * (0.6 + p * 0.7);
        slot.sparkPos[idx] = pos.x;
        slot.sparkPos[idx + 1] = originY;
        slot.sparkPos[idx + 2] = pos.z;
        slot.sparkVel[idx] = Math.cos(a) * Math.cos(e) * speed;
        slot.sparkVel[idx + 1] = Math.sin(e) * speed + 1.5;
        slot.sparkVel[idx + 2] = Math.sin(a) * Math.cos(e) * speed;
      } else {
        // неактивна искра — скрий далеч.
        slot.sparkPos[idx + 1] = -1000;
        slot.sparkVel[idx] = slot.sparkVel[idx + 1] = slot.sparkVel[idx + 2] = 0;
      }
    }
  }

  update(dt: number): void {
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s];
      if (!slot.active) continue;
      slot.t += dt;
      const t = slot.t;

      // ring: разширяване + фейд.
      const kr = t / RING_LIFE;
      if (kr < 1) {
        const r = 0.4 + kr * (2.2 + slot.power * 2.4);
        slot.ring.scale.set(r, r, r);
        (slot.ring.material as THREE.MeshBasicMaterial).opacity = (1 - kr) * 0.95;
      } else if (slot.ring.visible) {
        slot.ring.visible = false;
      }

      // dome: бърз вертикален пулс нагоре.
      const kd = t / DOME_LIFE;
      if (kd < 1) {
        const dr = 0.5 + kd * (1.4 + slot.power * 1.2);
        slot.dome.scale.set(dr, dr * (0.6 + kd * 0.6), dr);
        (slot.dome.material as THREE.MeshBasicMaterial).opacity = (1 - kd) * 0.45;
      } else if (slot.dome.visible) {
        slot.dome.visible = false;
      }

      // sparks: интегрирай с гравитация; опашка = обратно на скоростта.
      const ks = t / SPARK_LIFE;
      if (ks < 1) {
        const lp = (slot.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < slot.activeSparks; i++) {
          const idx = i * 3;
          slot.sparkVel[idx + 1] -= 9.0 * dt; // гравитация
          slot.sparkPos[idx] += slot.sparkVel[idx] * dt;
          slot.sparkPos[idx + 1] += slot.sparkVel[idx + 1] * dt;
          slot.sparkPos[idx + 2] += slot.sparkVel[idx + 2] * dt;
          const h = i * 6, tl = i * 6 + 3;
          // глава
          lp[h] = slot.sparkPos[idx]; lp[h + 1] = slot.sparkPos[idx + 1]; lp[h + 2] = slot.sparkPos[idx + 2];
          // опашка (streak) — назад по скоростта
          lp[tl] = slot.sparkPos[idx] - slot.sparkVel[idx] * 0.035;
          lp[tl + 1] = slot.sparkPos[idx + 1] - slot.sparkVel[idx + 1] * 0.035;
          lp[tl + 2] = slot.sparkPos[idx + 2] - slot.sparkVel[idx + 2] * 0.035;
        }
        (slot.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        (slot.sparks.material as THREE.LineBasicMaterial).opacity = 1 - ks;
      } else if (slot.sparks.visible) {
        slot.sparks.visible = false;
      }

      // scorch: бавен фейд ~2s → определя края на слота.
      const kc = t / SCORCH_LIFE;
      if (kc < 1) {
        (slot.scorch.material as THREE.MeshBasicMaterial).opacity = (1 - kc) * 0.85;
      } else {
        slot.active = false;
        slot.scorch.visible = false;
      }
    }
  }

  dispose(): void {
    for (const slot of this.slots) {
      for (const m of [slot.ring, slot.dome, slot.sparks, slot.scorch]) {
        this.parent.remove(m);
        (m as THREE.Mesh).geometry.dispose();
        const mat = (m as THREE.Mesh).material as THREE.Material;
        mat.dispose();
      }
    }
    this.scorchTex.dispose();
  }
}

/* Процедурна текстура за scorch — радиален тъмен градиент, мек ръб. */
function makeScorchTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.15)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3) HitFlash — кратък emissive пулс върху ударения риг (~120ms).
 *    Запазва и възстановява оригиналните emissive стойности → не чупи PBR
 *    материалите (нито addFresnelRim пача). Материалният списък се кешира
 *    еднократно на rig.userData; update() не алокира.
 * ═════════════════════════════════════════════════════════════════════════ */

interface FlashMatRec { mat: THREE.MeshStandardMaterial; e0: THREE.Color; i0: number; }
interface FlashState { mats: FlashMatRec[]; t: number; dur: number; peak: number; color: number; }

const FLASH_DUR = 0.12;   // 120ms
const FLASH_PEAK = 2.4;   // пик на emissiveIntensity (bloom-friendly, без blowout)

export class HitFlash {
  private active = new Map<THREE.Object3D, FlashState>();

  /** Пусни флаш върху рига. color по подразбиране класовия. */
  hitFlash(rig: THREE.Object3D, color: number): void {
    const mats = this.collectMats(rig);
    if (mats.length === 0) return;
    _colScratch.set(color);
    for (const rec of mats) {
      rec.mat.emissive.copy(_colScratch);
      rec.mat.emissiveIntensity = FLASH_PEAK;
    }
    // рестартирай, ако вече флашва.
    let st = this.active.get(rig);
    if (!st) { st = { mats, t: 0, dur: FLASH_DUR, peak: FLASH_PEAK, color }; this.active.set(rig, st); }
    else { st.t = 0; st.color = color; }
  }

  /** Всеки кадър — сваля интензитета, възстановява при край. */
  updateFlashes(dt: number): void {
    if (this.active.size === 0) return;
    for (const [rig, st] of this.active) {
      st.t += dt;
      if (st.t >= st.dur) {
        // възстанови оригинала.
        for (const rec of st.mats) { rec.mat.emissive.copy(rec.e0); rec.mat.emissiveIntensity = rec.i0; }
        this.active.delete(rig);
        continue;
      }
      const k = 1 - st.t / st.dur; // 1→0
      const inten = st.peak * k * k; // квадратичен спад — рязък флаш
      for (const rec of st.mats) rec.mat.emissiveIntensity = inten;
    }
  }

  /** Еднократно кеширане на PBR материалите + оригиналните emissive стойности. */
  private collectMats(rig: THREE.Object3D): FlashMatRec[] {
    const ud = rig.userData as { __hitFlashMats?: FlashMatRec[] };
    if (ud.__hitFlashMats) return ud.__hitFlashMats;
    const recs: FlashMatRec[] = [];
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        const std = mm as THREE.MeshStandardMaterial;
        if (std && (std as any).isMeshStandardMaterial && std.emissive) {
          recs.push({ mat: std, e0: std.emissive.clone(), i0: std.emissiveIntensity });
        }
      }
    });
    ud.__hitFlashMats = recs;
    return recs;
  }

  /** Възстанови всичко + изчисти (напр. при unmount). */
  dispose(): void {
    for (const [, st] of this.active) {
      for (const rec of st.mats) { rec.mat.emissive.copy(rec.e0); rec.mat.emissiveIntensity = rec.i0; }
    }
    this.active.clear();
  }
}
