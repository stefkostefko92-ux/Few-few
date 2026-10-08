// Boots the 3D installation, on the landing page's pipeline (src/components/machine/boot.ts, here pipeline.ts): WebGPU
// on a hardware adapter (the top quality tier on a large screen), else WebGL 2, never on a software rasteriser. An orbit
// camera with four views (car, whole shaft, machine, pit), free to orbit, pan and zoom (camera.ts); the car view follows
// the car. The simulation's clock gives
// the state of every frame; frames are drawn only while something moves, at the resolution the governor holds the
// frame rate with, and once the scene is at rest its last frames are drawn sharper (supersampled where the screen's
// own resolution is lower: resolution.ts). Every part's pipeline is compiled before the first frame. Everything freed on
// dispose. Loaded lazily by LiftStage.tsx.
import * as THREE from 'three/webgpu';
import type { LiftDerived } from '@/lib/lift';
import type { SimClock } from '../lift/clock';
import { gradeUniforms } from '../machine/grade';
import { acceptIdentitySwizzle, hardwareWebGPU, softwareRenderer } from '../machine/gpu';
import { createGovernor, initialQuality } from '../machine/quality';
import { buildStage, releaseStage, type Stage } from './pipeline';
import { createViewCamera, type View } from './camera';
import { motionRatio, stillRatio } from './resolution';
import { LIFT_FOV, type LiftWorld } from './world';

export type { View } from './camera';

export interface LiftHandle {
  setActive(active: boolean): void;
  /** the design changed: a new world replaces the old one once its shaders are ready (the camera stays) */
  setDesign(dv: LiftDerived): Promise<void>;
  /** to the framing of `view` (again: back to it) */
  setView(view: View): void;
  setZones(on: boolean): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
}

export interface LiftBootOptions {
  signal: AbortSignal;
  clock: SimClock;
  view: View;
  /** no camera easing, no following glide: jumps */
  reducedMotion: boolean;
  onReady(): void;
  onFail(): void;
}

// frames rendered after the last change, for the temporal filters (TRAA, GTAO) to settle
const SETTLE_FRAMES = 16;
// a device that cannot animate the scene (software rendering): frames slower than SLOW_MS first drop the resolution to
// the lowest scale; SLOW_RUN of them in a row there end the 3D, the charts carry the simulation, the page stays responsive
const SLOW_MS = 250;
const SLOW_RUN = 6;
// frames without a change before the still picture is drawn sharper; a sharper frame slower than REFINE_MAX_MS ends
// the sharper stills for the session (a GPU that cannot afford them)
const QUIET_FRAMES = 3;
const REFINE_MAX_MS = 140;

export async function bootLift(canvas: HTMLCanvasElement, dv: LiftDerived, opts: LiftBootOptions): Promise<LiftHandle | null> {
  acceptIdentitySwizzle();
  let renderer: THREE.WebGPURenderer, gpu: boolean;
  try {
    gpu = await hardwareWebGPU();
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', forceWebGL: !gpu });
    await renderer.init();
  } catch {
    return null;
  }
  if (opts.signal.aborted || softwareRenderer(renderer.getContext())) {
    renderer.dispose();
    return null;
  }
  const quality = initialQuality(matchMedia('(pointer: coarse)').matches, Math.min(screen.width, screen.height), gpu);
  const P = gradeUniforms();
  P.grain.value = 0;
  P.ca.value = 0;
  P.vignette.value = 0.16;
  P.exposure.value = 1.08;
  const camera = new THREE.PerspectiveCamera(LIFT_FOV, 4 / 3, 0.05, 160);
  const build = (design: LiftDerived): Stage | null => buildStage(renderer, design, quality, camera, P);
  const release = releaseStage;
  const initial = build(dv);
  if (!initial) {
    renderer.dispose();
    return null;
  }
  let stage: Stage = initial;
  let world: LiftWorld = stage.world;

  // the zones switch, kept across a change of design; the count of designs asked for (the latest wins)
  let zonesOn = false, designs = 0;

  // the pipelines are compiled before the first frame: a short warm-up, from the tier's starting scale
  const governor = createGovernor({ warmupMs: 800, startScale: quality.startScale });
  // a still picture drawn sharper; off for the session on a GPU too slow for it
  let refining = false, refineOff = false;
  function resize(): void {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(refining ? stillRatio(quality, w, h) : motionRatio(quality, governor.scale, w, h, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    P.aspect.value = w / h;
  }
  // on demand: frames while the run plays and while the camera moves, glides or catches up with the car (the controls
  // report every move), then a few more; a still scene costs nothing
  let still = 0;
  const wake = (): void => {
    still = 0;
    if (refining) {
      refining = false;
      resize();
    }
  };
  const offClock = opts.clock.subscribe(wake);
  const cam = createViewCamera(camera, canvas, world, opts.view, opts.reducedMotion, () => opts.clock.frame()), controls = cam.controls;
  controls.addEventListener('change', wake);
  const sizer = new ResizeObserver(() => { resize(); wake(); });
  sizer.observe(canvas);
  resize();
  const first = opts.clock.frame();
  if (first) world.update(first, camera.position, controls.target);

  let disposed = false, active = false, frames = 0, last = performance.now(), prevRendered = false, lastRendered = 0, slowRun = 0, prevSharp = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    sizer.disconnect();
    offClock();
    controls.removeEventListener('change', wake);
    cam.dispose();
    canvas.removeEventListener('webglcontextlost', fail);
    release(stage);
    const ctx = renderer.getContext();
    renderer.dispose();
    if (ctx instanceof WebGL2RenderingContext) ctx.getExtension('WEBGL_lose_context')?.loseContext();
  }
  function fail(): void {
    if (disposed) return;
    dispose();
    opts.onFail();
  }
  renderer.onDeviceLost = fail;
  canvas.addEventListener('webglcontextlost', fail);

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (opts.clock.playing || cam.gliding()) wake();
    if (still > SETTLE_FRAMES) {
      controls.update();
      prevRendered = false;
      return;
    }
    // at rest: the last frames at the still resolution (the temporal filters settle on them)
    if (!refining && !refineOff && still === QUIET_FRAMES) {
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      if (stillRatio(quality, w, h) > renderer.getPixelRatio() + 0.05) {
        refining = true;
        resize();
        still = 0;
      }
    }
    if (prevRendered && prevSharp && now - lastRendered > REFINE_MAX_MS) {
      refineOff = true;
      refining = false;
      resize();
    } else if (prevRendered && frames > 4 && !prevSharp && !refining) {
      slowRun = now - lastRendered > SLOW_MS ? slowRun + 1 : 0;
      if (slowRun >= SLOW_RUN / 2 && governor.floor(now)) {
        resize();
        slowRun = 0;
      } else if (slowRun >= SLOW_RUN) return fail();
    }
    // the governor reads the moving frames only
    if (!refining && !prevSharp && governor.sample(dt * 1000, now)) resize();
    const f = opts.clock.frame();
    if (f) world.update(f, camera.position, controls.target);
    // the glide toward a view, the car followed by its motion (camera.ts)
    cam.step(now, f);
    controls.update();
    try {
      stage.pipeline.render();
    } catch {
      return fail();
    }
    frames += 1;
    still += 1;
    prevRendered = true;
    prevSharp = refining;
    lastRendered = now;
    if (frames === 4) opts.onReady();
  }

  try {
    await stage.world.compile(camera);
  } catch {
    dispose();
    return null;
  }
  if (opts.signal.aborted) {
    dispose();
    return null;
  }
  return {
    setActive(next) {
      if (disposed || next === active) return;
      active = next;
      if (next) {
        last = performance.now();
        governor.reset(last);
        prevRendered = false;
        wake();
      }
      renderer.setAnimationLoop(next ? frame : null);
    },
    async setDesign(next) {
      // only the latest design is put on: an older one finishing its compile later is dropped
      const ticket = ++designs;
      const st = build(next);
      if (!st) return;
      try {
        await st.world.compile(camera);
      } catch {
        release(st);
        return;
      }
      if (disposed || ticket !== designs) { release(st); return; }
      const old = stage;
      stage = st;
      world = st.world;
      world.setZones(zonesOn);
      cam.setWorld(world);
      const f = opts.clock.frame();
      if (f) world.update(f, camera.position, controls.target);
      release(old);
      wake();
    },
    setView(v) {
      cam.place(v, true);
      wake();
    },
    setReducedMotion(on) {
      cam.setReducedMotion(on);
    },
    setZones(on) {
      zonesOn = on;
      world.setZones(on);
      wake();
    },
    dispose,
  };
}

