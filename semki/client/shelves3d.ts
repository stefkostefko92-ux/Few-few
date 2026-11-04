// Рафтовете в 3D (three.js, физически базирано осветяване): за всеки рафт сцена с мазилка отзад, дъска
// от орех за всеки ред и стъкленица за всяка партида — стъкло, разтвор с пречупване и цвят в дълбочина,
// семена в разтвора, корк. Сцената е 1:1 с пикселите на страницата (в равнината z = 0), така че всяка
// стъкленица застава точно над своя .vial-slot. Един общ WebGL контекст рисува всички рафтове ред по
// ред и копира картината в <canvas> на рафта.
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import type { ShelfData, VialData } from './data.js';
import {
  CORK,
  glassProfile,
  liquidProfile,
  liquidTop,
  SEED,
  seedPosition,
  SLOT,
  TUBE,
  type ProfilePoint,
} from './geometry.js';
import {
  contactShadowTexture,
  corkTexture,
  plasterTexture,
  seedTexture,
  woodTexture,
} from './textures.js';

const WALL_Z = -64;
const PLANK = { thickness: 14, front: 32 } as const;
// Окото: над горния ръб на реда и на това разстояние от стената — гледаме леко отгоре, като в снимка.
const EYE = { above: 130, distance: 1100 } as const;
const MAX_DPR = 2;
const BACKLIGHT_EVERY = 280; // светлина зад реда на всеки толкова пиксела

interface Disposable {
  dispose(): void;
}

const lathe = (pts: ProfilePoint[]): LatheGeometry =>
  new LatheGeometry(
    pts.map(([x, y]) => new Vector2(x, y)),
    72,
  );

// Какво се отразява в стъклото: тъмна стая с вертикални светли ленти отстрани и лампа отгоре, като
// при продуктова снимка — по стъклото остават дълги чисти отблясъци, без петна по дъната.
function studioEnvironment(): Scene {
  const env = new Scene();
  env.add(
    new Mesh(
      new BoxGeometry(12, 12, 12),
      new MeshBasicMaterial({ color: 0x0c0f0d, side: BackSide }),
    ),
  );
  const panel = (
    w: number,
    h: number,
    color: number,
    power: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power), side: BackSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    m.rotateY(Math.PI); // гърбът (BackSide) гледа към центъра
    env.add(m);
  };
  panel(1.4, 9, 0xfff4e6, 4.2, -5.6, 0.5, 2.2); // лентата вляво отпред
  panel(0.8, 9, 0xe8f0ff, 2.4, 5.6, 0.5, 1.2); // по-слаба вдясно
  panel(6, 2.4, 0xd9c2ff, 3, 0, 5.6, 0.5); // лампата за растения отгоре
  return env;
}

// Семето не е топка: единият край е заострен.
function seedGeometry(): SphereGeometry {
  const g = new SphereGeometry(1, 24, 16);
  const pos = g.attributes.position;
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const k = x > 0 ? 1 - 0.38 * x * x : 1;
      pos.setXYZ(i, x * SEED.x, pos.getY(i) * SEED.y * k, pos.getZ(i) * SEED.z * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

export class ShelfRenderer {
  private lost = false;
  private readonly liquids = new Map<string, MeshPhysicalMaterial>();
  private readonly seedsIn = new Map<string, MeshPhysicalMaterial>();
  private readonly camera = new PerspectiveCamera();

  private constructor(
    private readonly renderer: WebGLRenderer,
    private readonly env: Texture,
    private readonly tex: { wood: Texture; plaster: Texture; seed: Texture },
    private readonly geo: {
      glass: LatheGeometry;
      cork: CylinderGeometry;
      seed: SphereGeometry;
      tick: TorusGeometry;
      contact: PlaneGeometry;
    },
    private readonly mat: {
      wall: MeshStandardMaterial;
      plank: MeshPhysicalMaterial;
      glassBody: MeshPhysicalMaterial;
      glassShine: MeshPhysicalMaterial;
      cork: MeshStandardMaterial;
      corkOld: MeshStandardMaterial;
      seedOld: MeshStandardMaterial;
      tick: MeshStandardMaterial;
      contact: MeshBasicMaterial;
    },
  ) {
    renderer.domElement.addEventListener('webglcontextlost', () => {
      this.lost = true;
    });
  }

  // null, ако браузърът няма WebGL — тогава страницата показва простите стъкленици от CSS.
  static create(): ShelfRenderer | null {
    // three.js иска WebGL 2; проверката отпред спестява грешките му в конзолата.
    if (!document.createElement('canvas').getContext('webgl2')) return null;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return null;
    }
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const pmrem = new PMREMGenerator(renderer);
    const studio = studioEnvironment();
    const env = pmrem.fromScene(studio, 0.02).texture;
    studio.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        if (o.material instanceof MeshBasicMaterial) o.material.dispose();
      }
    });
    pmrem.dispose();

    const wood = woodTexture();
    const plaster = plasterTexture();
    const cork = corkTexture();
    const seed = seedTexture();
    const contact = contactShadowTexture();

    const tick = new TorusGeometry(TUBE.outer + 0.2, 0.42, 6, 24, Math.PI * 0.42);
    tick.rotateX(Math.PI / 2);
    tick.rotateY(Math.PI * 0.21 - Math.PI / 2 + 0.45); // дъгата е отпред, леко вдясно
    const contactGeo = new PlaneGeometry(TUBE.outer * 3.4, TUBE.outer * 2.4);
    contactGeo.rotateX(-Math.PI / 2);

    return new ShelfRenderer(
      renderer,
      env,
      { wood, plaster, seed },
      {
        glass: lathe(glassProfile()),
        cork: new CylinderGeometry(CORK.top, CORK.bottom, CORK.height, 64, 1),
        seed: seedGeometry(),
        tick,
        contact: contactGeo,
      },
      {
        wall: new MeshStandardMaterial({
          color: 0x2b3530,
          map: plaster,
          bumpMap: plaster,
          bumpScale: 0.6,
          roughness: 0.94,
        }),
        plank: new MeshPhysicalMaterial({
          map: wood,
          bumpMap: wood,
          bumpScale: 0.4,
          roughness: 0.55,
          clearcoat: 0.35,
          clearcoatRoughness: 0.35,
        }),
        glassBody: new MeshPhysicalMaterial({
          color: 0xd6ebe2,
          roughness: 0.08,
          transparent: true,
          opacity: 0.05,
          depthWrite: false,
        }),
        // Отраженията на стъклото се добавят върху всичко зад него (адитивно): прозрачно, но лъскаво.
        glassShine: new MeshPhysicalMaterial({
          color: 0x000000,
          roughness: 0.03,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          envMap: env,
          envMapIntensity: 1.1,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
        cork: new MeshStandardMaterial({
          map: cork,
          bumpMap: cork,
          bumpScale: 1.6,
          roughness: 0.92,
        }),
        corkOld: new MeshStandardMaterial({
          map: cork,
          bumpMap: cork,
          bumpScale: 1.6,
          roughness: 0.95,
          color: 0x77706a,
        }),
        seedOld: new MeshStandardMaterial({ map: seed, color: 0x7a6656, roughness: 0.85 }),
        tick: new MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.35,
          roughness: 0.5,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
        contact: new MeshBasicMaterial({
          map: contact,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        }),
      },
    );
  }

  // Разтворът на вида: цветът е в дълбочината (attenuation), отгоре — малко собствено сияние, сякаш
  // светлината се разсейва вътре.
  private liquid(color: string): MeshPhysicalMaterial {
    const cached = this.liquids.get(color);
    if (cached) return cached;
    const m = new MeshPhysicalMaterial({
      color,
      transmission: 1,
      thickness: TUBE.outer * 1.6,
      ior: 1.34,
      roughness: 0.04,
      attenuationColor: color,
      attenuationDistance: 70,
      emissive: color,
      emissiveIntensity: 0.22,
    });
    m.color.lerp(m.color.clone().setRGB(1, 1, 1), 0.2);
    this.liquids.set(color, m);
    return m;
  }

  // Семената в разтвора: рисуват се след него (прозрачен проход, без тест за дълбочина — в
  // стъкленицата пред тях има само разтвор и стъкло) и леко поемат цвета му. Иначе пречупването през
  // оцветения разтвор ги стопява.
  private seedIn(color: string): MeshPhysicalMaterial {
    const cached = this.seedsIn.get(color);
    if (cached) return cached;
    const m = new MeshPhysicalMaterial({
      map: this.tex.seed,
      bumpMap: this.tex.seed,
      bumpScale: 0.5,
      color,
      roughness: 0.42,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
    });
    m.color.lerp(m.color.clone().setRGB(1, 1, 1), 0.72);
    this.seedsIn.set(color, m);
    return m;
  }

  private vial(v: VialData, color: string, trash: Disposable[]): Group {
    const g = new Group();
    const contact = new Mesh(this.geo.contact, this.mat.contact);
    contact.position.y = 0.2;
    g.add(contact);

    if (!v.expired && v.level > 0) {
      const geo = lathe(liquidProfile(v.level));
      trash.push(geo);
      const liquid = new Mesh(geo, this.liquid(color));
      liquid.castShadow = true;
      g.add(liquid);
    }
    for (const s of v.seeds) {
      const seed = new Mesh(this.geo.seed, v.expired ? this.mat.seedOld : this.seedIn(color));
      seed.renderOrder = 0.5;
      seed.position.set(...seedPosition(s, v.level, v.expired));
      // изсъхналите лежат на дъното, в разтвора се носят наклонени
      seed.rotation.set(v.expired ? 0 : s.rx, s.ry, v.expired ? 0 : s.rz);
      g.add(seed);
    }
    for (const t of v.ticks) {
      const tick = new Mesh(this.geo.tick, this.mat.tick);
      tick.position.y = liquidTop(t);
      tick.renderOrder = 1;
      g.add(tick);
    }
    const cork = new Mesh(this.geo.cork, v.expired ? this.mat.corkOld : this.mat.cork);
    cork.position.y = TUBE.height - CORK.inside + CORK.height / 2;
    cork.rotation.y = v.id * 1.7; // всяка тапа е завъртяна различно
    cork.castShadow = true;
    g.add(cork);

    const body = new Mesh(this.geo.glass, this.mat.glassBody);
    body.renderOrder = 2;
    const shine = new Mesh(this.geo.glass, this.mat.glassShine);
    shine.renderOrder = 3;
    g.add(body, shine);
    return g;
  }

  private lights(scene: Scene, w: number, h: number, rowTops: number[]): void {
    const center = new Vector3(w / 2, -h / 2, 0);
    const aim = (light: DirectionalLight, x: number, y: number, z: number) => {
      light.position.set(center.x + x, center.y + y, z);
      light.target.position.copy(center);
      scene.add(light, light.target);
    };
    // основната светлина: топла, отгоре вляво отпред, с мека сянка
    const key = new DirectionalLight(0xfff1de, 2.3);
    aim(key, -620, 900, 900);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.6;
    const half = Math.max(w, h) * 0.9 + 320;
    const cam = key.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 10;
    cam.far = 4000;
    cam.updateProjectionMatrix();
    // лампата за растения отгоре (виолетово) и контра светлина отзад за ръбовете на стъклото
    aim(new DirectionalLight(0xc9a3ff, 0.8), 0, 1000, 280);
    aim(new DirectionalLight(0xe6f2ff, 1.4), 520, 420, -900);
    scene.add(new HemisphereLight(0xc4d2ff, 0x2a2017, 0.45));
    // светлина по стената зад всеки ред: през нея разтворът свети
    for (const top of rowTops) {
      const floor = top + SLOT.floor;
      const n = Math.max(1, Math.round(w / BACKLIGHT_EVERY));
      for (let i = 0; i < n; i++) {
        const glow = new PointLight(0xffe4bd, 11000, 0, 2);
        glow.position.set(((i + 0.5) * w) / n, -(floor - 110), WALL_Z + 95);
        scene.add(glow);
      }
    }
  }

  // Рисува рафта в canvas (CSS размерът на рафта × devicePixelRatio). false — няма какво или с какво.
  draw(shelfEl: HTMLElement, canvas: HTMLCanvasElement, data: ShelfData): boolean {
    if (this.lost) return false;
    const box = shelfEl.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (w < 2 || h < 2) return false;

    const byId = new Map(data.vials.map((v) => [v.id, v]));
    const placed: Array<{ v: VialData; x: number; top: number }> = [];
    for (const slot of shelfEl.querySelectorAll<HTMLElement>('.vial-slot')) {
      const v = byId.get(Number(slot.dataset.vial));
      if (!v) continue;
      const r = slot.getBoundingClientRect();
      placed.push({ v, x: r.left - box.left + r.width / 2, top: Math.round(r.top - box.top) });
    }
    if (placed.length === 0) return false;
    const rowTops = [...new Set(placed.map((p) => p.top))].sort((a, b) => a - b);

    const trash: Disposable[] = [];
    const scene = new Scene();
    scene.environment = this.env;
    scene.environmentIntensity = 0.55;

    const wallGeo = new PlaneGeometry(w * 3, h * 3 + 800);
    trash.push(wallGeo);
    this.tex.plaster.repeat.set((w * 3) / 256, (h * 3 + 800) / 256);
    const wall = new Mesh(wallGeo, this.mat.wall);
    wall.position.set(w / 2, -h / 2, WALL_Z);
    wall.receiveShadow = true;
    scene.add(wall);

    this.tex.wood.repeat.set((w + 400) / 700, 1);
    for (const top of rowTops) {
      const depth = PLANK.front - WALL_Z;
      const geo = new BoxGeometry(w + 400, PLANK.thickness, depth);
      trash.push(geo);
      const plank = new Mesh(geo, this.mat.plank);
      plank.position.set(
        w / 2,
        -(top + SLOT.floor + PLANK.thickness / 2),
        (PLANK.front + WALL_Z) / 2,
      );
      plank.castShadow = true;
      plank.receiveShadow = true;
      scene.add(plank);
    }
    for (const p of placed) {
      const vial = this.vial(p.v, data.color, trash);
      vial.position.set(p.x, -(p.top + SLOT.floor), 0);
      scene.add(vial);
    }
    this.lights(scene, w, h, rowTops);

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.needsUpdate = true;

    // Всеки ред със собствена камера (окото е над реда), иначе долните редове се гледат твърде отгоре.
    // Равнината на картината остава успоредна на стената: вертикалите са вертикални, а z = 0 е 1:1.
    const cam = this.camera;
    for (let i = 0; i < rowTops.length; i++) {
      const rowTop = rowTops[i] ?? 0;
      const y0 = i === 0 ? 0 : rowTop;
      const y1 = i === rowTops.length - 1 ? h : (rowTops[i + 1] ?? h);
      if (y1 - y0 < 1) continue;
      this.renderer.setSize(w, y1 - y0, false);
      const eye = new Vector3(w / 2, -(rowTop - EYE.above), EYE.distance);
      const near = 20;
      const k = near / EYE.distance;
      cam.position.copy(eye);
      cam.rotation.set(0, 0, 0);
      cam.updateMatrixWorld();
      cam.projectionMatrix.makePerspective(
        (0 - eye.x) * k,
        (w - eye.x) * k,
        (-y0 - eye.y) * k,
        (-y1 - eye.y) * k,
        near,
        EYE.distance + 600,
      );
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      this.renderer.render(scene, cam);
      ctx.drawImage(
        this.renderer.domElement,
        0,
        Math.round(y0 * dpr),
        canvas.width,
        Math.round((y1 - y0) * dpr),
      );
    }
    for (const d of trash) d.dispose();
    return !this.lost;
  }
}
