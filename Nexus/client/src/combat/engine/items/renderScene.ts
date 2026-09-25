// Споделена рендер сцена за живия 3D преглед (ItemViewer3D/SetViewer3D). WebGPU + WebGL2
// fallback, както main.js на boy (`new THREE.WebGPURenderer({..., forceWebGL})`). Environment
// map (PMREM от RoomEnvironment — същия рецепта като world.js на boy: `new
// THREE.PMREMGenerator(renderer)`) е задължителна за metalness/roughness материалите да имат
// реални отражения — без нея плочата/ризницата изглеждат мъртви, плоски цветове.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface StudioScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  /** Точката, в която камерата гледа (frameCamera-изчисленият център) — mountInteractiveViewer
   *  ИНИЦИАЛИЗИРА орбитата около нея, не около world origin. Предметите не седят на (0,0,0)
   *  (виж buildItem.ts group.position.y=1.35 — вдигане над grime зоната), затова орбита около
   *  origin гледаше в празно пространство и предметът никога не се появяваше на екрана. */
  target: THREE.Vector3;
}

const RARITY_RIM: Record<string, string> = {
  common: '#c7c8d6', uncommon: '#6ad8a4', rare: '#6aa7ff', epic: '#c294ff', legendary: '#ffd34d',
};

/** Фиксираният 3/4 ракурс на студийната камера — общ, за да го споделят frameCamera() (кадриране)
 *  и всяко въртене „по диагонал" (roll около точно тази ос е чиста screen-space диагонал,
 *  независимо от позицията на камерата — вижте tiltDeg в buildStudioScene). */
export const VIEW_DIR = new THREE.Vector3(0.62, 0.5, 0.9).normalize();

/** Топла ключова светлина + хладна контра + rim (тониран по редкост, замества старото плътно
 *  „кръгче" ореол зад предмета) + мека контактна сянка под предмета.
 *  `tiltDeg`: завърта pivot-а около VIEW_DIR (screen-space диагонал) — оръжията (тънки
 *  вертикални линии) иначе губят кадъра; помага и на лъка/жезъла. `focusOnly`: сянката пак пада
 *  по ЦЕЛИЯ обект (мустакат манекен), но камерата вече е кадрирана само по частта с
 *  `userData.excludeFromFraming` маркирана извън фокуса (виж mannequin.ts). */
export function buildStudioScene(object: THREE.Object3D, opts: { envMap?: THREE.Texture | null; rarity?: string; tiltDeg?: number } = {}): StudioScene {
  const scene = new THREE.Scene();
  scene.background = null;
  if (opts.envMap) {
    scene.environment = opts.envMap;
    scene.environmentIntensity = 0.55;
  }

  const pivot = new THREE.Group();
  pivot.add(object);
  scene.add(pivot);

  if (opts.tiltDeg) {
    // Ротацията е около ОСТА на камерата (VIEW_DIR), не около произволна world ос — това е
    // чист "roll" в екранното пространство (изображението се завърта, независимо от 3/4 позата
    // на камерата), затова диагоналът излиза предвидим за всеки предмет.
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);
    pivot.position.copy(center);
    pivot.quaternion.setFromAxisAngle(VIEW_DIR, THREE.MathUtils.degToRad(opts.tiltDeg));
  }

  const key = new THREE.DirectionalLight(0xffdfb0, 2.0);
  key.position.set(2.2, 2.6, 1.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.7);
  fill.position.set(-2.4, 0.6, -1.2);
  scene.add(fill);

  // Тъмни/тънки предмети (лък, жезъл — дърво/кожа, ниска albedo) се губеха на тъмния фон дори с
  // ясна камера — вдигнат rim (силует-очертаваща контра светлина зад предмета) е точно фиксът:
  // прави ръба видим независимо от базовия цвят на материала, четливо и на малък телефонен екран.
  const rimColor = new THREE.Color(RARITY_RIM[opts.rarity || 'common'] || RARITY_RIM.common);
  const rimIntensity = opts.rarity === 'legendary' ? 2.6 : opts.rarity === 'epic' ? 2.2 : 1.9;
  const rim = new THREE.DirectionalLight(rimColor, rimIntensity);
  rim.position.set(-0.6, 1.8, -2.4);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0x445566, 0x0a0806, 0.55);
  scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  const target = frameCamera(camera, pivot);
  scene.add(contactShadow(pivot));

  return { scene, camera, pivot, target };
}

let cachedShadowTex: THREE.Texture | null = null;
/** 128×128 радиален градиент (плътно в центъра → напълно прозрачно на ръба) — заменя старото
 *  плътно кръгче „стойка" под предмета (обратна връзка от прегледа: реещ се предмет с мека сянка
 *  е по-добре от твърд диск, който на ъгъл чете се като поставка/пиедестал). */
function softShadowTexture(): THREE.Texture {
  if (cachedShadowTex) return cachedShadowTex;
  if (typeof document === 'undefined') {
    cachedShadowTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    cachedShadowTex.needsUpdate = true;
    return cachedShadowTex;
  }
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cachedShadowTex = new THREE.CanvasTexture(c);
  return cachedShadowTex;
}

/** Мека, приплесната сянка под предмета (не твърд диск) — евтин trick, без реален shadow-map
 *  pass. Винаги смятана по ЦЯЛОТО тяло (не по фокус-под-множеството), за да не се свие до
 *  нелепо малко петно, когато камерата е кадрирана само по една част от манекен. */
function contactShadow(object: THREE.Object3D): THREE.Mesh {
  const box = boundingBox(object, false);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const r = Math.max(size.x, size.z, 0.05) * 0.75;
  const geo = new THREE.PlaneGeometry(r * 2, r * 2);
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0x000000, map: softShadowTexture(), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, box.min.y + 0.0005, center.z);
  mesh.userData.excludeFromFraming = true;
  return mesh;
}

let cachedPmrem: THREE.Texture | null = null;
/** Генерира/кешира PMREM env map веднъж (скъпо, споделено между всички предмети — виж
 *  createRenderer, извиква се само при първо създаване на споделения renderer). */
export function buildEnvironmentMap(renderer: THREE.WebGPURenderer): THREE.Texture {
  if (cachedPmrem) return cachedPmrem;
  const pmrem = new THREE.PMREMGenerator(renderer);
  cachedPmrem = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return cachedPmrem;
}

/** Box3 по видимите мрежи. `respectExclude=true` пропуска `userData.excludeFromFraming` (за
 *  манекен-фокус кадриране И за собствената си сянка-равнина); `false` брои всичко (сянката пада
 *  под целия манекен, не само фокус-частта). */
function boundingBox(objectOrList: THREE.Object3D | THREE.Object3D[], respectExclude = true): THREE.Box3 {
  const roots = Array.isArray(objectOrList) ? objectOrList : [objectOrList];
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  for (const object of roots) {
    object.updateWorldMatrix(true, true);
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (respectExclude && mesh.userData.excludeFromFraming) return;
      childBox.setFromObject(mesh);
      box.union(childBox);
    });
  }
  if (box.isEmpty() && roots[0]) box.setFromObject(roots[0]);
  return box;
}

/** Позиционира камерата на фиксирания 3/4 ракурс (VIEW_DIR), кадрирана по ПРОЕКТИРАНИЯ
 *  правоъгълник на bounding box-а върху равнината на камерата — не по bounding sphere. Тънки
 *  обекти (меч, лък, жезъл) под сферично кадриране оставят огромно празно поле отляво/дясно;
 *  правоъгълното кадриране ги напасва плътно и по двете оси. */
export function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D | THREE.Object3D[], margin = 1.08): THREE.Vector3 {
  const box = boundingBox(object, true);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const dir = VIEW_DIR;
  const worldUp = Math.abs(dir.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  let maxR = 0;
  let maxU = 0;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
    maxR = Math.max(maxR, Math.abs(corner.dot(right)));
    maxU = Math.max(maxU, Math.abs(corner.dot(up)));
  }
  maxR = Math.max(maxR, 0.02);
  maxU = Math.max(maxU, 0.02);
  const fovY = (camera.fov * Math.PI) / 180;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
  const dist = Math.max(maxU / Math.tan(fovY / 2), maxR / Math.tan(fovX / 2)) * margin;
  const r = Math.max(maxR, maxU);
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - r * 3);
  camera.far = dist + r * 6;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return center;
}

export interface RendererHandle {
  renderer: THREE.WebGPURenderer;
  backend: 'WebGPU' | 'WebGL2';
  canvas: HTMLCanvasElement;
  envMap: THREE.Texture;
}

/** Браузърите ограничават успоредните WebGL контексти (обичайно ~16) — `renderer.dispose()`
 *  освобождава GPU ресурси, но НЕ винаги връща самия контекст веднага. Отваряне/затваряне на
 *  модала многократно (виж buildItem-a на всеки клик) иначе изтича контексти → „WebGL Device
 *  Lost" след ~8-10 отваряния. `WEBGL_lose_context` го връща веднага, детерминистично. */
function forceLoseWebGLContext(canvas: HTMLCanvasElement): void {
  const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

/** Общ boot — гейт съгласно boy: WebGPU по подразбиране, `forceWebGL`/провал → WebGL2 fallback. */
export async function createRenderer(canvas: HTMLCanvasElement, opts: { forceWebGL?: boolean; alpha?: boolean } = {}): Promise<RendererHandle> {
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: true, alpha: opts.alpha ?? true, powerPreference: 'low-power', forceWebGL: opts.forceWebGL ?? false,
  });
  await renderer.init();
  const isWebGPU = Boolean((renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend);
  renderer.setClearColor(0x000000, 0);
  // Без тон-мапинг физически-базираните материали + env карта пресветват до бяло на всяка
  // ярка/полирана повърхност — ACES е стандартният филм-подобен отговор за PBR продукт-кадри.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const envMap = buildEnvironmentMap(renderer);
  return { renderer, backend: isWebGPU ? 'WebGPU' : 'WebGL2', canvas, envMap };
}

export interface ViewerHandle {
  /** `keepRenderer: true` спира само rAF цикъла/слушателите (за преизползване на СЪЩИЯ GPU
   *  контекст — виж ItemViewer3DHost, който държи един renderer за целия живот на приложението,
   *  вместо нов WebGL контекст на всеки клик; браузърите капват успоредните контексти). */
  dispose(opts?: { keepRenderer?: boolean }): void;
  setAutoRotate(on: boolean): void;
  resize(): void;
  /** Прекадрира орбитата около нов обект (напр. „изолирай парче" в SetViewer3D) без да губи
   *  влаченето/зума на потребителя за следващия жест. */
  refit(object: THREE.Object3D | THREE.Object3D[], margin?: number): void;
}

/**
 * Монтира жив, въртящ се преглед в `canvas` (влачене с показалец/пръст, колелце/щипка = зум).
 * Авто-въртенето спира под `prefers-reduced-motion: reduce` (влаченето остава — не е анимация,
 * а пряка интеракция). Пълно почистване при dispose(): GPU памет, слушатели, rAF.
 */
export function mountInteractiveViewer(canvas: HTMLCanvasElement, renderer: THREE.WebGPURenderer, studio: StudioScene, opts: { autoRotate?: boolean; dprCap?: number; maxRenderSize?: number } = {}): ViewerHandle {
  const { scene, camera, target: studioTarget } = studio;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let autoRotate = (opts.autoRotate ?? true) && !reducedMotion;
  const dprCap = opts.dprCap ?? 2;
  // Таван на вътрешния рендер буфер (px/страна), независимо от CSS кутията — CSS-ът пак разпъва
  // canvas-а на пълна ширина (GPU ъпскейлва), но под софтуерен WebGL голяма непрекъсната сцена
  // на голяма резолюция (напр. витрина на цял сет, 678×678 CSS × DPR2 = 1356px²) е забелязано да
  // чупи WebGL backend-а („Device Lost") — по-малък буфер го пази стабилен.
  const maxRenderSize = opts.maxRenderSize ?? 480;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let theta = 0.7;
  let phi = 1.15;
  let radius = camera.position.distanceTo(studioTarget);
  // Орбита около `target`, ИНИЦИАЛИЗИРАН от studio.target (frameCamera-изчисленият център),
  // НЕ world origin — предметите не седят на (0,0,0) (buildItem.ts вдига group.position.y=1.35
  // над grime зоната), а SetViewer3D подрежда парчетата в кръг ИЗВЪН произхода; орбита около
  // origin гледаше в празно пространство и обектът никога не се появяваше на екрана. „Изолирай
  // парче" пре-центрира орбитата към конкретно парче (виж refit()).
  const target = studioTarget.clone();
  const applyOrbit = () => {
    phi = THREE.MathUtils.clamp(phi, 0.35, Math.PI - 0.35);
    camera.position.setFromSphericalCoords(radius, phi, theta).add(target);
    camera.lookAt(target);
  };
  applyOrbit();

  const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; autoRotate = false; canvas.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    theta -= (e.clientX - lastX) * 0.008;
    phi -= (e.clientY - lastY) * 0.008;
    lastX = e.clientX; lastY = e.clientY;
    applyOrbit();
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    radius = THREE.MathUtils.clamp(radius * (1 + Math.sign(e.deltaY) * 0.08), radius * 0.4, radius * 2.5);
    applyOrbit();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  function resize(): void {
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const scale = Math.min(1, maxRenderSize / (Math.max(cssW, cssH) * dpr));
    renderer.setPixelRatio(dpr * scale);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
  }
  resize();

  let rafId = 0;
  let disposed = false;
  // Пази ОДИН `renderAsync` наведнъж — под софтуерен WebGL (SwiftShader/llvmpipe) сцена с много
  // обекти може да отнеме >16ms/кадър; застъпващи се извиквания на renderAsync към СЪЩИЯ
  // renderer чупят WebGL-backend-а му („WebGL Device Lost") — виждано директно при SetViewer3D
  // (5+ предмета в една сцена). Пропускаме нов рендер, докато предишният still работи, вместо
  // да ги трупаме един върху друг.
  let rendering = false;
  const loop = () => {
    if (disposed) return;
    if (autoRotate) { theta += 0.006; applyOrbit(); }
    if (!rendering) {
      rendering = true;
      Promise.resolve(renderer.renderAsync(scene, camera)).finally(() => { rendering = false; });
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return {
    dispose(opts: { keepRenderer?: boolean } = {}): void {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      if (!opts.keepRenderer) {
        renderer.dispose();
        forceLoseWebGLContext(canvas);
      }
    },
    setAutoRotate(on: boolean): void { autoRotate = on && !reducedMotion; },
    resize,
    refit(object: THREE.Object3D | THREE.Object3D[], margin = 1.35): void {
      const box = boundingBox(object, true);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const r = Math.max(sphere.radius, 0.02);
      const fov = (camera.fov * Math.PI) / 180;
      radius = (r * margin) / Math.sin(fov / 2);
      target.copy(sphere.center);
      applyOrbit();
    },
  };
}
