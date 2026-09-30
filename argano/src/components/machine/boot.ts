// Boots the machine stage, after boy's main.js and pipeline.js (Nexus combat engine): WebGPU with the WebGL 2
// fallback of three's WebGPURenderer; film pipeline scene (HDR + velocity MRT) → TRAA → bloom → grade; a frame-time
// governor on the internal resolution; shaders warmed up before the curtain rises; everything freed on dispose.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, velocity } from 'three/tsl';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { buildWorld, type Pointer } from './scene';
import { grade, gradeUniforms, lensGlow } from './grade';
import { QUALITY, createGovernor, initialQuality, stageGrade } from './quality';

export interface MachineHandle {
  /** Runs the loop only while the stage is on screen and the tab visible. */
  setActive(active: boolean): void;
  dispose(): void;
}
export interface BootOptions {
  signal: AbortSignal;
  /** One fixed frame (the poster, scripts/render-poster.mjs): no clock, no sway, no grain. */
  still: boolean;
  onReady(): void;
  onFail(): void;
}

// Older Chromium builds reject the identity swizzle 'rgba' that three.js always passes (boy: gpu-compat.js).
// Dropping an identity swizzle changes nothing.
function acceptIdentitySwizzle(): void {
  const ctor: unknown = Reflect.get(globalThis, 'GPUTexture');
  const proto: unknown = typeof ctor === 'function' ? Reflect.get(ctor, 'prototype') : null;
  if (typeof proto !== 'object' || proto === null || Reflect.get(proto, '__arganoSwizzle') === true) return;
  const createView: unknown = Reflect.get(proto, 'createView');
  if (typeof createView !== 'function') return;
  Reflect.set(proto, '__arganoSwizzle', true);
  Reflect.set(proto, 'createView', function view(this: object, desc?: { swizzle?: unknown }): unknown {
    if (desc?.swizzle !== 'rgba') return Reflect.apply(createView, this, [desc]) as unknown;
    const rest: Record<string, unknown> = { ...desc };
    delete rest.swizzle;
    return Reflect.apply(createView, this, [rest]) as unknown;
  });
}

const REST: Pointer = { x: 0, y: 0 };

// WebGPU only on a hardware adapter: a software fallback adapter is slower than WebGL 2 and, in some browsers,
// unstable (errors from its error scopes every frame). Then three's WebGL 2 backend draws the same pipeline.
async function hardwareWebGPU(): Promise<boolean> {
  const gpu: unknown = Reflect.get(navigator, 'gpu');
  const request: unknown = typeof gpu === 'object' && gpu !== null ? Reflect.get(gpu, 'requestAdapter') : null;
  if (typeof gpu !== 'object' || gpu === null || typeof request !== 'function') return false;
  try {
    const adapter: unknown = await (Reflect.apply(request, gpu, []) as Promise<unknown>);
    if (typeof adapter !== 'object' || adapter === null) return false;
    const info: unknown = Reflect.get(adapter, 'info');
    return !(Reflect.get(adapter, 'isFallbackAdapter') === true || (typeof info === 'object' && info !== null && Reflect.get(info, 'isFallbackAdapter') === true));
  } catch {
    return false;
  }
}

// @types/three 0.186 leaves out TRAANode.getTextureNode(), which three 0.186 has (TRAANode.js): the resolved frame.
function resolvedTexture(node: object): THREE.TextureNode {
  const get: unknown = Reflect.get(node, 'getTextureNode');
  const texture: unknown = typeof get === 'function' ? Reflect.apply(get, node, []) : null;
  if (!(texture instanceof THREE.TextureNode)) throw new Error('TRAA result is not a texture node');
  return texture;
}

export async function bootMachine(canvas: HTMLCanvasElement, opts: BootOptions): Promise<MachineHandle | null> {
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
  const quality = opts.still ? { ...QUALITY.high, maxDPR: 3 } : initialQuality(matchMedia('(pointer: coarse)').matches, Math.min(screen.width, screen.height));
  const P = gradeUniforms();
  if (opts.still) P.grain.value = 0;
  let world: ReturnType<typeof buildWorld>, pipeline: THREE.RenderPipeline;
  try {
    world = buildWorld(renderer, quality);
    pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false; // the grade outputs display-referred sRGB
    const scenePass = pass(world.scene, world.camera);
    scenePass.setMRT(mrt({ output, velocity }));
    let image: THREE.TextureNode = scenePass.getTextureNode('output');
    if (quality.traa) image = resolvedTexture(traa(image, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), world.camera));
    pipeline.outputNode = grade(image, quality.bloom ? lensGlow(image) : null, P);
  } catch {
    renderer.dispose();
    return null;
  }

  const governor = createGovernor();
  function resize(): void {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, quality.maxDPR) * governor.scale));
    renderer.setSize(w, h, false);
    world.frame(w / h);
    const g = stageGrade(w / h);
    P.aspect.value = w / h;
    P.exposure.value = g.exposure;
    P.vignette.value = g.vignette;
  }
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);
  resize();

  // A little parallax toward a fine pointer over the stage; touch screens keep the slow sway only.
  const pointer: Pointer = { x: 0, y: 0 };
  const host = canvas.parentElement ?? canvas;
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const r = host.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const onLeave = (): void => { pointer.x = 0; pointer.y = 0; };
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave);

  let disposed = false, active = false, frames = 0, t = 0, last = performance.now();
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    sizer.disconnect();
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('webglcontextlost', fail);
    pipeline.dispose();
    world.dispose();
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
    const dtMs = now - last;
    last = now;
    if (!opts.still) {
      if (governor.sample(dtMs, now)) resize();
      if (governor.hopeless) return fail(); // too slow even at half resolution: back to the picture
      t += Math.min(0.05, dtMs / 1000);
    }
    world.update(t, opts.still ? 1 : Math.min(0.05, dtMs / 1000), opts.still ? REST : pointer);
    P.time.value = opts.still ? 0 : now / 1000;
    try {
      pipeline.render();
    } catch {
      return fail();
    }
    frames += 1;
    // TRAA settles over a few frames: the still waits longer, the live stage shows up quickly.
    if (frames === (opts.still ? 32 : 6)) {
      if (opts.still) {
        renderer.setAnimationLoop(null); // the still is done: the canvas keeps the last frame
        canvas.dataset.still = 'ready';
      }
      opts.onReady();
    }
  }

  // Warm up every shader and pipeline before the curtain rises (boy: compileAsync before the first frame).
  world.update(0, 1, REST);
  try {
    await renderer.compileAsync(world.scene, world.camera);
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
      }
      renderer.setAnimationLoop(next ? frame : null);
    },
    dispose,
  };
}
