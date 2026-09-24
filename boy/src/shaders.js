// Global shader patches: exponential height fog with wisps and fire in-scattering.
import * as THREE from 'three';
import { FOG, FIRE_GLOWS, MOON_DIR } from './config.js';

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const v3 = (a) => `vec3(${a.map(f).join(',')})`;

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 q = fract(p);
  vec2 u = q * q * (3.0 - 2.0 * q);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
`;

// scene.fog is a THREE.Fog whose `near` carries the clock and `far` a density multiplier,
// so every built-in material picks the animated fog up without per-material uniforms.
export function installHeightFog() {
  const n = FIRE_GLOWS.length;
  const pos = FIRE_GLOWS.map((g) => v3([g.pos.x, g.pos.y, g.pos.z])).join(',');
  const col = FIRE_GLOWS.map((g) => v3(g.col)).join(',');

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;

  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorld = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz;
#endif`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  const int FIRE_N = ${n};
  const vec3 FIRE_POS[${n}] = vec3[${n}](${pos});
  const vec3 FIRE_COL[${n}] = vec3[${n}](${col});
#endif`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    #ifdef FOG_EXP2
      float fogTime = 0.0;
      float fogMul = 1.0;
    #else
      float fogTime = fogNear;
      float fogMul = fogFar;
    #endif
    vec3 camP = vec3(cameraPosition.x, abs(cameraPosition.y), cameraPosition.z);
    vec3 fray = vFogWorld - camP;
    float fdist = length(fray);
    vec3 fdir = fray / max(fdist, 1e-4);
    float fk = ${f(FOG.falloff)} * fdir.y * fdist;
    float ffall = abs(fk) > 1e-4 ? (1.0 - exp(-fk)) / fk : 1.0;
    float famt = ${f(FOG.density)} * exp(-camP.y * ${f(FOG.falloff)}) * fdist * ffall;
    vec3 wp = vFogWorld;
    float banks = sin(wp.x * 0.31 + fogTime * 0.23) * sin(wp.z * 0.27 - fogTime * 0.17) + 0.5 * sin((wp.x + wp.z) * 0.61 + fogTime * 0.31) * sin(wp.y * 1.3 - fogTime * 0.11);
    famt *= 0.75 + 0.45 * banks;
    float fogFactor = 1.0 - exp(-famt * fogMul);
    vec3 fglow = vec3(0.0);
    for (int fi = 0; fi < FIRE_N; fi++) {
      vec3 fp = FIRE_POS[fi];
      float ft = clamp(dot(fp - camP, fdir), 0.0, fdist);
      vec3 fc = camP + fdir * ft - fp;
      float flick = 0.82 + 0.18 * sin(fogTime * (7.0 + float(fi) * 1.3) + float(fi) * 1.7);
      fglow += FIRE_COL[fi] * flick / (1.0 + dot(fc, fc) * 1.1);
    }
    float mphase = max(dot(fdir, ${v3([MOON_DIR.x, MOON_DIR.y, MOON_DIR.z])}), 0.0);
    vec3 moonHaze = vec3(0.05, 0.065, 0.1) * (pow(mphase, 10.0) * 0.8 + pow(mphase, 2.0) * 0.12);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + fglow + moonHaze, fogFactor);
  }
#endif`;
}
