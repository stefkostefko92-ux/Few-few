/**
 * Cinematic finishing layer for the combat pipeline.
 *
 * Two passes that push the WebGL2 render toward a filmic, "shot on a real
 * camera" look without needing heavier geometry or 4K textures:
 *
 *   1. CinemaGradePass — a single fragment shader that does the colour
 *      grade the way a DI suite would: a filmic contrast S-curve, a
 *      teal-shadow / warm-highlight split tone, a saturation lift, a soft
 *      sharpen (unsharp mask), animated film grain, and a final vignette.
 *      Region-agnostic — it reads the same across all 16 region palettes.
 *
 *   2. makeBokehPass — three's BokehPass (depth of field). Focuses on the
 *      fighter plane (z≈0) and melts the background into bokeh, which is
 *      most of what sells "cinematic depth" on a low-poly scene.
 *
 * Both are gated to the WebGL2 (non-lite) path by the caller so phones and
 * weak laptops never pay for them.
 */

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

export interface CinemaUniforms {
  grain: number;       // film grain strength (0..0.15)
  contrast: number;    // S-curve strength (1 = none)
  saturation: number;  // 1 = none
  lift: THREE.Color;   // shadow tint (subtle teal)
  gain: THREE.Color;   // highlight tint (subtle warm)
  sharpen: number;     // unsharp amount (0..0.6)
  vignette: number;    // edge darkening (0..1)
}

export const CINEMA_DEFAULTS: CinemaUniforms = {
  // Живият деплой: 0.045 grain + 0.42 vignette четяха като шум/тунел на
  // реален монитор (SwiftShader кадрите ги подценяваха). По-леки defaults.
  grain: 0.024,
  contrast: 1.12,
  saturation: 1.10,
  lift: new THREE.Color(0.02, 0.04, 0.06),  // cool shadows
  gain: new THREE.Color(0.06, 0.03, 0.0),   // warm highlights
  sharpen: 0.28,
  vignette: 0.28,
};

const CinemaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTexel:   { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uTime:    { value: 0 },
    uGrain:   { value: CINEMA_DEFAULTS.grain },
    uContrast:{ value: CINEMA_DEFAULTS.contrast },
    uSat:     { value: CINEMA_DEFAULTS.saturation },
    uLift:    { value: CINEMA_DEFAULTS.lift.clone() },
    uGain:    { value: CINEMA_DEFAULTS.gain.clone() },
    uSharpen: { value: CINEMA_DEFAULTS.sharpen },
    uVignette:{ value: CINEMA_DEFAULTS.vignette },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uTime, uGrain, uContrast, uSat, uSharpen, uVignette;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;

    // Cheap hash for animated grain.
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // --- Unsharp-mask sharpen (4-tap) ---
      if (uSharpen > 0.001) {
        vec3 blur =
          texture2D(tDiffuse, vUv + vec2( uTexel.x, 0.0)).rgb +
          texture2D(tDiffuse, vUv + vec2(-uTexel.x, 0.0)).rgb +
          texture2D(tDiffuse, vUv + vec2(0.0,  uTexel.y)).rgb +
          texture2D(tDiffuse, vUv + vec2(0.0, -uTexel.y)).rgb;
        blur *= 0.25;
        c += (c - blur) * uSharpen;
      }

      // --- Filmic contrast S-curve around 0.5 ---
      c = mix(vec3(0.5), c, uContrast);
      c = clamp(c, 0.0, 1.0);

      // --- Split-tone: lift shadows cool, gain highlights warm ---
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c += uLift * (1.0 - luma);   // shadows
      c += uGain * luma;           // highlights

      // --- Saturation ---
      c = mix(vec3(luma), c, uSat);

      // --- Animated film grain ---
      float g = hash(vUv * vec2(1920.0, 1080.0) + uTime * 13.7) - 0.5;
      c += g * uGrain;

      // --- Vignette ---
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.35, dot(d, d) * 2.2);
      c *= mix(1.0, vig, uVignette);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export function makeCinemaGradePass(width: number, height: number): ShaderPass {
  const pass = new ShaderPass(CinemaShader);
  pass.uniforms['uTexel'].value.set(1 / width, 1 / height);
  return pass;
}

/** Depth-of-field. focus ≈ camera→fighter distance; aperture small = wide
 *  blur, large = tight. maxblur caps the bokeh radius. */
export function makeBokehPass(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): BokehPass {
  return new BokehPass(scene, camera, {
    focus: 6.0,        // matches the resting camera→fighter distance
    aperture: 0.00065, // gentle — keeps fighters crisp, melts the BG
    maxblur: 0.012,
    width,
    height,
  } as any);
}
