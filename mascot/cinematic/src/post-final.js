// Anamorphic streaks and the display pass: CAS-sharpened upscale, lens, ACES, grade, grain.
// Vendored copy of boy/src/post-final.js — generic film pipeline, no domain content.
import * as THREE from 'three';
import { LUMA, pass } from './post-common.js';

export function streakMaterial() {
  return pass({ tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 } }, /* glsl */ `
    uniform sampler2D tInput;
    uniform vec2 uTexel;
    uniform float uSpread;
    varying vec2 vUv;
    void main() {
      vec3 c = vec3(0.0);
      float tot = 0.0;
      for (int i = -12; i <= 12; i++) {
        float w = exp(-abs(float(i)) * 0.18);
        c += texture2D(tInput, vUv + vec2(float(i) * uTexel.x * uSpread, 0.0)).rgb * w;
        tot += w;
      }
      gl_FragColor = vec4(c / tot, 1.0);
    }`);
}

// Display pass: sharpened upscale (contrast-adaptive, 5 taps), lens effects, ACES, grade, grain.
export function finalMaterial() {
  return pass({
    tInput: { value: null },
    tStreak: { value: null },
    uInTexel: { value: new THREE.Vector2() },
    uSharp: { value: 0.18 },
    uStreak: { value: 0 },
    uExposure: { value: 1 },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.4 },
    uCA: { value: 0.002 },
    uBars: { value: 0 },
    uFade: { value: 0 },
    uAspect: { value: 1 },
  }, /* glsl */ `
    ${LUMA}
    uniform sampler2D tInput;
    uniform sampler2D tStreak;
    uniform vec2 uInTexel;
    uniform float uSharp;
    uniform float uStreak;
    uniform float uExposure;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uCA;
    uniform float uBars;
    uniform float uFade;
    uniform float uAspect;
    varying vec2 vUv;
    const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    vec3 rrtOdt(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float soft(vec3 c) { float l = dot(c, LUMA); return l / (1.0 + l); }
    void main() {
      vec3 c = texture2D(tInput, vUv).rgb;
      vec3 n = texture2D(tInput, vUv + vec2(0.0, uInTexel.y)).rgb;
      vec3 s = texture2D(tInput, vUv - vec2(0.0, uInTexel.y)).rgb;
      vec3 e = texture2D(tInput, vUv + vec2(uInTexel.x, 0.0)).rgb;
      vec3 w = texture2D(tInput, vUv - vec2(uInTexel.x, 0.0)).rgb;
      float lc = soft(c);
      float ln = soft(n);
      float ls = soft(s);
      float le = soft(e);
      float lw = soft(w);
      float mn = min(lc, min(min(ln, ls), min(le, lw)));
      float mx = max(lc, max(max(ln, ls), max(le, lw)));
      float amp = clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0);
      float k = -sqrt(amp) * uSharp;
      vec3 col = max((c + (n + s + e + w) * k) / (1.0 + 4.0 * k), 0.0);
      vec2 d = vUv - 0.5;
      vec2 dd = d * vec2(uAspect, 1.0);
      float r2 = dot(dd, dd);
      vec2 off = d * r2 * uCA * 4.0;
      col.r += texture2D(tInput, vUv - off).r - c.r;
      col.b += texture2D(tInput, vUv + off).b - c.b;
      col += texture2D(tStreak, vUv).rgb * vec3(0.55, 0.85, 0.4) * uStreak;
      col = max(col, 0.0) * uExposure;
      col *= clamp(1.0 - uVignette * pow(r2 * 1.6, 1.3), 0.0, 1.0);
      col = clamp(ACESOut * rrtOdt(ACESIn * col), 0.0, 1.0);
      col = pow(col, vec3(1.0 / 2.2));
      float l = dot(col, LUMA);
      col = mix(vec3(l), col, 0.94);
      col += vec3(-0.006, 0.004, -0.01) * (1.0 - l) * (1.0 - l);
      col += vec3(0.018, 0.02, -0.006) * l * l;
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
      float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 431.0) - 0.5;
      col += g * uGrain * (1.0 - l * 0.7);
      col += (hash(gl_FragCoord.xy * 1.37 + 17.0) - 0.5) / 255.0;
      float bar = step(vUv.y, uBars) + step(1.0 - uBars, vUv.y);
      col = mix(col, vec3(0.0), max(bar, uFade));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`);
}
