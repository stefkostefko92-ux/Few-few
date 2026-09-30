// Boots the 3D installation, on the landing page's pipeline (src/components/machine/boot.ts): WebGPU on a hardware
// adapter, else WebGL 2; scene (HDR + velocity MRT) → GTAO on the high tier → TRAA → grade. An orbit camera with four
// views (car, whole shaft, machine, pit); the car view follows the car. The simulation's clock gives the state of
// every frame; frames are drawn only while something moves. Everything freed on dispose. Loaded lazily by LiftStage.tsx.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, velocity, normalView, packNormalToRGB, unpackRGBToNormal, sample, screenUV, vec4, convertToTexture } from 'three/tsl';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LiftDerived } from '@/lib/lift';
import type { SimClock } from '../lift/clock';
import { grade, gradeUniforms } from '../machine/grade';
import { acceptIdentitySwizzle, hardwareWebGPU, resolvedTexture } from '../machine/gpu';
import { createGovernor, initialQuality } from '../machine/quality';
import { buildLiftWorld, LIFT_FOV, type LiftWorld } from './world';

export type View = 'car' | 'shaft' | 'room' | 'pit';

export interface LiftHandle {
  setActive(active: boolean): void;
  /** the design changed: a new world replaces the old one once its shaders are ready (the camera stays) */
  setDesign(dv: LiftDerived): Promise<void>;
  setView(view: View): void;
  setZones(on: boolean): void;
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

// where the camera stands relative to its target, per view (direction; the distance comes from the world)
const OFFSET: Record<View, THREE.Vector3> = {
  car: new THREE.Vector3(0.55, 0.28, 1).normalize(),
  shaft: new THREE.Vector3(0.62, 0.12, 1).normalize(),
  room: new THREE.Vector3(0.75, 0.62, 1).normalize(),
  pit: new THREE.Vector3(0.6, 0.45, 1).normalize(),
};

const GLIDE_MS = 700;
// frames rendered after the last change, for the temporal filters (TRAA, GTAO) to settle
const SETTLE_FRAMES = 16;
// a device that cannot animate the scene (software rendering): frames slower than SLOW_MS first drop the resolution to
// the lowest scale; SLOW_RUN of them in a row there end the 3D, the charts carry the simulation, the page stays responsive
const SLOW_MS = 250;
const SLOW_RUN = 6;

export async function bootLift(canvas: HTMLCanvasElement, dv: LiftDerived, opts: LiftBootOptions): Promise<LiftHandle | null> {
  acceptIdentitySwizzle();
  let renderer: THREE.WebGPURenderer;
  try {
    const forceWebGL = !(await hardwareWebGPU());
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', forceWebGL });
    await renderer.init();
  } catch {
    return null;
  }
  if (opts.signal.aborted) {
    renderer.dispose();
    return null;
  }
  const quality = initialQuality(matchMedia('(pointer: coarse)').matches, Math.min(screen.width, screen.height));
  const P = gradeUniforms();
  P.grain.value = 0;
  P.ca.value = 0;
  P.vignette.value = 0.16;
  P.exposure.value = 1.08;
  const camera = new THREE.PerspectiveCamera(LIFT_FOV, 4 / 3, 0.05, 160);
  // a world and the pipeline that renders it; replaced together when the design changes
  interface Stage { world: LiftWorld; pipeline: THREE.RenderPipeline; owned: { dispose(): void }[] }
  const build = (design: LiftDerived): Stage | null => {
    const owned: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(node: T): T => {
      owned.push(node);
      return node;
    };
    let world: LiftWorld | null = null;
    try {
      world = buildLiftWorld(renderer, design, quality);
      const pipeline = new THREE.RenderPipeline(renderer);
      pipeline.outputColorTransform = false;
      const scenePass = pass(world.scene, camera);
      scenePass.setMRT(mrt(quality.ao ? { output, velocity, normal: vec4(packNormalToRGB(normalView), 1) } : { output, velocity }));
      const depth = scenePass.getTextureNode('depth');
      let image: THREE.TextureNode = scenePass.getTextureNode('output');
      if (quality.ao) {
        scenePass.getTexture('normal').type = THREE.UnsignedByteType;
        const packed = scenePass.getTextureNode('normal');
        const occ = keep(ao(depth, sample((st) => unpackRGBToNormal(packed.sample(st).rgb)), camera));
        occ.resolutionScale = 0.5;
        occ.radius.value = 0.35;
        occ.samples.value = 12;
        occ.useTemporalFiltering = true;
        image = keep(convertToTexture(vec4(image.rgb.mul(occ.getTextureNode().sample(screenUV).r.mul(0.75).add(0.25)), image.a)));
      }
      image = resolvedTexture(keep(traa(image, depth, scenePass.getTextureNode('velocity'), camera)));
      pipeline.outputNode = grade(image, null, P);
      return { world, pipeline, owned };
    } catch {
      for (const node of owned) node.dispose();
      world?.dispose();
      return null;
    }
  };
  const release = (st: Stage): void => {
    st.pipeline.dispose();
    for (const node of st.owned) node.dispose();
    st.world.dispose();
  };
  const initial = build(dv);
  if (!initial) {
    renderer.dispose();
    return null;
  }
  let stage: Stage = initial;
  let world: LiftWorld = stage.world;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !opts.reducedMotion;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.8;
  controls.maxDistance = 120;
  let view: View = opts.view;
  // camera glide toward a view: from where it is to target + offset·distance
  // (on the wall clock: it takes GLIDE_MS however slow the frames are)
  let glide: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
  const place = (v: View, animate: boolean): void => {
    const f = world.focus(v, opts.clock.frame());
    const to = f.target.clone().addScaledVector(OFFSET[v], f.distance);
    if (!animate || opts.reducedMotion) {
      controls.target.copy(f.target);
      camera.position.copy(to);
      glide = null;
    } else glide = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: f.target.clone(), start: performance.now() };
  };

  const governor = createGovernor();
  function resize(): void {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, quality.maxDPR) * governor.scale));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    P.aspect.value = w / h;
  }
  // on demand: frames while the run plays and while the camera moves, glides or catches up with the car (the controls
  // report every move), then a few more; a still scene costs nothing
  let still = 0;
  const wake = (): void => { still = 0; };
  const offClock = opts.clock.subscribe(wake);
  controls.addEventListener('change', wake);
  const sizer = new ResizeObserver(() => { resize(); wake(); });
  sizer.observe(canvas);
  resize();
  const first = opts.clock.frame();
  if (first) world.update(first, camera.position);
  place(view, false);

  let disposed = false, active = false, frames = 0, last = performance.now(), prevRendered = false, lastRendered = 0, slowRun = 0;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    sizer.disconnect();
    offClock();
    controls.removeEventListener('change', wake);
    controls.dispose();
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

  const prevTarget = new THREE.Vector3();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (opts.clock.playing || glide) wake();
    if (still > SETTLE_FRAMES) {
      controls.update();
      prevRendered = false;
      return;
    }
    if (prevRendered && frames > 4) {
      slowRun = now - lastRendered > SLOW_MS ? slowRun + 1 : 0;
      if (slowRun >= SLOW_RUN / 2 && governor.floor(now)) {
        resize();
        slowRun = 0;
      } else if (slowRun >= SLOW_RUN) return fail();
    }
    if (governor.sample(dt * 1000, now)) resize();
    const f = opts.clock.frame();
    if (f) world.update(f, camera.position);
    if (glide) {
      const u = Math.min(1, Math.max(0, (now - glide.start) / GLIDE_MS)), k = u * u * (3 - 2 * u);
      camera.position.lerpVectors(glide.from, glide.to, k);
      controls.target.lerpVectors(glide.tFrom, glide.tTo, k);
      if (u >= 1) glide = null;
    } else if (view === 'car' && f) {
      // follow the car: target and camera move together, the angle the user chose stays
      const want = world.focus('car', f).target;
      prevTarget.copy(controls.target);
      controls.target.lerp(want, opts.reducedMotion ? 1 : 1 - Math.exp(-dt * 8));
      camera.position.add(prevTarget.sub(controls.target).negate());
    }
    controls.update();
    try {
      stage.pipeline.render();
    } catch {
      return fail();
    }
    frames += 1;
    still += 1;
    prevRendered = true;
    lastRendered = now;
    if (frames === 4) opts.onReady();
  }

  try {
    await renderer.compileAsync(stage.world.scene, camera);
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
      const st = build(next);
      if (!st) return;
      try {
        await renderer.compileAsync(st.world.scene, camera);
      } catch {
        release(st);
        return;
      }
      if (disposed) { release(st); return; }
      const old = stage;
      stage = st;
      world = st.world;
      const f = opts.clock.frame();
      if (f) world.update(f, camera.position);
      release(old);
      wake();
    },
    setView(v) {
      view = v;
      place(v, true);
      wake();
    },
    setZones(on) {
      world.setZones(on);
      wake();
    },
    dispose,
  };
}

