// Семената в 3D (three.js, физически базирано осветяване): купчинка от до 5 семена на тъмна каменна
// маса, студийна светлина отгоре вляво с мека сянка, контра светлина за ръба и отражения от „софтбокс“.
// Здравето се вижда директно: свежото е лъскаво и светло на ивици, развалящото се — потъмняло,
// набръчкано, с плесен (власинки в 3D) и мокри петна; изтеклото е прашно сиво. Един WebGL контекст за
// всички плочки: всяка сцена се рисува и копира в своя <canvas>.
import {
  BackSide,
  Box3,
  BoxGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SphereGeometry,
  SpotLight,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import type { SeedLayoutData } from './data.js';
import { smoothstep } from './noise.js';
import { seedPoint, type ShapeParams } from './seed-shape.js';
import { masksAt, seedTextures, tableTexture, textureKey } from './seed-textures.js';
import { strainOf } from './strains.js';

const BACKDROP = '#0d110f';
const MAX_DPR = 2;
const FOV = 24;
const ELEVATION = 0.72; // радиани над масата — гледаме отгоре под ъгъл, като макро снимка

export interface SeedSceneSpec {
  type: string; // видът — формата и шарката (strains.ts)
  decay: number;
  dead: boolean;
  layout: SeedLayoutData[];
  seed: number; // зрънце за вариациите (id на партидата)
}

interface Disposable {
  dispose(): void;
}

// Какво се отразява в лъскавото семе: тъмна стая със софтбокс отгоре и светла лента вляво.
function studio(): Scene {
  const env = new Scene();
  env.add(
    new Mesh(
      new BoxGeometry(12, 12, 12),
      new MeshBasicMaterial({ color: 0x0b0d0c, side: BackSide }),
    ),
  );
  const panel = (
    w: number,
    h: number,
    color: number,
    power: number,
    at: [number, number, number],
  ) => {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power), side: BackSide }),
    );
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    m.rotateY(Math.PI);
    env.add(m);
  };
  panel(5, 3, 0xfff3e2, 5, [-1.5, 5.6, 1.5]);
  panel(1.2, 7, 0xffffff, 2.5, [-5.6, 1, 1.5]);
  panel(1, 6, 0xdde9ff, 1.4, [5.6, 1, -1]);
  return env;
}

// Нормалите по шева на сферата се смятат отделно от двете страни — след деформацията шевът би се
// видял като линия. Осредняваме нормалите на върхове на едно и също място.
function weldNormals(g: SphereGeometry): void {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!pos || !nor) return;
  const acc = new Map<string, [number, number, number, number[]]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const a = acc.get(key) ?? [0, 0, 0, []];
    a[0] += nor.getX(i);
    a[1] += nor.getY(i);
    a[2] += nor.getZ(i);
    a[3].push(i);
    acc.set(key, a);
  }
  for (const [x, y, z, ids] of acc.values()) {
    if (ids.length < 2) continue;
    const l = Math.hypot(x, y, z) || 1;
    for (const i of ids) nor.setXYZ(i, x / l, y / l, z / l);
  }
}

function seedGeometry(p: ShapeParams): SphereGeometry {
  const g = new SphereGeometry(1, 80, 56);
  g.rotateZ(-Math.PI / 2); // полюсите — по дългата ос x
  const pos = g.attributes.position;
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = seedPoint(pos.getX(i), pos.getY(i), pos.getZ(i), p);
      pos.setXYZ(i, x, y, z);
    }
  }
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeedRenderer {
  private lost = false;
  private readonly materials = new Map<string, MeshPhysicalMaterial>();
  // Власинка плесен: тънко конусче, изправено по нормалата на обвивката.
  private readonly fuzzGeo = new ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0);
  private readonly fuzzMat = new MeshStandardMaterial({
    color: 0xd9ddcc,
    roughness: 1,
    envMapIntensity: 0.2,
  });
  private readonly table: { map: Texture; roughness: Texture };

  private constructor(
    private readonly renderer: WebGLRenderer,
    private readonly env: Texture,
  ) {
    this.table = tableTexture();
    renderer.domElement.addEventListener('webglcontextlost', () => {
      this.lost = true;
    });
  }

  // null без WebGL 2 — тогава остава CSS силуетът.
  static create(): SeedRenderer | null {
    if (!document.createElement('canvas').getContext('webgl2')) return null;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return null;
    }
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    const pmrem = new PMREMGenerator(renderer);
    const room = studio();
    const env = pmrem.fromScene(room, 0.02).texture;
    room.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        if (o.material instanceof MeshBasicMaterial) o.material.dispose();
      }
    });
    pmrem.dispose();
    return new SeedRenderer(renderer, env);
  }

  // Обвивката за степента: свежото — с прозрачен лак (clearcoat) като лъскаво семе; развалящото се го губи.
  private material(type: string, decay: number, dead: boolean): MeshPhysicalMaterial {
    const key = textureKey(type, decay, dead);
    const hit = this.materials.get(key);
    if (hit) return hit;
    const t = seedTextures(type, decay, dead);
    const d = dead ? 1 : Math.round(decay * 20) / 20;
    const m = new MeshPhysicalMaterial({
      map: t.map,
      roughnessMap: t.roughness,
      roughness: 1,
      bumpMap: t.bump,
      bumpScale: 1.2 + 1.3 * d,
      clearcoat: 0.7 * (1 - smoothstep(0.12, 0.55, d)),
      clearcoatRoughness: 0.22,
      // развалената обвивка не отразява средата — иначе бръчките лъщят като фолио
      envMapIntensity: 1 - 0.75 * smoothstep(0.4, 0.9, d),
    });
    this.materials.set(key, m);
    return m;
  }

  // Власинки плесен там, където текстурата има плесен — същата маска, значи петната съвпадат.
  private fuzz(geo: SphereGeometry, spec: SeedSceneSpec, rnd: () => number): InstancedMesh | null {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    if (!pos || !nor || !uv) return null;
    const density = spec.dead ? 0.35 : 0.9 * smoothstep(0.6, 1, spec.decay);
    if (density <= 0) return null;
    const spots: Array<[number, number, number, number, number, number, number]> = [];
    for (let i = 0; i < pos.count; i++) {
      const m = masksAt(spec.type, uv.getX(i), uv.getY(i), spec.decay, spec.dead).mold;
      if (m < 0.35 || rnd() > density * m) continue;
      spots.push([pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), m]);
      if (spots.length >= 1400) break;
    }
    if (spots.length === 0) return null;
    const mesh = new InstancedMesh(this.fuzzGeo, this.fuzzMat, spots.length);
    const mat = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);
    const dir = new Vector3();
    spots.forEach(([x, y, z, nx, ny, nz, m], i) => {
      // по нормалата, леко разрошена; височина 0,02–0,07, дебелина ~0,004
      dir
        .set(nx + (rnd() - 0.5) * 0.9, ny + (rnd() - 0.5) * 0.9, nz + (rnd() - 0.5) * 0.9)
        .normalize();
      q.setFromUnitVectors(up, dir);
      const len = (0.03 + rnd() * 0.06) * (0.5 + m * 0.7);
      const thick = 0.0045 + rnd() * 0.0035;
      p.set(x, y, z);
      s.set(thick, len, thick);
      mesh.setMatrixAt(i, mat.compose(p, q, s));
    });
    return mesh;
  }

  /** Рисува купчинката в canvas: CSS размера × devicePixelRatio или точен размер в пиксели
   *  (снимките за Discord). false — няма с какво. */
  draw(target: HTMLCanvasElement, spec: SeedSceneSpec, px?: { w: number; h: number }): boolean {
    if (this.lost) return false;
    const w = Math.round(px ? px.w : target.clientWidth);
    const h = Math.round(px ? px.h : target.clientHeight);
    if (w < 2 || h < 2) return false;
    const trash: Disposable[] = [];
    const scene = new Scene();
    scene.background = new Color(BACKDROP);
    scene.environment = this.env;
    scene.environmentIntensity = 0.6;
    const rnd = random(spec.seed * 2654435761 + 7);

    const table = new Mesh(
      new PlaneGeometry(80, 80),
      new MeshStandardMaterial({
        map: this.table.map,
        roughnessMap: this.table.roughness,
        roughness: 1,
      }),
    );
    trash.push(table.geometry);
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);

    const pile = new Object3D();
    const material = this.material(spec.type, spec.decay, spec.dead);
    const axes = strainOf(spec.type).axes;
    spec.layout.forEach((l, i) => {
      const geo = seedGeometry({
        decay: spec.decay,
        dead: spec.dead,
        variant: spec.seed * 7 + i,
        axes,
      });
      trash.push(geo);
      const seed = new Mesh(geo, material);
      seed.castShadow = true;
      seed.receiveShadow = true;
      const holder = new Object3D();
      holder.add(seed);
      const fz = this.fuzz(geo, spec, rnd);
      if (fz) seed.add(fz);
      // всяко семе е обърнато на различна страна около дългата си ос — шарката не се повтаря
      seed.rotation.set((rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.2, 0, 0);
      holder.rotation.set(l.tilt, l.yaw, l.tilt * 0.6);
      holder.position.set(l.x * 2, 0, l.z * 2);
      holder.updateMatrixWorld(true);
      const box = new Box3().setFromObject(holder);
      holder.position.y -= box.min.y; // лежи на масата
      pile.add(holder);
    });
    scene.add(pile);
    pile.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(pile);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());

    // Камерата: обхваща купчинката с малко въздух; по-малко семена — по-едър кадър.
    const cam = new PerspectiveCamera(FOV, w / h, 0.1, 200);
    const vHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
    const hHalf = vHalf * (w / h);
    const halfW = size.x / 2 + 0.35;
    const halfD = (size.z * Math.sin(ELEVATION) + size.y * Math.cos(ELEVATION)) / 2 + 0.3;
    const dist = Math.max(halfW / hHalf, halfD / vHalf, 3.2) * 1.08;
    cam.position.set(
      center.x,
      center.y + Math.sin(ELEVATION) * dist,
      center.z + Math.cos(ELEVATION) * dist,
    );
    cam.lookAt(center.x, center.y, center.z);
    scene.fog = new Fog(BACKDROP, dist * 0.9, dist * 2.4);

    const key = new SpotLight(0xfff1dc, 4.2, 0, 0.42, 0.85, 0);
    key.position.set(center.x - 5, 9, center.z + 6);
    key.target.position.copy(center);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
    scene.add(key, key.target);
    const rim = new DirectionalLight(0xd6e6ff, 1.3);
    rim.position.set(center.x + 5, 4, center.z - 6);
    rim.target.position.copy(center);
    scene.add(rim, rim.target);
    scene.add(new HemisphereLight(0xbac6d6, 0x2a2420, 0.35));

    const dpr = px ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.render(scene, cam);
    target.width = Math.round(w * dpr);
    target.height = Math.round(h * dpr);
    const ctx = target.getContext('2d');
    if (ctx) ctx.drawImage(this.renderer.domElement, 0, 0, target.width, target.height);
    for (const d of trash) d.dispose();
    (table.material as MeshStandardMaterial).dispose();
    return Boolean(ctx) && !this.lost;
  }
}
