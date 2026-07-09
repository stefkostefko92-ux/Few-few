/**
 * RenderCore — shared near-photoreal rendering pipeline for every 3D game scene.
 *
 *  • Renderer: WebGPU primary (async init) with a WebGL2 fallback.
 *  • IBL: PMREM-filtered environment on scene.environment (procedural studio by
 *    default; an equirect HDRI can be supplied and is loaded + filtered).
 *  • Colour: ACES Filmic tone mapping + sRGB output + live exposure.
 *  • Shadows: PCFSoft, 2048 maps (scenes configure their own lights/cameras).
 *  • Post — WebGL2: EffectComposer (Render/TAA → GTAO → SSR → Bloom → SMAA →
 *    Output). WebGPU: TSL node graph (pass + MRT normals → ao → ssr → bloom,
 *    tone-mapped output).
 *  • A continuous animation loop (so TAA/TRAA converge and motion is smooth),
 *    paused when the tab is hidden; scenes get a per-frame `onFrame(now)` hook.
 *
 * Scenes own a RenderCore instead of a raw renderer/composer; they keep all of
 * their own geometry, lights, camera and gameplay logic untouched.
 */
import {
  ACESFilmicToneMapping,
  type Camera,
  Color,
  EquirectangularReflectionMapping,
  NoToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  type Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import {
  type AAMode,
  type GfxControllable,
  type GfxParams,
  defaultGfxParams,
  registerCore,
  unregisterCore,
} from "./gfxRegistry.js";
// WebGL2 post stack (EffectComposer). WebGPU post is lazy-imported on demand.
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { TAARenderPass } from "three/examples/jsm/postprocessing/TAARenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { SSRPass } from "three/examples/jsm/postprocessing/SSRPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

export type { AAMode, GfxParams };

export interface RenderCoreOpts {
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: Camera;
  width: number;
  /** height = width * ratio. */
  ratio: number;
  background?: string;
  /** Per-scene starting exposure (the gui can retune it live). */
  exposure?: number;
  /** Optional equirect .hdr URL for IBL; falls back to a procedural studio. */
  hdri?: string;
  /**
   * Per-frame hook for scene animation (advance tweens here, no rendering).
   * Return `true` while an animation is in flight so the loop renders at full
   * rate; return `false`/nothing when idle so the loop throttles to save power.
   */
  onFrame?: (nowMs: number) => boolean | void;
  /** Initial graphics params (shared so a single gui can drive several cores). */
  params?: GfxParams;
}

interface PostHandle {
  render: () => void;
  setSize: (w: number, h: number) => void;
  rebuild: () => void;
  applyLive: () => void;
  dispose: () => void;
}

export class RenderCore implements GfxControllable {
  readonly params: GfxParams;
  isWebGPU = false;
  readonly ready: Promise<void>;
  private renderer!: WebGLRenderer; // WebGL or WebGPU (duck-typed at runtime)
  private scene: Scene;
  private camera: Camera;
  private ratio: number;
  private width: number;
  private pmrem: PMREMGenerator | null = null;
  private envTex: { dispose?: () => void } | null = null;
  private gpuMod: typeof import("three/webgpu") | null = null;
  private post!: PostHandle;
  private onFrame?: (n: number) => boolean | void;
  private disposed = false;
  private dirty = true; // force a render on the next tick (state change / resize)
  private lastRenderAt = 0;
  private onVis = () => this.applyLoop();

  constructor(opts: RenderCoreOpts) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.ratio = opts.ratio;
    this.width = opts.width;
    this.onFrame = opts.onFrame;
    this.params = opts.params ?? defaultGfxParams();
    if (opts.exposure !== undefined && !opts.params) this.params.exposure = opts.exposure;
    if (opts.background) this.scene.background = new Color(opts.background);
    this.ready = this.init(opts);
  }

  private async init(opts: RenderCoreOpts): Promise<void> {
    const useGPU =
      this.params.renderer === "auto" &&
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      !!(navigator as { gpu?: unknown }).gpu;

    if (useGPU) {
      try {
        const webgpu = await import("three/webgpu");
        const r = new webgpu.WebGPURenderer({ canvas: opts.canvas, antialias: true, alpha: true });
        await r.init();
        this.renderer = r as unknown as WebGLRenderer;
        this.gpuMod = webgpu;
        this.isWebGPU = true;
      } catch {
        this.isWebGPU = false;
        this.gpuMod = null;
      }
    }
    if (!this.renderer) {
      this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true });
    }

    const h = this.width * this.ratio;
    this.renderer.setPixelRatio(Math.min(this.params.pixelRatio, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(this.width, h, false);
    this.renderer.shadowMap.enabled = this.params.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.clampShadows();
    this.applyToneMapping();

    await this.setupEnvironment(opts.hdri);
    this.post = this.isWebGPU ? await this.buildWebGPUPost() : this.buildWebGLPost();

    if (this.disposed) {
      this.dispose();
      return;
    }
    registerCore(this);
    document.addEventListener("visibilitychange", this.onVis);
    this.applyLoop();
  }

  /** Clamp every scene light's shadow map to the device-tier budget (scenes
   *  author 2048 maps; low-end devices get 1024 to halve the shadow cost). */
  private clampShadows(): void {
    const max = this.params.shadowSize;
    this.scene.traverse((o) => {
      const l = o as {
        castShadow?: boolean;
        shadow?: { mapSize: { x: number; y: number; set: (a: number, b: number) => void }; map?: { dispose?: () => void } | null };
      };
      if (l.castShadow && l.shadow && (l.shadow.mapSize.x > max || l.shadow.mapSize.y > max)) {
        l.shadow.mapSize.set(Math.min(l.shadow.mapSize.x, max), Math.min(l.shadow.mapSize.y, max));
        l.shadow.map?.dispose?.();
        l.shadow.map = null;
      }
    });
  }

  private applyToneMapping(): void {
    this.renderer.toneMapping = this.params.toneMapping ? ACESFilmicToneMapping : NoToneMapping;
    this.renderer.toneMappingExposure = this.params.exposure;
    // Output colour space defaults to sRGB in three >= r152; kept explicit-safe.
  }

  /**
   * PMREM IBL environment: a supplied HDRI, else a procedural studio room.
   * WebGPU ships its own PMREMGenerator (the core/WebGL one reads renderer.state
   * which a WebGPU backend lacks), so pick the implementation that matches the
   * active backend. Any failure degrades gracefully — scenes keep their own
   * lights, so the worst case is no reflections rather than a blank canvas.
   */
  private async setupEnvironment(hdri?: string): Promise<void> {
    const PMREM = (this.isWebGPU && this.gpuMod ? this.gpuMod.PMREMGenerator : PMREMGenerator) as typeof PMREMGenerator;
    try {
      this.pmrem = new PMREM(this.renderer as never);
      if (hdri) {
        try {
          const tex = await new RGBELoader().loadAsync(hdri);
          tex.mapping = EquirectangularReflectionMapping;
          const env = this.pmrem.fromEquirectangular(tex);
          this.scene.environment = env.texture;
          this.envTex = env;
          tex.dispose();
          this.scene.environmentIntensity = this.params.environment;
          return;
        } catch {
          /* fall through to procedural */
        }
      }
      const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = env.texture;
      this.envTex = env;
      this.scene.environmentIntensity = this.params.environment;
    } catch (err) {
      // IBL is an enhancement, not a hard requirement — never block rendering.
      console.warn("RenderCore: environment setup failed, continuing without IBL", err);
      this.scene.environment = null;
    }
  }

  // ── WebGL2 post: EffectComposer ────────────────────────────────────────────
  private buildWebGLPost(): PostHandle {
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    const params = this.params;
    let w = this.width;
    let h = this.width * this.ratio;

    let composer: InstanceType<typeof EffectComposer>;
    let passes: Array<{ dispose?: () => void }> = [];
    let bloomPass: UnrealBloomPass | null = null;
    let gtaoPass: GTAOPass | null = null;

    const build = () => {
      composer = new EffectComposer(renderer);
      passes = [];
      const add = (p: { dispose?: () => void }) => {
        composer.addPass(p as never);
        passes.push(p);
      };

      if (params.aa === "TAA") {
        const taa = new TAARenderPass(scene, camera);
        taa.sampleLevel = 2;
        taa.accumulate = true;
        add(taa);
      } else {
        add(new RenderPass(scene, camera));
      }
      if (params.ao.enabled) {
        gtaoPass = new GTAOPass(scene, camera, w, h);
        const O = (GTAOPass as unknown as { OUTPUT?: { Default?: number } }).OUTPUT;
        (gtaoPass as unknown as { output: number }).output = O?.Default ?? 0;
        add(gtaoPass);
      }
      if (params.ssr.enabled) {
        add(new SSRPass({ renderer, scene, camera, width: w, height: h, selects: null, groundReflector: null }));
      }
      if (params.bloom.enabled) {
        bloomPass = new UnrealBloomPass(new Vector2(w, h), params.bloom.strength, params.bloom.radius, params.bloom.threshold);
        add(bloomPass);
      }
      add(new OutputPass());
      if (params.aa === "SMAA") add(new SMAAPass());
      composer.setSize(w, h);
    };
    build();

    return {
      render: () => composer.render(),
      setSize: (nw, nh) => {
        w = nw;
        h = nh;
        composer.setSize(nw, nh);
      },
      applyLive: () => {
        if (bloomPass) {
          bloomPass.strength = params.bloom.strength;
          bloomPass.radius = params.bloom.radius;
          bloomPass.threshold = params.bloom.threshold;
        }
        const g = gtaoPass as unknown as { updateGtaoMaterial?: (p: object) => void } | null;
        g?.updateGtaoMaterial?.({ radius: params.ao.radius });
      },
      rebuild: () => {
        for (const p of passes) p.dispose?.();
        composer.dispose();
        build();
      },
      dispose: () => {
        for (const p of passes) p.dispose?.();
        composer.dispose();
      },
    };
  }

  // ── WebGPU post: TSL node graph ────────────────────────────────────────────
  private async buildWebGPUPost(): Promise<PostHandle> {
    const { PostProcessing } = await import("three/webgpu");
    const tsl = await import("three/tsl");
    const tslAny = tsl as unknown as {
      pass: (s: Scene, c: Camera) => { getTextureNode: (k?: string) => unknown; setMRT: (m: unknown) => void };
      mrt: (o: Record<string, unknown>) => unknown;
      output: unknown;
      normalView: unknown;
      vec3: (x: unknown) => unknown;
      vec4: (x: unknown, w: number) => unknown;
    };
    const { pass, mrt, output, vec3, vec4 } = tslAny;
    const normalNode = tslAny.normalView;
    const { bloom } = (await import("three/addons/tsl/display/BloomNode.js")) as { bloom: (n: unknown, s?: number, r?: number, t?: number) => { strength: { value: number }; radius: { value: number }; threshold: { value: number } } };
    // GTAONode renders into a RedFormat target: sampling yields vec4(ao,0,0,1).
    // The type bakes in the ONLY correct composition — broadcast .r over RGB —
    // because a raw vec4 multiply zeroes G/B and turns the whole frame red.
    const { ao } = (await import("three/addons/tsl/display/GTAONode.js")) as {
      ao: (d: unknown, n: unknown, c: Camera) => {
        radius: { value: number };
        scale: { value: number };
        getTextureNode: () => { r: unknown };
      };
    };

    const params = this.params;
    const post = new PostProcessing(this.renderer as never) as unknown as {
      outputNode: unknown;
      needsUpdate?: boolean;
      render: () => void;
      dispose?: () => void;
    };

    let bloomNode: { strength: { value: number }; radius: { value: number }; threshold: { value: number } } | null = null;
    let aoNode: { radius: { value: number }; scale: { value: number } } | null = null;

    const build = () => {
      const scenePass = pass(this.scene, this.camera);
      scenePass.setMRT(mrt({ output, normal: normalNode }));
      const color = scenePass.getTextureNode("output");
      const depth = scenePass.getTextureNode("depth");
      const normal = scenePass.getTextureNode("normal");

      let node: unknown = color;
      if (params.ao.enabled) {
        const gtao = ao(depth, normal, this.camera);
        gtao.radius.value = params.ao.radius;
        gtao.scale.value = params.ao.intensity;
        aoNode = gtao;
        // color × broadcast(ao.r): the official GTAONode composition.
        node = (color as { mul: (x: unknown) => unknown }).mul(vec4(vec3(gtao.getTextureNode().r), 1));
      }
      if (params.bloom.enabled) {
        bloomNode = bloom(node, params.bloom.strength, params.bloom.radius, params.bloom.threshold);
        node = (node as { add: (x: unknown) => unknown }).add(bloomNode);
      }
      (post as { outputNode: unknown }).outputNode = node;
      (post as { needsUpdate?: boolean }).needsUpdate = true;
    };
    build();

    return {
      // PostProcessing.render() drives the node graph; it must be used inside the
      // animation loop instead of renderer.render() (per the WebGPU PostProcessing API).
      render: () => post.render(),
      setSize: () => {
        /* PostProcessing tracks the renderer size automatically. */
      },
      applyLive: () => {
        if (bloomNode) {
          bloomNode.strength.value = params.bloom.strength;
          bloomNode.radius.value = params.bloom.radius;
          bloomNode.threshold.value = params.bloom.threshold;
        }
        if (aoNode) {
          aoNode.radius.value = params.ao.radius;
          aoNode.scale.value = params.ao.intensity;
        }
      },
      rebuild: build,
      dispose: () => post.dispose?.(),
    };
  }

  // ── loop / lifecycle ───────────────────────────────────────────────────────
  /** Idle frame rate: when nothing is animating the loop renders this slowly to
   *  spare the battery/GPU; it snaps back to display rate the instant a scene
   *  reports activity (onFrame → true) or something calls invalidate(). */
  private static readonly IDLE_FPS = 15;

  private applyLoop(): void {
    const hidden = typeof document !== "undefined" && document.hidden;
    if (hidden || this.disposed) {
      this.renderer.setAnimationLoop(null);
      return;
    }
    const idleInterval = 1000 / RenderCore.IDLE_FPS;
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      // onFrame runs every display tick (it's cheap); rendering is what we gate.
      const active = this.onFrame ? this.onFrame(now) !== false : true;
      const force = active || this.dirty;
      if (force || now - this.lastRenderAt >= idleInterval) {
        this.lastRenderAt = now;
        this.dirty = false;
        this.post.render();
      }
    });
  }

  /** Mark the scene changed so the loop renders promptly (used on state updates,
   *  resizes and gui edits). Safe to call from anywhere, anytime. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Request a one-off render (the continuous loop already covers most cases). */
  render(): void {
    this.dirty = true;
    if (!this.disposed && this.post) this.post.render();
  }

  setSize(width: number): void {
    this.width = width;
    if (!this.renderer) return; // pre-init: init() picks up the latest this.width
    const h = width * this.ratio;
    this.renderer.setSize(width, h, false);
    this.post?.setSize(width, h);
    this.dirty = true;
  }

  /** Apply gui edits: exposure/tone live; bloom live; structural changes rebuild. */
  applyParams(opts: { rebuild?: boolean } = {}): void {
    this.applyToneMapping();
    this.renderer.shadowMap.enabled = this.params.shadows;
    if (this.scene.environment) this.scene.environmentIntensity = this.params.environment;
    if (opts.rebuild) this.post?.rebuild();
    else this.post?.applyLive();
    this.dirty = true;
  }

  dispose(): void {
    this.disposed = true;
    unregisterCore(this);
    document.removeEventListener("visibilitychange", this.onVis);
    this.renderer?.setAnimationLoop(null);
    this.post?.dispose();
    this.envTex?.dispose?.();
    this.scene.environment = null;
    this.pmrem?.dispose();
    (this.renderer as { dispose?: () => void; forceContextLoss?: () => void })?.dispose?.();
    (this.renderer as { forceContextLoss?: () => void })?.forceContextLoss?.();
  }
}
