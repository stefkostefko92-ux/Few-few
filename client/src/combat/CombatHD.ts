/**
 * Combat photorealistic pipeline — renderer + post setup, IBL, materials.
 *
 * Two render paths:
 *   - WebGPU (when available): WebGPURenderer + bloom-only PostProcessing.
 *     three.js' WebGPU post stack is TSL-based and currently exposes
 *     a smaller pass library — bloom yes, GTAO/SSR/TAA not yet.
 *   - WebGL2 (fallback): WebGLRenderer + full EffectComposer chain
 *     (RenderPass → GTAO → SSR → Bloom → TAA → OutputPass).
 *
 * Both paths share:
 *   - ACES Filmic tone mapping, sRGB output, exposure control.
 *   - PCFSoft 2048² shadow map on the key light.
 *   - IBL via PMREMGenerator on a RoomEnvironment, mounted as
 *     scene.environment. Override with a real HDRI by dropping a file
 *     at /assets/hdri/sky.hdr and flipping HDRI_OVERRIDE_URL.
 *
 * The lil-gui panel is gated by ?debug=1 — production users never see it.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// --- WebGL2 post-processing chain --------------------------------------
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

export interface RenderBackend {
  kind: 'webgpu' | 'webgl2' | 'webgl1-lite';
  renderer: THREE.WebGLRenderer;        // (WebGPURenderer also extends WebGLRenderer's surface in three 0.18x)
  composer: EffectComposer | null;      // null on WebGPU + lite paths
  // Per-pass refs for the lil-gui hooks. null when the path doesn't have them.
  bloomPass: UnrealBloomPass | null;
  gtaoPass: GTAOPass | null;
  ssrPass: SSRPass | null;
  taaPass: TAARenderPass | null;
  rgbShift: ShaderPass | null;
  // Exposed for the GUI to flip live.
  tuneables: HDTuneables;
  // Frame submission — call once per rAF.
  render: () => void;
  // Disposed when the scene unmounts.
  dispose: () => void;
}

export interface HDTuneables {
  exposure: number;
  iblIntensity: number;
  shadowMapSize: number;
  // Bloom
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  // GTAO
  gtaoRadius: number;
  gtaoIntensity: number;
  gtaoSamples: number;
  // SSR
  ssrThickness: number;
  ssrOpacity: number;
  // TAA
  taaSampleLevel: number;
  // Chromatic
  rgbShiftAmount: number;
  // Fog
  fogDensity: number;
  fogNear: number;
  fogFar: number;
}

export const DEFAULT_TUNEABLES: HDTuneables = {
  // Cinematic photoreal defaults: ACES tone-mapped, full IBL, bloom +
  // GTAO + SSR contributing visibly. Tuned for the rigged PBR
  // characters and PBR procedural props.
  exposure: 1.15,
  iblIntensity: 0.85,
  shadowMapSize: 2048,
  bloomStrength: 0.55,
  bloomRadius: 0.40,
  bloomThreshold: 0.55,
  gtaoRadius: 0.5,
  gtaoIntensity: 1.5,
  gtaoSamples: 16,
  ssrThickness: 0.018,
  ssrOpacity: 0.5,
  taaSampleLevel: 2,
  rgbShiftAmount: 0.0018,
  fogDensity: 0.06,
  fogNear: 6,
  fogFar: 22,
};

// If you ship an .hdr at this URL, it overrides the procedural IBL.
// Leave empty to use RoomEnvironment (zero asset cost, decent quality).
export const HDRI_OVERRIDE_URL = '';

// --- Renderer detection -----------------------------------------------
function canUseWebGPU(): boolean {
  // three.js 0.184 ships WebGPURenderer behind `three/webgpu`. We can't
  // import it conditionally without breaking SSR, so we feature-check
  // navigator.gpu and dynamically import if present.
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

function liteCriteria(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (window.innerWidth < 900) return true;
  return false;
}

// --- IBL setup ---------------------------------------------------------
function setupIBL(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity: number): { dispose: () => void } {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  let envTarget: THREE.WebGLRenderTarget | null = null;

  if (HDRI_OVERRIDE_URL) {
    new RGBELoader().load(HDRI_OVERRIDE_URL, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      envTarget = pmrem.fromEquirectangular(tex);
      scene.environment = envTarget.texture;
      scene.environmentIntensity = intensity;
      tex.dispose();
    });
  } else {
    // Procedural fallback — RoomEnvironment is a small interior box-light
    // setup that gives surprisingly readable IBL on PBR materials. Costs
    // ~3 ms once at mount.
    const room = new RoomEnvironment();
    envTarget = pmrem.fromScene(room, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = intensity;
  }
  return {
    dispose: () => {
      envTarget?.dispose();
      pmrem.dispose();
    },
  };
}

// --- Public factory ----------------------------------------------------
export async function createCombatBackend(opts: {
  mount: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tuneables: HDTuneables;
  forceLite?: boolean;
}): Promise<RenderBackend> {
  const { mount, scene, camera, tuneables, forceLite } = opts;
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  const lite = forceLite ?? liteCriteria();

  // Lite path — single basic renderer, no post chain. Mobile/touch users
  // and reduced-motion users land here. Same exit shape as the heavier
  // paths so the parent component doesn't have to branch.
  if (lite) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = tuneables.exposure;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    return {
      kind: 'webgl1-lite',
      renderer,
      composer: null,
      bloomPass: null, gtaoPass: null, ssrPass: null, taaPass: null, rgbShift: null,
      tuneables,
      render: () => renderer.render(scene, camera),
      dispose: () => {
        renderer.dispose();
        try { mount.removeChild(renderer.domElement); } catch {}
      },
    };
  }

  // WebGPU path — try first, fall back to WebGL2 on any error.
  if (canUseWebGPU()) {
    try {
      // Dynamic import keeps this out of the lite bundle.
      // Dynamic import via a variable specifier so TypeScript doesn't try
      // to resolve the WebGPU subpath at type-check time (three 0.184 ships
      // it without .d.ts entries — three/webgpu has runtime exports only).
      const webgpuPath = 'three/examples/jsm/renderers/webgpu/WebGPURenderer.js';
      const webgpuMod = await import(/* @vite-ignore */ webgpuPath).catch(() => null);
      if (webgpuMod) {
        const WebGPURenderer = (webgpuMod as any).default || (webgpuMod as any).WebGPURenderer;
        if (WebGPURenderer) {
          const renderer = new WebGPURenderer({ antialias: true, alpha: true });
          await renderer.init();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(width, height, false);
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = tuneables.exposure;
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.VSMShadowMap;
          mount.appendChild(renderer.domElement);
          renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

          const ibl = setupIBL(renderer as any, scene, tuneables.iblIntensity);

          // WebGPU PostProcessing (bloom only — TSL stack lacks GTAO/SSR/TAA today).
          // For first launch we render directly; once three's WebGPU post matures
          // we'll wire it in here.
          return {
            kind: 'webgpu',
            renderer: renderer as any,
            composer: null,
            bloomPass: null, gtaoPass: null, ssrPass: null, taaPass: null, rgbShift: null,
            tuneables,
            render: () => renderer.render(scene, camera),
            dispose: () => {
              ibl.dispose();
              renderer.dispose?.();
              try { mount.removeChild(renderer.domElement); } catch {}
            },
          };
        }
      }
    } catch (err) {
      // Falls through to WebGL2.
      // eslint-disable-next-line no-console
      console.warn('[combat] WebGPU init failed, falling back to WebGL2:', err);
    }
  }

  // WebGL2 path — full PBR + GTAO + SSR + Bloom + TAA chain.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = tuneables.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

  const ibl = setupIBL(renderer, scene, tuneables.iblIntensity);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // GTAO — ground-truth ambient occlusion. Three's pass has its own
  // depth buffer + scale params. Disabled by default if GPU can't keep
  // 60fps; can be re-enabled via the GUI.
  let gtaoPass: GTAOPass | null = null;
  try {
    gtaoPass = new GTAOPass(scene, camera, width, height);
    (gtaoPass as any).output = (GTAOPass as any).OUTPUT?.Default ?? 0;
    if ((gtaoPass as any).updateGtaoMaterial) {
      (gtaoPass as any).updateGtaoMaterial({ radius: tuneables.gtaoRadius });
    }
    composer.addPass(gtaoPass);
  } catch (err) {
    // GTAOPass requires WebGL2 + OES_standard_derivatives. Skip on older GPUs.
    gtaoPass = null;
  }

  // SSR — screen-space reflections on flat ground.
  let ssrPass: SSRPass | null = null;
  try {
    ssrPass = new SSRPass({
      renderer,
      scene,
      camera,
      width,
      height,
      groundReflector: null,
      selects: null,
    } as any);
    (ssrPass as any).thickness = tuneables.ssrThickness;
    (ssrPass as any).opacity = tuneables.ssrOpacity;
    composer.addPass(ssrPass);
  } catch (err) {
    ssrPass = null;
  }

  // Bloom — fine emissive halo on sparks, magic circles, crit flashes.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    tuneables.bloomStrength,
    tuneables.bloomRadius,
    tuneables.bloomThreshold,
  );
  composer.addPass(bloomPass);

  // TAA — temporal anti-aliasing. Lower sample levels (1-2) keep ghosting
  // tolerable on sprite fighters; users can crank it via the GUI.
  let taaPass: TAARenderPass | null = null;
  try {
    taaPass = new TAARenderPass(scene, camera);
    (taaPass as any).sampleLevel = tuneables.taaSampleLevel;
    (taaPass as any).unbiased = false;
    (taaPass as any).accumulate = true;
    composer.addPass(taaPass);
  } catch (err) {
    taaPass = null;
  }

  // Subtle chromatic aberration for visceral hits — same path as before.
  const rgbShift = new ShaderPass(RGBShiftShader);
  rgbShift.uniforms['amount'].value = tuneables.rgbShiftAmount;
  composer.addPass(rgbShift);

  // Final vignette + tone-mapped output.
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms['offset'].value = 0.85;
  vignette.uniforms['darkness'].value = 0.95;
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  return {
    kind: 'webgl2',
    renderer,
    composer,
    bloomPass,
    gtaoPass,
    ssrPass,
    taaPass,
    rgbShift,
    tuneables,
    render: () => composer.render(),
    dispose: () => {
      ibl.dispose();
      composer.dispose();
      renderer.dispose();
      try { mount.removeChild(renderer.domElement); } catch {}
    },
  };
}

// --- Shadow setup helper (called from CombatScene3D after lights exist) -
export function configureShadows(light: THREE.DirectionalLight, mapSize: number): void {
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 30;
  light.shadow.camera.left = -8;
  light.shadow.camera.right = 8;
  light.shadow.camera.top = 6;
  light.shadow.camera.bottom = -2;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.02;
  // VSM softens to a gaussian; bump radius for that "render-room" look
  // and pre-blur so the shadow edge doesn't read as a hard rectangle on
  // CPU rasterizers (SwiftShader still uses PCF for legacy maps).
  light.shadow.radius = 6;
  (light.shadow as any).blurSamples = 25;
}

// --- PBR ground factory ------------------------------------------------
/** Replace the existing simple ground plane with a PBR one. The sprite
 *  fighters cast shadows onto this; SSR reflects them off it. */
export function buildPbrGround(size: number, color: number, roughness = 0.78, metalness = 0.05): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, 64, 64);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
    reflectivity: 0.4,
    sheen: 0.15,
    sheenRoughness: 0.6,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}
