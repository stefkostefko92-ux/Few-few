/**
 * Tiny, dependency-free graphics-params + core registry. Lives apart from
 * render.ts (which pulls in three.js) so the opt-in gfx panel can be wired at
 * app start without dragging the whole renderer into the main bundle.
 */
export type AAMode = "TAA" | "SMAA" | "none";

export interface GfxParams {
  renderer: "auto" | "webgl";
  exposure: number;
  toneMapping: boolean;
  bloom: { enabled: boolean; strength: number; radius: number; threshold: number };
  ao: { enabled: boolean; radius: number; intensity: number };
  ssr: { enabled: boolean };
  aa: AAMode;
  shadows: boolean;
  environment: number;
}

/**
 * Backend preference. Defaults to "auto" (WebGPU when available, else WebGL2),
 * but `?renderer=webgl` forces the WebGL2 path — handy on machines whose WebGPU
 * driver is flaky, and for deterministic testing.
 */
function rendererPref(): "auto" | "webgl" {
  if (typeof location === "undefined") return "auto";
  return new URLSearchParams(location.search).get("renderer") === "webgl" ? "webgl" : "auto";
}

export function defaultGfxParams(): GfxParams {
  return {
    renderer: rendererPref(),
    exposure: 1.0,
    toneMapping: true,
    // Fine bloom: only genuine highlights (threshold > 1) glow, so bright diffuse
    // surfaces (white tiles, ivory pieces) stay crisp rather than washing out.
    bloom: { enabled: true, strength: 0.08, radius: 0.45, threshold: 1.3 },
    ao: { enabled: true, radius: 0.5, intensity: 1.0 },
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
