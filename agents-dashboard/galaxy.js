// galaxy.js — ГЕНЕРИРАН от galaxy/build.mjs (galaxy/src/*.js). Не редактирай на ръка.
(function(){
"use strict";
// ---- config.js ----
// config.js — константи на галактическата сцена. Чист JS, тестваем без GPU.

// Нива на качество (0 = пълно, по-високо = по-олекотено). nebAdaptQuality превключва
// между тях с хистерезис (виж quality.js) — октави на FBM, звездни слоеве, резолюция на bloom.
const QUALITY_TIERS = [
  { oct: 6, stars: 3, resScale: 1.0, history: true },
  { oct: 5, stars: 3, resScale: 0.72, history: true },
  { oct: 3, stars: 2, resScale: 0.5, history: false },
];

const FPS_LOW = 42;
const FPS_HIGH = 56;
const FPS_HYSTERESIS_MS = 1200;
const FPS_EMA_ALPHA = 0.06;

// Диафракционни лъчи (JWST-стил, 6 основни хексагонални + 2 вертикални) — само за най-ярките
// фонови звезди (горен процентил на bMag в шейдъра). Ъглите тук документират геометрията,
// използвана и в GLSL низа (glsl-galaxy.js) — държим ги на едно място, за да не се разминат.
const SPIKE_ANGLES = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI / 2];
const SPIKE_BRIGHT_THRESHOLD = 0.9;

// ---- hash.js ----
// hash.js — псевдослучаен CPU hash, огледален на GLSL hash21/hash22 в glsl-noise.js (същата
// fract/dot верига, БЕЗ тригонометрия — вижте бележката в glsl-noise.js защо sin() бе премахнат).
// Използва се за детерминистични тестове (същият seed → същото поле, независимо от GPU) и за
// разполагането на стъклените етикети на звездите-агенти (needsSeparation).
function hash21(x, y) {
  let px = fractf(x * 123.34), py = fractf(y * 456.21);
  const d = px * px + px * py + py * py + 45.32 * px + 45.32 * py;
  px = fractf(px + d);
  py = fractf(py + d);
  return fractf(px * py);
}
function hash22(x, y) {
  return [hash21(x, y), hash21(x + 19.19, y + 19.19)];
}
function fractf(v) {
  return v - Math.floor(v);
}

/** Детерминистичен PRNG (mulberry32) за CPU-генерирани полета (прах, метеори, HII клъстери). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Раздалечава етикети (кръгове с радиус r около {x,y}) с проста релаксация, за да не се
 * застъпват — детерминистично (същия вход → същия изход), спира до `iterations` или при сходимост.
 * items: [{x, y, r}] — мутира и връща новия масив от позиции (без да променя оригиналните обекти).
 */
function separateLabels(items, iterations = 24, padding = 4) {
  const pts = items.map((it) => ({ x: it.x, y: it.y, r: it.r }));
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.r + b.r + padding;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return pts;
}

// ---- glsl-noise.js ----
// glsl-noise.js — базова GLSL noise/fbm/blackbody библиотека за галактическия шейдър.
// hash() е БЕЗ тригонометрия нарочно (собственикова бележка, кръг 4 от разследването на таблото):
// класическият sin(dot(p,...))*43758.5453 губи прецизност при по-големи аргументи — p расте през
// fbm октавите ×2.02 всеки път + мащаб по времето — и sin() на някои GPU/ANGLE/SwiftShader
// имплементации банди вместо да остане псевдослучаен → цели решетъчни клетки излизат с еднакъв тон
// (видимите бледи „плочки" във фона). Тази fract/dot верига е стабилна за произволно големи входове.
const GLSL_NOISE = `
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec2 hash22(vec2 p){ return vec2(hash21(p), hash21(p+19.19)); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p, int oct){ float v=0.,a=.5; for(int i=0;i<8;i++){ if(i>=oct) break; v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=.52; } return v; }
float ridge(vec2 p, int oct){ float v=0.,a=.5; for(int i=0;i<8;i++){ if(i>=oct) break; float n=1.0-abs(noise(p)*2.0-1.0); v+=a*n*n; p=p*2.05+vec2(3.1,-2.7); a*=.5; } return v; }
// Планк-приближение (blackbody): t=0 топло жарава (~3000K), t=0.5 бяло-жълто (~5800K, Слънцето),
// t=1 сини-бели (~12000K+, О/B звезди) — не произволен градиент, следва реалната цветова
// последователност на звезден спектър, каквато се вижда и в HDR снимки на Хъбъл/JWST.
vec3 blackbody(float t){
  vec3 warm=vec3(1.0,0.55,0.22), mid=vec3(1.0,0.93,0.82), hot=vec3(0.66,0.76,1.0);
  vec3 c = mix(warm, mid, smoothstep(0.0,0.5,t));
  return mix(c, hot, smoothstep(0.5,1.0,t));
}
`;

// ---- glsl-galaxy.js ----
// glsl-galaxy.js — звезден фон с диафракционни лъчи тип JWST за най-ярките звезди. (Решение на
// собственика, решаващ кръг: структурираната спираловидна мъглявина/bulge/HII опит СЕ ВЪРНА към
// изпитаната наситена мъглявина в shaders.js — виж бележката там; PSF/диафракционните лъчи тук
// останаха, изрично одобрени като подобрение.) Изисква GLSL_NOISE (hash/blackbody) в контекста.
const GLSL_GALAXY = `
// Диафракционни лъчи тип JWST (6 хексагонални + 2 вертикални — сборът "6+2" от собственика):
// апроксимация без отделен pass — тесен ексpоненциален гребен покрай няколко фиксирани оси,
// приложен САМО на горния процентил ярки звезди (bMag>threshold), физически смисъл: дифракция
// от сегментираното огледало/паяка на телескопа расте рязко само при висок контраст извор/фон.
float spikeGlow(vec2 d, float size){
  float s = 0.0;
  float angs[4]; angs[0]=0.0; angs[1]=1.0471975512; angs[2]=2.0943951024; angs[3]=1.5707963268;
  for (int i=0;i<4;i++){
    vec2 ax = vec2(cos(angs[i]), sin(angs[i]));
    float along = dot(d, ax);
    float perp = length(d - ax*along);
    float len = size*16.0;
    s += exp(-perp*110.0) * exp(-abs(along)/max(len,0.001));
  }
  return s;
}
vec3 starLayer(vec2 uv, float seed, float cells, float twT, float brightThresh){
  vec2 guv = uv*cells; vec2 id = floor(guv); vec2 gv = fract(guv)-0.5; vec3 col = vec3(0.0);
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
    vec2 off = vec2(float(x),float(y)); vec2 cid = id+off; vec2 h = hash22(cid+seed);
    float present = step(0.865, h.x);
    vec2 jitter = (h-0.5)*0.86; vec2 d = gv - off - jitter;
    float bMag = pow(hash21(cid+seed+7.7), 3.2);
    float size = mix(0.018, 0.075, bMag);
    float glow = pow(size/(length(d)+0.0018), 1.55) * present;
    float tw = twT > -0.5 ? (0.78 + 0.22*sin(twT*6.0 + h.x*44.0)) : 1.0;
    vec3 starCol = blackbody(hash21(cid+seed+3.3));
    col += starCol * glow * bMag * tw;
    float spikeAmt = smoothstep(brightThresh, 1.0, bMag) * present;
    if (spikeAmt > 0.0) col += starCol * spikeGlow(d, size) * spikeAmt * 0.6 * tw;
  }
  return col;
}
`;

// ---- shaders.js ----
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



const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const SCENE_FS = `#version 300 es
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

const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uDir;
void main(){
  vec2 d = uDir*uTexel;
  vec3 c = texture(uTex, vUv).rgb*0.227027;
  c += texture(uTex, vUv+d*1.384615).rgb*0.316216 + texture(uTex, vUv-d*1.384615).rgb*0.316216;
  c += texture(uTex, vUv+d*3.230769).rgb*0.070270 + texture(uTex, vUv-d*3.230769).rgb*0.070270;
  o = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
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

// ---- quality.js ----
// quality.js — адаптивно качество: EMA на кадровото време решава кога да падне/качи tier
// (виж config.js QUALITY_TIERS). Чист JS, без GPU — тестваем детерминистично с фиксирани dt.

function createQualityController(initialTier = 0) {
  const state = { tier: clampTier(initialTier), fpsEma: 60, tierT: 0, historyValid: false };

  function clampTier(t) {
    return Math.max(0, Math.min(QUALITY_TIERS.length - 1, t | 0));
  }

  /** Подава кадровото време (ms); връща true ако tier-ът се е сменил (извикващият да пресъздаде FBO-та). */
  function tick(dt) {
    state.fpsEma = state.fpsEma * (1 - FPS_EMA_ALPHA) + (1000 / Math.max(1, dt)) * FPS_EMA_ALPHA;
    state.tierT += dt;
    if (state.tierT < FPS_HYSTERESIS_MS) return false;
    state.tierT = 0;
    if (state.fpsEma < FPS_LOW && state.tier < QUALITY_TIERS.length - 1) {
      state.tier++;
      state.historyValid = false;
      return true;
    }
    if (state.fpsEma > FPS_HIGH && state.tier > 0) {
      state.tier--;
      state.historyValid = false;
      return true;
    }
    return false;
  }

  function current() {
    return QUALITY_TIERS[state.tier];
  }

  /** История (TAA-подобно натрупване) е невалидна веднага след resize/смяна на tier — един кадър
   *  с uHistoryMix=0, после се позволява натрупване; предпазва от ghosting при рязка смяна. */
  function invalidateHistory() {
    state.historyValid = false;
  }
  function historyMix(reducedMotion) {
    if (reducedMotion || !current().history) return 0;
    if (!state.historyValid) {
      state.historyValid = true;
      return 0;
    }
    return 0.35;
  }

  return { tick, current, invalidateHistory, historyMix, state };
}

// ---- pipeline.js ----
// pipeline.js — WebGL2 HDR пайплайн (без three.js, нула зависимости). Сцена (MRT: HDR цвят +
// bright-extract, с TAA-подобно натрупване през редуващи се A/Б FBO) → 2 нива downsample+blur
// (физически bloom) → композит (по-мек bloom коляно + halation + ACES + хроматична аберация само
// на ярките ръбове + филмово зърно) → screen-blend над 2D слоя (`#sky`, backdrop-draw.js).
//
// Виньетата и тъмните прашни ленти ОСТАВАТ в 2D слоя — screen blend математически може само да
// ИЗСВЕТЛИ фона (1-(1-a)(1-b) ≥ a), никога да го затъмни; Beer–Lambert поглъщане тук е невъзможно
// by design (виж backdrop-draw.js за затъмняващия слой).
//
// Без WebGL2 → ready=false → извикващият (index.js) минава изцяло на 2D резерва (архитектурен, не
// added-on-top). Адаптивно качество (quality.js): octaves/starLayers/резолюция падат тихо при
// устойчиво бавен кадър.

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
function link(gl, vs, fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}
function makeFBO(gl, w, h, n, useFloat) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const texs = [], atts = [];
  for (let i = 0; i < n; i++) {
    const tx = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    if (useFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tx, 0);
    texs.push(tx); atts.push(gl.COLOR_ATTACHMENT0 + i);
  }
  gl.drawBuffers(atts);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, texs, w, h, ok };
}

function createPipeline(canvas) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, powerPreference: "high-performance" });
  if (!gl) return { ready: false };
  const hasFloatInit = !!gl.getExtension("EXT_color_buffer_float");
  const state = { gl, hasFloat: hasFloatInit, w: 0, h: 0, sceneFlip: 0 };
  try {
    const scene = link(gl, VS, SCENE_FS), blur = link(gl, VS, BLUR_FS), comp = link(gl, VS, COMPOSITE_FS);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const wireQuad = (prog) => {
      gl.useProgram(prog);
      const lc = gl.getAttribLocation(prog, "p");
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(lc);
      gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
    };
    wireQuad(scene); wireQuad(blur); wireQuad(comp);
    state.progs = {
      scene: { p: scene, res: gl.getUniformLocation(scene, "uRes"), t: gl.getUniformLocation(scene, "uT"), par: gl.getUniformLocation(scene, "uPar"), oct: gl.getUniformLocation(scene, "uOct"), stars: gl.getUniformLocation(scene, "uStars"), sky: gl.getUniformLocation(scene, "uSky"), hist: gl.getUniformLocation(scene, "uHistory"), histMix: gl.getUniformLocation(scene, "uHistoryMix") },
      blur: { p: blur, tex: gl.getUniformLocation(blur, "uTex"), texel: gl.getUniformLocation(blur, "uTexel"), dir: gl.getUniformLocation(blur, "uDir") },
      comp: { p: comp, scene: gl.getUniformLocation(comp, "uScene"), b0: gl.getUniformLocation(comp, "uBloom0"), b1: gl.getUniformLocation(comp, "uBloom1"), grain: gl.getUniformLocation(comp, "uGrain") },
    };
    state.skyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, state.skyTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(16));
  } catch (e) {
    return { ready: false, error: e };
  }
  state.ready = true;
  return state;
}

function resizePipeline(state, cssW, cssH, dpr, resScale) {
  if (!state.ready) return;
  const gl = state.gl;
  const d = Math.min(2, dpr) * resScale;
  const w = Math.max(1, Math.round(cssW * d)), h = Math.max(1, Math.round(cssH * d));
  if (w < 1 || h < 1) return;
  state.w = w; state.h = h;
  let sceneA = makeFBO(gl, w, h, 2, state.hasFloat);
  if (!sceneA.ok && state.hasFloat) { state.hasFloat = false; sceneA = makeFBO(gl, w, h, 2, false); }
  const sceneB = makeFBO(gl, w, h, 2, state.hasFloat);
  state.scenes = [sceneA, sceneB];
  state.sceneFlip = 0;
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
  state.half = [makeFBO(gl, hw, hh, 1, state.hasFloat), makeFBO(gl, hw, hh, 1, state.hasFloat)];
  state.quarter = [makeFBO(gl, qw, qh, 1, state.hasFloat), makeFBO(gl, qw, qh, 1, state.hasFloat)];
}

// H-проходът взема texel от ИЗТОЧНИКА (srcW/srcH не dest) — разминаване тук произвежда aliasing,
// изолирана ярка точка излиза като остър "+" вместо мек кръг (собственикова бележка, кръг 2).
function blurPass(gl, progs, srcTex, srcW, srcH, fboA, fboB, w, h) {
  const pr = progs.blur;
  gl.useProgram(pr.p); gl.viewport(0, 0, w, h);
  gl.uniform1i(pr.tex, 0); gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fb); gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform2f(pr.texel, 1 / srcW, 1 / srcH); gl.uniform2f(pr.dir, 1, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb); gl.bindTexture(gl.TEXTURE_2D, fboA.texs[0]);
  gl.uniform2f(pr.texel, 1 / w, 1 / h); gl.uniform2f(pr.dir, 0, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
  return fboB.texs[0];
}

function uploadSky(state, sourceCanvas) {
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.skyTex);
  // UNPACK_FLIP_Y_WEBGL=true: без него текстурата излиза огледално по Y спрямо нормалния vUv
  // (v=0 долу) — ярък текст/спайк от горната половина „изтича" отразен долу (собственикова бележка, кръг 3).
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
}

/** Рисува един кадър. `historyMix` идва от quality.js (0 веднага след resize/смяна на tier/RM). */
function drawFrame(state, { time, gx, gy, oct, stars, historyMix, grainSeed }) {
  if (!state.ready || !state.scenes) return;
  const gl = state.gl, W_ = state.w, H_ = state.h;
  const cur = state.scenes[state.sceneFlip], prev = state.scenes[1 - state.sceneFlip];
  gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb); gl.viewport(0, 0, W_, H_);
  const ps = state.progs.scene;
  gl.useProgram(ps.p);
  gl.uniform2f(ps.res, W_, H_); gl.uniform1f(ps.t, time); gl.uniform2f(ps.par, gx, gy);
  gl.uniform1i(ps.oct, oct); gl.uniform1i(ps.stars, stars);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state.skyTex); gl.uniform1i(ps.sky, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev.texs[0]); gl.uniform1i(ps.hist, 1);
  gl.uniform1f(ps.histMix, historyMix);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const b0 = blurPass(gl, state.progs, cur.texs[1], W_, H_, state.half[0], state.half[1], state.half[0].w, state.half[0].h);
  const b1 = blurPass(gl, state.progs, b0, state.half[0].w, state.half[0].h, state.quarter[0], state.quarter[1], state.quarter[0].w, state.quarter[0].h);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W_, H_);
  const pc = state.progs.comp;
  gl.useProgram(pc.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.texs[0]); gl.uniform1i(pc.scene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b0); gl.uniform1i(pc.b0, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, b1); gl.uniform1i(pc.b1, 2);
  gl.uniform1f(pc.grain, grainSeed);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  state.sceneFlip = 1 - state.sceneFlip;
}

// ---- backdrop-field.js ----
// backdrop-field.js — детерминистично генерирани полета (фин звезден прах, амбиентни мъглявини) за
// 2D фоновия слой. Чист JS (mulberry32 seed) → тестваем без canvas/GPU.

function buildDustField(seed = 1, count = 320) {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    nx: rand() * 2 - 1,
    ny: rand() * 2 - 1,
    d: 0.25 + rand() * 0.9,
    r: 0.4 + rand() * 1.6,
    ph: rand() * 6.28,
    tw: 1.3 + rand() * 2.5,
    warm: rand() < 0.22,
  }));
}

// Амбиентни цветни мъглявини (лека фонова окраска — синьо-виолетово-тюркоазено-розово, в тон
// с blackbody/HII/емисионната палитра на WebGL слоя, не произволни хекс стойности).
function buildAmbientNebulae() {
  return [
    { nx: -0.42, ny: -0.3, r: 0.52, c: "#3a2b6e", ph: 0 },
    { nx: 0.48, ny: 0.1, r: 0.6, c: "#0e3b52", ph: 1.7 },
    { nx: 0.06, ny: 0.46, r: 0.46, c: "#5a2450", ph: 3.3 },
    { nx: -0.3, ny: 0.36, r: 0.42, c: "#123f39", ph: 4.9 },
  ];
}

// ---- backdrop-draw.js ----
// backdrop-draw.js — canvas 2D рисуване на фоновия слой (`#sky`): снимката на галактиката,
// амбиентните мъглявини, финият звезден прах и метеорите. Извиква се ПРЕДИ звездите-агенти/
// нишките (index.html ги рисува отгоре, непроменени). Малки, чисти функции — не носят собствено
// състояние освен подаденото.
//
// РЕШАВАЩ КРЪГ (собственика, 2026-09-25): тъмните прашни ленти/наклонът(TILT)/звездният ореол/
// далечните фонови галактики от предишния опит излязоха по-бедни от изпитания вид (виж shaders.js)
// и отпаднаха заедно с него — само снимка + амбиентна мъглявина + фин прах, точно както преди.

function hex(c, a) {
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawGalaxyPhoto(ctx, W, H, cx, cy, R, img, cleanImg, ready, { zoom, gal, reducedMotion, gx = 0, gy = 0 }) {
  ctx.fillStyle = "#00020a";
  ctx.fillRect(0, 0, W, H);
  if (ready) {
    const src = cleanImg || img;
    const iw = img.naturalWidth, ih = img.naturalHeight, diag = Math.hypot(W, H);
    const scale = Math.max(diag / iw, diag / ih) * 1.02 * zoom, dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.translate(cx - (reducedMotion ? 0 : gx) * R * 0.045, cy - (reducedMotion ? 0 : gy) * R * 0.045);
    if (!reducedMotion) ctx.rotate(gal * 0.9);
    ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  ctx.fillStyle = "rgba(0,2,10,.32)";
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(cx, cy, R * 0.14, cx, cy, Math.max(W, H) * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,1,6,.74)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawAmbientNebulae(ctx, nebulae, cx, cy, R, t, reducedMotion, gx = 0, gy = 0) {
  ctx.globalCompositeOperation = "lighter";
  for (const n of nebulae) {
    const x = cx + n.nx * R * 1.3 + (reducedMotion ? 0 : Math.sin(t * 0.12 + n.ph) * R * 0.05 + gx * R * 0.02);
    const y = cy + n.ny * R * 1.3 + (reducedMotion ? 0 : Math.cos(t * 0.1 + n.ph) * R * 0.04 + gy * R * 0.02);
    const rr = n.r * R * (1 + (reducedMotion ? 0 : Math.sin(t * 0.18 + n.ph) * 0.06));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, hex(n.c, 0.2));
    g.addColorStop(0.5, hex(n.c, 0.08));
    g.addColorStop(1, hex(n.c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, 6.28);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawFineDust(ctx, dust, cx, cy, R, t, gx, gy, reducedMotion) {
  ctx.globalCompositeOperation = "lighter";
  for (const s of dust) {
    const px = cx + s.nx * R * 1.5 + gx * s.d * 28 + (reducedMotion ? 0 : Math.sin(t * 0.05 * s.d + s.ph) * 3);
    const py = cy + s.ny * R * 1.5 + gy * s.d * 28;
    const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * s.tw + s.ph);
    const a = (0.22 + 0.62 * tw) * (0.4 + s.d * 0.6);
    ctx.fillStyle = s.warm ? `rgba(255,226,180,${a})` : `rgba(202,226,255,${a})`;
    ctx.beginPath();
    ctx.arc(px, py, s.r * (0.7 + tw * 0.5), 0, 6.28);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ---- meteors.js ----
// meteors.js — редки метеори през фона (декоративен слой, независим от галактическата структура).
// spawnMeteor е чист (връща обект); drawMeteors мутира ctx + масива подаден отвън.
function spawnMeteor(W, H, rand = Math.random) {
  const sp = 7 + rand() * 6;
  const dir = (rand() < 0.5 ? 0.34 : 0.66) * Math.PI + (rand() - 0.5) * 0.28;
  return {
    x: rand() * W,
    y: -20 - rand() * H * 0.15,
    vx: Math.cos(dir) * sp,
    vy: Math.abs(Math.sin(dir)) * sp + 3,
    life: 1,
    len: 8 + rand() * 9,
  };
}

/** Стъпва и чертае метеорите на място; премахва мъртвите/извън екрана. Не тръгва под reduced-motion
 *  (auto-loop без спиране би нарушило WCAG 2.2.2 — тук просто няма движение, не пауза бутон, защото
 *  под reduced-motion кадърът е статичен изобщо, виж index.html RM пътя). */
function stepAndDrawMeteors(ctx, meteors, W, H) {
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.x += m.vx; m.y += m.vy; m.life -= 0.014;
    if (m.life <= 0 || m.y > H + 60 || m.x < -60 || m.x > W + 60) { meteors.splice(i, 1); continue; }
    const tx = m.x - m.vx * m.len, ty = m.y - m.vy * m.len, al = Math.min(1, m.life * 1.4);
    const g = ctx.createLinearGradient(tx, ty, m.x, m.y);
    g.addColorStop(0, "rgba(220,240,255,0)");
    g.addColorStop(1, `rgba(225,242,255,${al})`);
    ctx.strokeStyle = g; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
    const hg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 6);
    hg.addColorStop(0, `rgba(255,255,255,${al})`);
    hg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, 6.28); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ---- index.js ----
// index.js — публичен вход на пакета. index.html вика само това (през галактика.js, вижте build.mjs).
// createGalaxy(nebCanvas) връща манипулатор за WebGL HDR слоя (bloom/ACES/CA/зърно/TAA-натрупване);
// createBackdrop() връща чисти помощници за 2D фоновия слой (снимка, мъглявини, прах, метеори) —
// index.html си държи собствения `#sky` контекст и агент-звездите непроменени.







function createGalaxy(canvas) {
  const pipeline = createPipeline(canvas);
  if (!pipeline.ready) return { ready: false };
  const quality = createQualityController(0);
  let skyFrame = 0;

  function resize(cssW, cssH, dpr) {
    resizePipeline(pipeline, cssW, cssH, dpr, quality.current().resScale);
    quality.invalidateHistory();
  }

  /** Извиква се веднъж/кадър; captureFromCanvas е #sky елементът (текстурата се презарежда на
   *  всеки 2-ри кадър при пълно качество, по-рядко при по-нисък tier — вижте bloomSkip). */
  function render({ time, gx, gy, reducedMotion, captureFromCanvas, bloomSkip = 1 }) {
    if (skyFrame++ % bloomSkip === 0) uploadSky(pipeline, captureFromCanvas);
    const tier = quality.current();
    const historyMix = quality.historyMix(reducedMotion);
    drawFrame(pipeline, {
      time,
      gx: reducedMotion ? 0 : gx,
      gy: reducedMotion ? 0 : gy,
      oct: tier.oct,
      stars: tier.stars,
      historyMix,
      grainSeed: reducedMotion ? 7.0 : time,
    });
  }

  /** dt в ms; връща true ако е сменен tier-ът (resize вече е извикан вътрешно). */
  function adaptQuality(dt, cssW, cssH, dpr) {
    const changed = quality.tick(dt);
    if (changed) resize(cssW, cssH, dpr);
    return changed;
  }

  return { ready: true, resize, render, adaptQuality, quality, tiers: QUALITY_TIERS };
}

/** Фонов 2D слой (снимка + амбиентни мъглявини + фин прах + метеори). Не пипа звездите-агенти/
 *  нишките/warp-а — index.html ги рисува отгоре, непроменени. */
function createBackdrop(seed = 1) {
  const dust = buildDustField(seed);
  const nebulae = buildAmbientNebulae();
  let meteors = [];
  let meteorCooldown = 2 + Math.random() * 3;

  function drawPhoto(ctx, W, H, cx, cy, R, img, cleanImg, ready, opts) {
    drawGalaxyPhoto(ctx, W, H, cx, cy, R, img, cleanImg, ready, opts);
  }
  function drawDust() {} // историческа кука (виж index.html) — фината прах е в drawStructure по-долу
  function drawStructure(ctx, cx, cy, R, t, opts) {
    drawAmbientNebulae(ctx, nebulae, cx, cy, R, t, opts.reducedMotion, opts.gx, opts.gy);
    drawFineDust(ctx, dust, cx, cy, R, t, opts.gx, opts.gy, opts.reducedMotion);
  }
  function stepMeteors(ctx, W, H, reducedMotion) {
    if (!reducedMotion) {
      meteorCooldown -= 0.016;
      if (meteorCooldown <= 0) { meteors.push(spawnMeteor(W, H)); meteorCooldown = 2.4 + Math.random() * 4; }
    }
    stepAndDrawMeteors(ctx, meteors, W, H);
  }

  return { drawPhoto, drawDust, drawStructure, stepMeteors };
}
window.Galaxy = { createGalaxy, createBackdrop, separateLabels };
})();
