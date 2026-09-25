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
export function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D, margin = 1.35): void {
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
}

/** Общ boot — гейт съгласно boy: WebGPU по подразбиране, `forceWebGL`/провал → WebGL2 fallback. */
export async function createRenderer(canvas: HTMLCanvasElement, opts: { forceWebGL?: boolean; alpha?: boolean } = {}): Promise<RendererHandle> {
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: true, alpha: opts.alpha ?? true, powerPreference: 'low-power', forceWebGL: opts.forceWebGL ?? false,
  });
  await renderer.init();
  const isWebGPU = Boolean((renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend);
  renderer.setClearColor(0x000000, 0);
  return { renderer, backend: isWebGPU ? 'WebGPU' : 'WebGL2' };
}

export interface ViewerHandle {
  dispose(): void;
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
export function mountInteractiveViewer(canvas: HTMLCanvasElement, renderer: THREE.WebGPURenderer, studio: StudioScene, opts: { autoRotate?: boolean; dprCap?: number } = {}): ViewerHandle {
  const { scene, camera, pivot } = studio;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let autoRotate = (opts.autoRotate ?? true) && !reducedMotion;
  const dprCap = opts.dprCap ?? 2;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let theta = 0.7;
  let phi = 1.15;
  let radius = camera.position.distanceTo(pivot.position);
  const applyOrbit = () => {
    phi = THREE.MathUtils.clamp(phi, 0.35, Math.PI - 0.35);
    camera.position.setFromSphericalCoords(radius, phi, theta);
    camera.lookAt(0, 0, 0);
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
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  let rafId = 0;
  let disposed = false;
  const loop = () => {
    if (disposed) return;
    if (autoRotate) { theta += 0.006; applyOrbit(); }
    renderer.renderAsync(scene, camera);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return {
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      renderer.dispose();
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
      applyOrbit();
    },
  };
}
