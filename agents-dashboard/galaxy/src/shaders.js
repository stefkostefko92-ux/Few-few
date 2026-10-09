// shaders.js — сглобява пълните GLSL програми от glsl-noise.js + glsl-galaxy.js.
//
// РЕШАВАЩ КРЪГ (собственика, 2026-09-25): опитът за физически структурирана спираловидна мъглявина
// (bulge/ръкави/HII възли) излезе по-беден и по-сив от изпитаната наситена мъглявина — bloom-ът
// неизбежно размива фина структура към бяло, а самата снимка (NGC 4414 JPEG) не носи достатъчно
// собствен цвят да компенсира. Върнато е ТОЧНО доказаното nebula поле (fbm domain-warp, ridge прах,
// violet→teal→magenta палитра) — единствените НОВИ неща, запазени тук, са explicitно одобрените:
// JWST диафракционни лъчи (glsl-galaxy.js) и TAA-подобното натрупване (uHistory/uHistoryMix) за
// по-малко трептене на тънки звезди. Пайплайн: SCENE (MRT: HDR цвят + bright-extract) → 2 нива
// downsample+blur (bloom) → COMPOSITE (ACES + хроматична аберация само на ярките ръбове + зърно).
import { GLSL_NOISE } from "./glsl-noise.js";
import { GLSL_GALAXY } from "./glsl-galaxy.js";
import { SPIKE_BRIGHT_THRESHOLD } from "./config.js";

export const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

export const SCENE_FS = `#version 300 es
precision highp float; in vec2 vUv;
uniform vec2 uRes; uniform float uT; uniform vec2 uPar; uniform int uOct; uniform int uStars;
uniform sampler2D uSky; uniform sampler2D uHistory; uniform float uHistoryMix;
layout(location=0) out vec4 outScene; layout(location=1) out vec4 outBright;
${GLSL_NOISE}
${GLSL_GALAXY}
void main(){
  vec2 ar = vec2(uRes.x/max(uRes.y,1.0), 1.0);
  vec2 pc = (vUv-0.5)*ar;
  vec2 par = uPar;
  vec2 p1 = pc*2.6 + par*0.10 + vec2(0.0, uT*0.010);
  vec2 q = vec2(fbm(p1+vec2(0.,uT*0.012), uOct), fbm(p1+vec2(5.2,1.3)-uT*0.010, uOct));
  float f = fbm(p1 + q*2.1 + uT*0.03, uOct);
  float dust = ridge(p1*1.7 + q*1.4, max(3, uOct-2));
  vec3 nebCol = mix(vec3(0.015,0.02,0.05), vec3(0.34,0.10,0.46), smoothstep(0.15,0.85,f));
  nebCol = mix(nebCol, vec3(0.02,0.42,0.55), pow(max(f,0.0),3.0)*0.75);
  nebCol += vec3(0.30,0.10,0.42) * pow(max(f,0.0),4.0);
  nebCol *= mix(1.0, 0.22, smoothstep(0.35,0.85,dust));
  float nebA = smoothstep(0.30,0.92,f) * 0.85;
  vec3 nebEmit = nebCol * nebA;

  vec3 starsEmit = starLayer(pc + par*0.02, 11.0, 46.0, uT, ${SPIKE_BRIGHT_THRESHOLD.toFixed(2)}) * 0.9;
  starsEmit += starLayer(pc + par*0.05, 47.0, 90.0, uT, ${SPIKE_BRIGHT_THRESHOLD.toFixed(2)}) * 0.55;
  if (uStars > 2) starsEmit += starLayer(pc + par*0.09, 91.0, 150.0, uT, ${SPIKE_BRIGHT_THRESHOLD.toFixed(2)}) * 0.32;

  vec3 skyCol = texture(uSky, vUv).rgb;
  float skyLum = dot(skyCol, vec3(0.299,0.587,0.114));
  vec3 skyEmit = skyCol * smoothstep(0.76, 1.15, skyLum) * 0.9;

  vec3 hdr = nebEmit + starsEmit + skyEmit;
  // TAA-подобно натрупване: намалява трептенето на тънки ярки точки (звезди) без видим ghosting,
  // защото сцената се движи бавно (само паралакс) — uHistoryMix е 0 при resize/смяна на tier/RM.
  vec3 hist = texture(uHistory, vUv).rgb;
  hdr = mix(hdr, hist, uHistoryMix);
  outScene = vec4(hdr, 1.0);
  vec3 bloomSrc = nebEmit + skyEmit;
  float lum = dot(bloomSrc, vec3(0.2126,0.7152,0.0722));
  outBright = vec4(bloomSrc * smoothstep(1.05, 3.0, lum) + starsEmit * 0.1, 1.0);
}`;

export const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uDir;
void main(){
  vec2 d = uDir*uTexel;
  vec3 c = texture(uTex, vUv).rgb*0.227027;
  c += texture(uTex, vUv+d*1.384615).rgb*0.316216 + texture(uTex, vUv-d*1.384615).rgb*0.316216;
  c += texture(uTex, vUv+d*3.230769).rgb*0.070270 + texture(uTex, vUv-d*3.230769).rgb*0.070270;
  o = vec4(c, 1.0);
}`;

export const COMPOSITE_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom0, uBloom1; uniform float uGrain;
vec3 aces(vec3 x){ float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 dir = vUv - 0.5;
  float ca = length(dir) * 0.0028;
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom;
  bloom.r = texture(uBloom0, vUv+dir*ca).r + texture(uBloom1, vUv+dir*ca*1.6).r;
  bloom.g = texture(uBloom0, vUv).g + texture(uBloom1, vUv).g;
  bloom.b = texture(uBloom0, vUv-dir*ca).b + texture(uBloom1, vUv-dir*ca*1.6).b;
  vec3 hdr = scene + bloom * 0.55;
  vec3 col = aces(hdr * 0.92);
  col = pow(max(col, 0.0), vec3(0.4545));
  float g = (hash13(vec3(vUv*vec2(1920.,1080.), uGrain)) - 0.5) * 0.035;
  o = vec4(max(col + g, 0.0), 1.0);
}`;
