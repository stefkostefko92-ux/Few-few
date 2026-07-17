/**
 * Tiny, dependency-free graphics-params + core registry. Lives apart from
 * render.ts (which pulls in three.js) so the opt-in gfx panel can be wired at
 * app start without dragging the whole renderer into the main bundle.
 */
export type AAMode = "TAA" | "SMAA" | "none";

/** Coarse device-capability bucket that scales the rendering cost. */
export type QualityTier = "low" | "mid" | "high";

export interface GfxParams {
  renderer: "auto" | "webgl";
  tier: QualityTier;
  /** Upper bound on devicePixelRatio (the real DPR is min()'d with this). */
  pixelRatio: number;
  /** Shadow-map edge in texels (RenderCore clamps scene lights to this). */
  shadowSize: number;
  exposure: number;
  toneMapping: boolean;
  bloom: { enabled: boolean; strength: number; radius: number; threshold: number };
  ao: { enabled: boolean; radius: number; intensity: number };
  /** Gentle post vignette that frames the board toward its focal centre. */
  vignette: { enabled: boolean; offset: number; darkness: number };
  ssr: { enabled: boolean };
  aa: AAMode;
  shadows: boolean;
  environment: number;
}

/**
 * Backend preference. Defaults to the battle-tested WebGL2 path; WebGPU is
 * opt-in via `?renderer=webgpu` until its TSL post graph has real-browser
 * mileage (the untested graph shipped a red-tinted board to prod Chrome).
 */
function rendererPref(): "auto" | "webgl" {
  if (typeof location === "undefined") return "webgl";
  return new URLSearchParams(location.search).get("renderer") === "webgpu" ? "auto" : "webgl";
}

/**
 * Classify the device so the photoreal pipeline degrades gracefully:
 *  • low  — phones / tablets, or anything memory- or core-starved: cheap path
 *           (no GTAO, no bloom, 1024 shadows, ~1.25× pixels).
 *  • mid  — capable touch devices and modest laptops.
 *  • high — desktops with ample memory/cores: the full effect stack.
 * `?gfx_tier=low|mid|high` forces a tier (for testing on any machine).
 */
export function detectTier(): QualityTier {
  if (typeof navigator === "undefined") return "high";
  const forced = typeof location !== "undefined" && new URLSearchParams(location.search).get("gfx_tier");
  if (forced === "low" || forced === "mid" || forced === "high") return forced;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const mobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);

  if (mobile || coarse) return mem <= 4 || cores <= 4 ? "low" : "mid";
  return mem <= 4 || cores <= 4 ? "mid" : "high";
}

export function defaultGfxParams(): GfxParams {
  const tier = detectTier();
  const low = tier === "low";
  const high = tier === "high";
  return {
    renderer: rendererPref(),
    tier,
    pixelRatio: low ? 1.25 : tier === "mid" ? 1.5 : 2,
    shadowSize: low ? 1024 : 2048,
    exposure: 1.0,
    toneMapping: true,
    // Fine bloom: only genuine highlights (threshold > 1) glow, so bright diffuse
    // surfaces (white tiles, ivory pieces) stay crisp rather than washing out.
    // Bloom is a multi-pass effect, so it's dropped on low-end devices.
    bloom: { enabled: !low, strength: 0.08, radius: 0.45, threshold: 1.3 },
    // GTAO is the priciest pass — high tier only.
    ao: { enabled: high, radius: 0.5, intensity: 1.0 },
    // Single cheap fullscreen pass — on for every tier. Subtle by design: the
    // centre plateau stays at full brightness, only the far corners ease down.
    vignette: { enabled: true, offset: 1.06, darkness: 0.78 },
    ssr: { enabled: false },
    aa: "SMAA",
    shadows: true,
    // Scenes already carry their own light rigs; IBL adds reflections + fill, so
    // keep it moderate to avoid stacking into an over-exposed, washed-out image.
    environment: 0.55,
  };
}

/** What the gfx panel needs from a render core. */
export interface GfxControllable {
  params: GfxParams;
  isWebGPU: boolean;
  applyParams(opts?: { rebuild?: boolean }): void;
}

const CORES = new Set<GfxControllable>();
export function registerCore(c: GfxControllable): void {
  CORES.add(c);
}
export function unregisterCore(c: GfxControllable): void {
  CORES.delete(c);
}
/** The most recently mounted core — the scene currently on screen. */
export function activeCore(): GfxControllable | null {
  return [...CORES].at(-1) ?? null;
}
