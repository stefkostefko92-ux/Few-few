// The orbit camera of the 3D installation (boot.ts): four views (car, whole shaft, machine, pit) the camera glides to;
// free all round — orbit (left drag, one finger, Shift or Ctrl + arrows), pan (right drag, two fingers, Shift + drag,
// arrows), zoom toward the cursor (wheel, pinch, + and −) — with the target kept within the building's reach and the
// camera never further than the whole shaft's framing allows; the car view follows the car by its motion, so a pan or
// a zoom the user made stays; the user's first touch ends a glide; a view chosen again, or a double click, brings its
// framing back. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LiftWorld } from './world';

export type View = 'car' | 'shaft' | 'room' | 'pit';
type Frame = Parameters<LiftWorld['focus']>[1];

// where the camera stands relative to its target, per view (direction; the distance comes from the world)
const OFFSET: Record<View, THREE.Vector3> = {
  car: new THREE.Vector3(0.55, 0.28, 1).normalize(),
  shaft: new THREE.Vector3(0.62, 0.12, 1).normalize(),
  room: new THREE.Vector3(0.75, 0.62, 1).normalize(),
  pit: new THREE.Vector3(0.6, 0.45, 1).normalize(),
};

const GLIDE_MS = 700;
// a key's zoom step toward the target
const ZOOM_STEP = 0.85;

export interface ViewCamera {
  readonly controls: OrbitControls;
  view(): View;
  /** a glide under way: the loop keeps drawing */
  gliding(): boolean;
  /** to the framing of view `v`, gliding when `animate` (and motion is not reduced) */
  place(v: View, animate: boolean): void;
  /** a new world (another design): the bounds follow it; the camera stays where the user has it */
  setWorld(w: LiftWorld): void;
  setReducedMotion(on: boolean): void;
  /** each frame before drawing, at the wall clock's `now` [ms]: the glide, the car's motion */
  step(now: number, f: Frame): void;
  dispose(): void;
}

export function createViewCamera(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, w0: LiftWorld, v0: View, reduced0: boolean,
  frame: () => Frame): ViewCamera {
  const controls = new OrbitControls(camera, canvas);
  let world = w0, view = v0, reduced = reduced0;
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.8;
  controls.zoomToCursor = true;
  controls.listenToKeyEvents(canvas);
  // the glide toward a view: from where the camera is to target + offset·distance (on the wall clock: it takes
  // GLIDE_MS however slow the frames are); where the car's framing was the last frame
  let glide: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
  const carAt = new THREE.Vector3();
  const follow = (): void => {
    const f = frame();
    if (f) carAt.copy(world.focus('car', f).target);
  };
  // the target within reach of the building (round the whole shaft's middle), the camera no further than its framing
  // with room to step back; the far plane past it
  const bound = (): void => {
    const s = world.focus('shaft', null);
    controls.cursor.copy(s.target);
    controls.maxTargetRadius = 0.6 * s.distance + 2;
    controls.maxDistance = Math.max(30, 1.4 * s.distance);
    camera.far = Math.max(160, controls.maxDistance + s.distance);
    camera.updateProjectionMatrix();
  };
  const place = (v: View, animate: boolean): void => {
    view = v;
    const f = world.focus(v, frame());
    const to = f.target.clone().addScaledVector(OFFSET[v], f.distance);
    follow();
    if (!animate || reduced) {
      controls.target.copy(f.target);
      camera.position.copy(to);
      glide = null;
    } else glide = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: f.target.clone(), start: performance.now() };
  };
  // the user's own move ends a glide where it is
  const stopGlide = (): void => { glide = null; };
  controls.addEventListener('start', stopGlide);
  // + and − zoom toward the target from the keyboard (the arrows pan, Shift or Ctrl with them orbit: OrbitControls)
  const onKey = (e: KeyboardEvent): void => {
    const k = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' ? ZOOM_STEP : e.key === '-' || e.code === 'NumpadSubtract' ? 1 / ZOOM_STEP : 0;
    if (!k) return;
    e.preventDefault();
    glide = null;
    const d = camera.position.clone().sub(controls.target).multiplyScalar(k);
    camera.position.copy(controls.target).add(d.setLength(THREE.MathUtils.clamp(d.length(), controls.minDistance, controls.maxDistance)));
    controls.update();
  };
  const onDouble = (): void => place(view, true);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('dblclick', onDouble);
  bound();
  place(v0, false);

  return {
    controls,
    view: () => view,
    gliding: () => glide !== null,
    place,
    setWorld(w) {
      world = w;
      bound();
      follow();
    },
    setReducedMotion(on) {
      reduced = on;
      controls.enableDamping = !on;
    },
    step(now, f) {
      // the car's motion since the last frame, carried by the glide's end or by the camera and its target alike
      const want = view === 'car' && f ? world.focus('car', f).target : null, d = want ? want.clone().sub(carAt) : null;
      if (want) carAt.copy(want);
      if (glide) {
        if (d) {
          glide.to.add(d);
          glide.tTo.add(d);
        }
        const u = Math.min(1, Math.max(0, (now - glide.start) / GLIDE_MS)), k = u * u * (3 - 2 * u);
        camera.position.lerpVectors(glide.from, glide.to, k);
        controls.target.lerpVectors(glide.tFrom, glide.tTo, k);
        if (u >= 1) glide = null;
      } else if (d) {
        controls.target.add(d);
        camera.position.add(d);
      }
    },
    dispose() {
      controls.removeEventListener('start', stopGlide);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('dblclick', onDouble);
      controls.dispose();
    },
  };
}
