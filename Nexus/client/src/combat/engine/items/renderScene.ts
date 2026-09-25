// Споделена рендер сцена за предмети — еднакво студийно осветление/кадриране за (1) изпечените
// икони (bake-item-icons.mjs) и (2) живия 3D преглед (ItemViewer3D). WebGPU + WebGL2 fallback,
// както main.js на boy (`new THREE.WebGPURenderer({..., forceWebGL})`). Environment map (PMREM
// от RoomEnvironment — същия рецепта като world.js на boy: `new THREE.PMREMGenerator(renderer)`)
// е задължителна за metalness/roughness материалите да имат реални отражения — без нея плочата/
// ризницата изглеждат мъртви, плоски цветове.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface StudioScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
}

const RARITY_RIM: Record<string, string> = {
  common: '#c7c8d6', uncommon: '#6ad8a4', rare: '#6aa7ff', epic: '#c294ff', legendary: '#ffd34d',
};

/** Топла ключова светлина + хладна контра + rim (тониран по редкост, замества старото плътно
 *  „кръгче" ореол зад предмета — виж buildItem.ts) + мека контактна сянка под предмета. */
export function buildStudioScene(object: THREE.Object3D, opts: { envMap?: THREE.Texture | null; rarity?: string } = {}): StudioScene {
  const scene = new THREE.Scene();
  scene.background = null;
  if (opts.envMap) {
    scene.environment = opts.envMap;
    scene.environmentIntensity = 0.55;
  }

  const pivot = new THREE.Group();
  pivot.add(object);
  scene.add(pivot);

  const key = new THREE.DirectionalLight(0xffdfb0, 1.7);
  key.position.set(2.2, 2.6, 1.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.55);
  fill.position.set(-2.4, 0.6, -1.2);
  scene.add(fill);

  const rimColor = new THREE.Color(RARITY_RIM[opts.rarity || 'common'] || RARITY_RIM.common);
  const rimIntensity = opts.rarity === 'legendary' ? 1.9 : opts.rarity === 'epic' ? 1.55 : 1.0;
  const rim = new THREE.DirectionalLight(rimColor, rimIntensity);
  rim.position.set(-0.6, 1.8, -2.4);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0x445566, 0x0a0806, 0.4);
  scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  frameCamera(camera, object);
  scene.add(contactShadow(object));

  return { scene, camera, pivot };
}

/** Мека, приплесната елипса под предмета (multiply blend) — евтин „contact shadow" trick, без
 *  реален shadow-map pass (незначителна цена, стабилно под софтуерен WebGL). */
function contactShadow(object: THREE.Object3D): THREE.Mesh {
  const box = boundingBoxForFraming(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const r = Math.max(size.x, size.z, 0.05) * 0.55;
  const geo = new THREE.CircleGeometry(r, 24);
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, box.min.y + 0.0005, center.z);
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

/** Box3 по видимите мрежи, БЕЗ тези маркирани `userData.excludeFromFraming` (ореолът на
 *  редкостта е нарочно по-голям от предмета — иначе бута камерата назад и предметът се губи). */
function boundingBoxForFraming(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  object.updateWorldMatrix(true, true);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || mesh.userData.excludeFromFraming) return;
    childBox.setFromObject(mesh);
    box.union(childBox);
  });
  if (box.isEmpty()) box.setFromObject(object);
  return box;
}

/** Позиционира камерата на 3/4 ракурс, кадрирана точно по bounding sphere на предмета. */
export function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D, margin = 1.02): void {
  const box = boundingBoxForFraming(object);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const r = Math.max(sphere.radius, 0.02);
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (r * margin) / Math.sin(fov / 2);
  const dir = new THREE.Vector3(0.62, 0.5, 0.9).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - r * 3);
  camera.far = dist + r * 6;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
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
  refit(object: THREE.Object3D, margin?: number): void;
}

/**
 * Монтира жив, въртящ се преглед в `canvas` (влачене с показалец/пръст, колелце/щипка = зум).
 * Авто-въртенето спира под `prefers-reduced-motion: reduce` (влаченето остава — не е анимация,
 * а пряка интеракция). Пълно почистване при dispose(): GPU памет, слушатели, rAF.
 */
export function mountInteractiveViewer(canvas: HTMLCanvasElement, renderer: THREE.WebGPURenderer, studio: StudioScene, opts: { autoRotate?: boolean; dprCap?: number; maxRenderSize?: number } = {}): ViewerHandle {
  const { scene, camera, pivot } = studio;
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
  let radius = camera.position.distanceTo(pivot.position);
  // Орбита около `target`, не винаги (0,0,0) — SetViewer3D подрежда парчетата в кръг ИЗВЪН
  // произхода, а „изолирай парче" пре-центрира орбитата към именно това парче (виж refit()).
  const target = new THREE.Vector3();
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
    refit(object: THREE.Object3D, margin = 1.35): void {
      const box = boundingBoxForFraming(object);
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
