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
import { VS, SCENE_FS, BLUR_FS, COMPOSITE_FS } from "./shaders.js";

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

export function createPipeline(canvas) {
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

export function resizePipeline(state, cssW, cssH, dpr, resScale) {
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

export function uploadSky(state, sourceCanvas) {
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.skyTex);
  // UNPACK_FLIP_Y_WEBGL=true: без него текстурата излиза огледално по Y спрямо нормалния vUv
  // (v=0 долу) — ярък текст/спайк от горната половина „изтича" отразен долу (собственикова бележка, кръг 3).
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
}

/** Рисува един кадър. `historyMix` идва от quality.js (0 веднага след resize/смяна на tier/RM). */
export function drawFrame(state, { time, gx, gy, oct, stars, historyMix, grainSeed }) {
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
