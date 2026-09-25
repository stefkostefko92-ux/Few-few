// Споделена рендер сцена за предмети — еднакво студийно осветление/кадриране за (1) изпечените
// икони (bake-item-icons.mjs) и (2) живия 3D преглед (ItemViewer3D). WebGPU + WebGL2 fallback,
// както main.js на boy (`new THREE.WebGPURenderer({..., forceWebGL})`).
import * as THREE from 'three/webgpu';

export interface StudioScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
}

/** Топла ключова светлина + хладна контра + лек rim — стилът на boy, тъмен прозрачен фон. */
export function buildStudioScene(object: THREE.Object3D): StudioScene {
  const scene = new THREE.Scene();
  scene.background = null;

  const pivot = new THREE.Group();
  pivot.add(object);
  scene.add(pivot);

  const key = new THREE.DirectionalLight(0xffdfb0, 3.2);
  key.position.set(2.2, 2.6, 1.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8fb8ff, 1.1);
  fill.position.set(-2.4, 0.6, -1.2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-0.6, 1.8, -2.4);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0x445566, 0x0a0806, 0.55);
  scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
  frameCamera(camera, object);

  return { scene, camera, pivot };
}

/** Позиционира камерата на 3/4 ракурс, кадрирана точно по bounding sphere на предмета. */
export function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D, margin = 1.12): void {
  const box = new THREE.Box3().setFromObject(object);
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
  return { renderer, backend: isWebGPU ? 'WebGPU' : 'WebGL2', canvas };
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
      const box = new THREE.Box3().setFromObject(object);
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
