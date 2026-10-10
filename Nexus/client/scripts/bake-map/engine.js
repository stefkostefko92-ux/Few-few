/* Браузърна страна на печенето: three.js (WebGL2) — macro пас, сцена, пост. */
import * as THREE from 'three';
import { WORLD, REGIONS, DECOR, anchor, structOf } from './world.js';

const txt = async (n) => (await fetch('/shaders/' + n)).text();
const NR = REGIONS.length + DECOR.length;

export class Baker {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      console.error('SHADER ERROR', gl.getProgramInfoLog(program), '\n', gl.getShaderInfoLog(fs) || '');
    };
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.geo = g;
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(g, null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  async loadShaders() {
    this.src = {};
    for (const n of ['common.glsl', 'structs.glsl', 'fsq.vert', 'macro.frag', 'macrodebug.frag', 'scene.frag', 'post.frag']) {
      try { this.src[n] = await txt(n); } catch (e) { this.src[n] = ''; }
    }
  }

  inc(src) {
    return src.replace(/#include (\w+)/g, (_, n) => this.src[n + '.glsl'] || '');
  }

  mat(frag, uniforms, extra = {}) {
    frag = this.inc(frag);
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: this.src['fsq.vert'],
      fragmentShader: this.src['common.glsl'] + '\n' + frag,
      uniforms, depthTest: false, depthWrite: false, ...extra,
    });
  }

  pass(material, target, scissor) {
    const r = this.renderer;
    this.mesh.material = material;
    r.setRenderTarget(target);
    if (scissor) { r.setScissorTest(true); r.setScissor(...scissor); } else r.setScissorTest(false);
    r.render(this.scene, this.cam);
    r.setScissorTest(false);
  }

  /** Пече macro текстурите (височина + биоми). */
  /** Два пасa: първо терен, после площадки на височината при котвите на структурите. */
  bakeWorld(resX = 2560) {
    const sts = REGIONS.map(structOf).filter(Boolean);
    this.bakeMacro(resX, []);
    const ys = this.macroHeights(sts.map((s) => [s.x, s.z]));
    const pads = sts.map((s, i) => (s.pad > 0 ? [s.x, s.z, s.pad, ys[i]] : null)).filter(Boolean);
    this.bakeMacro(resX, pads);
    this.structs = sts.map((s, i) => ({ ...s, y: s.pad > 0 ? ys[i] : ys[i], radius: 7.5 * s.scale }));
    return this.structs;
  }

  bakeMacro(resX = 2560, pads = []) {
    const resY = Math.round(resX * WORLD.h / WORLD.w);
    this.macroRes = [resX, resY];
    const rt = new THREE.WebGLRenderTarget(resX, resY, {
      count: 4, type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    for (const t of rt.textures) { t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; }
    const all = [...REGIONS.map((r) => ({ ...r, active: 1 })), ...DECOR.map((d) => ({ hOff: 1, mtn: 0.2, rough: 0.4, R: 6, ...d, active: 0 }))];
    const v4 = (f) => all.map((r) => new THREE.Vector4(...f(r)));
    const z = (x) => x || 0;
    const u = {
      uWorld: { value: new THREE.Vector2(WORLD.w, WORLD.h) },
      uRes: { value: new THREE.Vector2(resX, resY) },
      uSeed: { value: WORLD.seed % 97 },
      uPad: { value: Array.from({ length: 24 }, (_, i) => new THREE.Vector4(...(pads[i] || [0, 0, 0, 0]))) }, uNP: { value: pads.length },
      uSeg: { value: v4((r) => { const b = r.b || r.a; return [r.a[0] * WORLD.w, r.a[1] * WORLD.h, b[0] * WORLD.w, b[1] * WORLD.h]; }) },
      uRB: { value: v4((r) => [z(r.R), z(r.land), z(r.hOff), z(r.mtn)]) },
      uRC: { value: v4((r) => [z(r.rough), z(r.forest), z(r.snow), z(r.ash)]) },
      uRD: { value: v4((r) => [z(r.lava), z(r.crystal), z(r.violet), z(r.urban)]) },
      uRE: { value: v4((r) => [z(r.salt), z(r.ice), z(r.cyan), z(r.fog)]) },
      uRF: { value: v4((r) => [z(r.moist), z(r.feat), z(r.fr), z(r.fa)]) },
      uRG: { value: v4((r) => [z(r.fh), r.active, 0, 0]) },
    };
    const m = this.mat(this.src['macro.frag'], u);
    const t0 = performance.now();
    this.pass(m, rt);
    this.renderer.getContext().finish();
    if (this.macro) this.macro.dispose();
    this.macro = rt;
    this.macroMs = performance.now() - t0;
    return this.macroMs;
  }

  /** Височина на macro в световна точка (CPU readback). */
  macroHeights(points) {
    const [rx, ry] = this.macroRes;
    const out = [];
    const buf = new Float32Array(4);
    for (const [x, z] of points) {
      const px = Math.min(rx - 1, Math.max(0, Math.round((x / WORLD.w) * rx - 0.5)));
      const py = Math.min(ry - 1, Math.max(0, Math.round((1 - z / WORLD.h) * ry - 0.5)));
      this.renderer.readRenderTargetPixels(this.macro, px, py, 1, 1, buf, undefined, 0);
      out.push(buf[0]);
    }
    return out;
  }

  /* ------------------------------------------------------------ сцена */
  sceneUniforms(cfg) {
    const V3 = (a) => new THREE.Vector3(...a);
    const m = cfg.mood;
    const NS = 24;
    const sa = [], sb = [];
    for (let i = 0; i < NS; i++) {
      const s = (cfg.structs || [])[i];
      sa.push(new THREE.Vector4(...(s ? [s.x, s.y, s.z, s.type] : [0, 0, 0, 0])));
      sb.push(new THREE.Vector4(...(s ? [s.radius, s.scale || 1, s.rot || 0, s.seed || 0] : [0, 0, 0, 0])));
    }
    const ga = [], gb = [];
    for (let i = 0; i < NS; i++) {
      const sd = (cfg.structs || [])[i];
      ga.push(new THREE.Vector4(...(sd ? [sd.x, sd.y, sd.z, sd.type] : [0, 0, 0, 0])));
      gb.push(new THREE.Vector4(...(sd ? [sd.radius, sd.scale || 1, sd.rot || 0, sd.seed || 0] : [0, 0, 0, 0])));
    }
    const el = (m.moonEl * Math.PI) / 180, az = (m.moonAz * Math.PI) / 180;
    const moonDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    return {
      tM0: { value: this.macro.textures[0] }, tM1: { value: this.macro.textures[1] },
      tM2: { value: this.macro.textures[2] }, tM3: { value: this.macro.textures[3] },
      uWorld: { value: new THREE.Vector2(WORLD.w, WORLD.h) },
      uRes: { value: new THREE.Vector2(cfg.w, cfg.h) },
      uJit: { value: new THREE.Vector2() },
      uCamPos: { value: V3(cfg.cam.pos) }, uCamTarget: { value: V3(cfg.cam.target) },
      uFov: { value: cfg.cam.fov },
      uSeed: { value: (WORLD.seed % 97) * 0.37 },
      uWeight: { value: 1 }, uSampleF: { value: 0 }, uQuality: { value: cfg.quality ?? 1 },
      uMoonDir: { value: moonDir }, uMoonCol: { value: V3(m.moonCol) },
      uAmbSky: { value: V3(m.ambSky) }, uAmbGround: { value: V3(m.ambGround) },
      uFogCol: { value: V3(m.fogCol) }, uFogMul: { value: m.fog }, uMistMul: { value: m.mist },
      uCloud: { value: m.cloud }, uMoonSize: { value: m.moonSize }, uWarm: { value: m.warm },
      uCyanMul: { value: m.cyan }, uExposure: { value: 1 },
      uSkyMode: { value: m.sky || 0 }, uMoteCol: { value: new THREE.Vector4(...(m.motes || [0, 0, 0, 0])) }, uMoteSize: { value: m.moteSize || 0.02 }, uBolt: { value: m.bolt ?? -10 },
      uStructA: { value: sa }, uStructB: { value: sb }, uNS: { value: 0 },
      uGlowA: { value: ga }, uGlowB: { value: gb }, uNG: { value: (cfg.structs || []).length }, uDebug: { value: cfg.debug || 0 },
    };
  }

  rt(w, h, type = THREE.HalfFloatType) {
    return new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  }

  /** За всяка плочка — кои структури могат да се виждат/да хвърлят сянка там. */
  tileStructs(cfg, tiles, structs) {
    const { w, h } = cfg;
    const V = (a) => new THREE.Vector3(...a);
    const ro = V(cfg.cam.pos), tg = V(cfg.cam.target);
    const f = tg.clone().sub(ro).normalize();
    const r = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = r.clone().cross(f);
    const tf = Math.tan((cfg.cam.fov * Math.PI) / 360);
    const asp = w / h;
    const m = cfg.mood;
    const el = (m.moonEl * Math.PI) / 180, az = (m.moonAz * Math.PI) / 180;
    const Lh = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az)).normalize();
    const circles = structs.map((sd) => {
      const out = [];
      const R = sd.radius;
      const shLen = (R * 1.5) / Math.max(Math.tan(el), 0.2);
      for (const k of [0, 0.25, 0.5, 0.75, 1]) {
        const P = new THREE.Vector3(sd.x, sd.y + R * 0.4, sd.z).addScaledVector(Lh, -shLen * k);
        const v = P.clone().sub(ro);
        const z = v.dot(f);
        if (v.length() < R * 1.3) { out.push(null); continue; }   // камерата е вътре/до — активна навсякъде
        if (z < 0.2) continue;                                    // зад камерата
        const nx = v.dot(r) / z / tf / asp, ny = v.dot(up) / z / tf;
        const px = (nx * 0.5 + 0.5) * w, py = (ny * 0.5 + 0.5) * h;
        const rad = ((R * (k === 0 ? 1.15 : 1.0) * 1.1) / z / tf) * (h / 2) + 6;
        out.push([px, py, rad]);
      }
      return out;
    });
    return tiles.map(([x, y, tw, th]) => {
      const sub = [];
      circles.forEach((cs, i) => {
        for (const c of cs) {
          if (!c) { sub.push(i); return; }
          const dx = Math.max(x - c[0], 0, c[0] - (x + tw)), dy = Math.max(y - c[1], 0, c[1] - (y + th));
          if (dx * dx + dy * dy <= c[2] * c[2]) { sub.push(i); return; }
        }
      });
      return sub;
    });
  }

  async renderShot(cfg, onProgress) {
    const { w, h } = cfg;
    const r = this.renderer;
    r.setSize(w, h, false);
    const acc = this.rt(w, h);
    r.setRenderTarget(acc); r.setClearColor(0x000000, 0); r.clear();
    const u = this.sceneUniforms(cfg);
    const mat = this.mat(this.src['scene.frag'], u, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });
    const N = cfg.samples || 1;
    u.uWeight.value = 1 / N;
    const tile = cfg.tile || 64;
    const halton = (i, b) => { let f = 1, x = 0; while (i > 0) { f /= b; x += f * (i % b); i = Math.floor(i / b); } return x; };
    const t0 = performance.now();
    const gl = r.getContext();
    const tiles = [];
    for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) tiles.push([x, y, Math.min(tile, w - x), Math.min(tile, h - y)]);
    const structs = cfg.structs || [];
    const subsets = this.tileStructs(cfg, tiles, structs);
    const NS = 24;
    let done = 0, active = 0;
    for (let ti = 0; ti < tiles.length; ti++) {
      const t = tiles[ti];
      const sub = subsets[ti];
      u.uNS.value = sub.length;
      if (sub.length) active++;
      for (let i = 0; i < sub.length; i++) {
        const sdef = structs[sub[i]];
        u.uStructA.value[i].set(sdef.x, sdef.y, sdef.z, sdef.type);
        u.uStructB.value[i].set(sdef.radius, sdef.scale || 1, sdef.rot || 0, sdef.seed || 0);
      }
      for (let k = 0; k < N; k++) {
        u.uJit.value.set(halton(k + 1, 2), halton(k + 1, 3));
        if (N === 1) u.uJit.value.set(0.5, 0.5);
        u.uSampleF.value = k / N;
        this.pass(mat, acc, t);
      }
      if (done === 0) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); this.firstTileMs = performance.now() - t0; }
      gl.finish();
      done++;
      if (done % 8 === 0) await new Promise((res) => setTimeout(res, 0));
      if (onProgress && done % 16 === 0) onProgress(done / tiles.length);
    }
    this.lastActiveTiles = [active, tiles.length];
    const sceneMs = performance.now() - t0;
    const out = this.post(acc, cfg);
    if (cfg.keep) this.lastAcc = acc; else acc.dispose();
    return { out, sceneMs };
  }

  /** HDR стойност на пиксел от последния кадър (cfg.keep). */
  probe(pts) {
    return pts.map(([x, y]) => {
      const buf = new Uint16Array(4);
      this.renderer.readRenderTargetPixels(this.lastAcc, x, this.lastAcc.height - 1 - y, 1, 1, buf);
      return Array.from(buf).map((v) => THREE.DataUtils.fromHalfFloat(v));
    });
  }

  /* ------------------------------------------------------------ пост */
  post(hdr, cfg) {
    const { w, h } = cfg;
    const P = cfg.post || {};
    const levels = [];
    const mk = (frag, uni) => this.mat(frag, uni);
    const down = `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform vec2 uDst; uniform float uThr; out vec4 fragColor;
      vec3 prefilter(vec3 c){ float l = max(max(c.r,c.g),c.b); float k = clamp((l - uThr) / max(l, 1e-4), 0., 1.); return c * k; }
      void main(){
        vec2 uv = gl_FragCoord.xy / uDst; vec2 t = uTexel;
        vec3 a = texture(tSrc, uv + t*vec2(-2.,-2.)).rgb, b = texture(tSrc, uv + t*vec2(0.,-2.)).rgb, c = texture(tSrc, uv + t*vec2(2.,-2.)).rgb;
        vec3 d = texture(tSrc, uv + t*vec2(-2.,0.)).rgb, e = texture(tSrc, uv).rgb, f = texture(tSrc, uv + t*vec2(2.,0.)).rgb;
        vec3 g = texture(tSrc, uv + t*vec2(-2.,2.)).rgb, hh = texture(tSrc, uv + t*vec2(0.,2.)).rgb, i = texture(tSrc, uv + t*vec2(2.,2.)).rgb;
        vec3 j = texture(tSrc, uv + t*vec2(-1.,-1.)).rgb, k = texture(tSrc, uv + t*vec2(1.,-1.)).rgb;
        vec3 l = texture(tSrc, uv + t*vec2(-1.,1.)).rgb, m = texture(tSrc, uv + t*vec2(1.,1.)).rgb;
        vec3 r = e*.125 + (a+c+g+i)*.03125 + (b+d+f+hh)*.0625 + (j+k+l+m)*.125;
        fragColor = vec4(uThr > 0. ? prefilter(r) : r, 1.);
      }`;
    const up = `
      uniform sampler2D tSrc, tPrev; uniform vec2 uTexel; uniform float uMix; out vec4 fragColor;
      void main(){
        vec2 uv = gl_FragCoord.xy * uTexel;
        vec3 r = vec3(0.);
        vec2 t = uTexel * 1.5;
        r += texture(tSrc, uv + vec2(-t.x,-t.y)).rgb + texture(tSrc, uv + vec2(t.x,-t.y)).rgb + texture(tSrc, uv + vec2(-t.x,t.y)).rgb + texture(tSrc, uv + vec2(t.x,t.y)).rgb;
        r += 2. * (texture(tSrc, uv + vec2(-t.x,0.)).rgb + texture(tSrc, uv + vec2(t.x,0.)).rgb + texture(tSrc, uv + vec2(0.,-t.y)).rgb + texture(tSrc, uv + vec2(0.,t.y)).rgb);
        r += 4. * texture(tSrc, uv).rgb;
        r /= 16.;
        fragColor = vec4(r * uMix + texture(tPrev, uv).rgb, 1.);
      }`;
    const N = 6;
    const rts = [];
    let cw = w, ch = h;
    for (let i = 0; i < N; i++) { cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1); rts.push(this.rt(cw, ch)); }
    let src = hdr;
    for (let i = 0; i < N; i++) {
      const s = rts[i];
      const m = mk(down, { tSrc: { value: src.texture }, uTexel: { value: new THREE.Vector2(1 / (i === 0 ? w : rts[i - 1].width), 1 / (i === 0 ? h : rts[i - 1].height)) }, uDst: { value: new THREE.Vector2(s.width, s.height) }, uThr: { value: i === 0 ? (P.thr ?? 0.9) : 0 } });
      // 13-tap без prefilter за i>0 (uThr=0 → k=1)
      this.pass(m, s);
      src = s;
    }
    // upsample: от най-малкия нагоре
    const ups = [];
    for (let i = N - 2; i >= 0; i--) ups.push(this.rt(rts[i].width, rts[i].height));
    let cur = rts[N - 1];
    const zero = this.rt(2, 2);
    this.renderer.setRenderTarget(zero); this.renderer.setClearColor(0, 0); this.renderer.clear();
    let ui = 0;
    for (let i = N - 2; i >= 0; i--) {
      const dst = ups[ui++];
      const m = mk(up, { tSrc: { value: cur.texture }, tPrev: { value: rts[i].texture }, uTexel: { value: new THREE.Vector2(1 / dst.width, 1 / dst.height) }, uMix: { value: 1 } });
      this.pass(m, dst);
      cur = dst;
    }
    const outRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false });
    const m = mk(this.src['post.frag'], {
      tHdr: { value: hdr.texture }, tBloom: { value: cur.texture }, uRes: { value: new THREE.Vector2(w, h) },
      uExposure: { value: P.exposure ?? 1.2 }, uBloom: { value: P.bloom ?? 0.22 }, uGrain: { value: P.grain ?? 0.012 },
      uVig: { value: P.vig ?? 0.35 }, uCA: { value: P.ca ?? 0.004 }, uSat: { value: P.sat ?? 1.0 }, uContrast: { value: P.contrast ?? 1.06 },
      uShadowTint: { value: new THREE.Vector3(...(P.shadowTint || [0.92, 1.0, 1.1])) },
      uHighTint: { value: new THREE.Vector3(...(P.highTint || [1.04, 1.0, 0.96])) }, uSeed: { value: 3.7 },
    });
    this.pass(m, outRT);
    for (const t of [...rts, ...ups, zero]) t.dispose();
    return outRT;
  }

  /** Върху 8-битовия RT → webp/png байтове (base64). */
  encode(outRT, { format = 'image/webp', quality = 0.85, scale = 1 } = {}) {
    const w = outRT.width, h = outRT.height;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(outRT, 0, 0, w, h, buf);
    const flip = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) flip.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(flip, w, h), 0, 0);
    let target = c;
    if (scale !== 1) {
      target = document.createElement('canvas');
      target.width = Math.round(w * scale); target.height = Math.round(h * scale);
      const g = target.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, target.width, target.height);
    }
    return new Promise((res) => target.toBlob(async (b) => {
      const ab = new Uint8Array(await b.arrayBuffer());
      let s = '';
      for (let i = 0; i < ab.length; i += 0x8000) s += String.fromCharCode.apply(null, ab.subarray(i, i + 0x8000));
      res(btoa(s));
    }, format, quality));
  }

  debugMacro(w = 1600) {
    const h = Math.round(w * WORLD.h / WORLD.w);
    this.renderer.setSize(w, h, false);
    const m = this.mat(this.src['macrodebug.frag'], {
      tM0: { value: this.macro.textures[0] }, tM1: { value: this.macro.textures[1] },
      tM2: { value: this.macro.textures[2] }, tM3: { value: this.macro.textures[3] },
      uRes: { value: new THREE.Vector2(w, h) }, uWorld: { value: new THREE.Vector2(WORLD.w, WORLD.h) },
    });
    this.pass(m, null);
    return this.canvas.toDataURL('image/png');
  }
}

/* ------------------------------------------------------------ задания */
Baker.prototype.groundAt = function (x, z) { return Math.max(0, this.macroHeights([[x, z]])[0]); };

Baker.prototype.buildCam = function (spec) {
  const c = spec.cam;
  const [tx, tz] = spec.target;
  const az = (c.az * Math.PI) / 180;
  const px = tx + Math.sin(az) * c.dist, pz = tz + Math.cos(az) * c.dist;
  const gy = this.groundAt(tx, tz);
  let gp = this.groundAt(px, pz);
  for (let k = 0; k < 8; k++) gp = Math.max(gp, this.groundAt(px + Math.cos(k) * 1.5, pz + Math.sin(k) * 1.5));
  return { pos: [px, Math.max(gp + c.h, 0.8 + c.h * 0.4), pz], target: [tx + (c.lx || 0), gy + c.ty, tz + (c.lz || 0)], fov: c.fov };
};

Baker.prototype.project = function (cam, w, h, pts) {
  const V = (a) => new THREE.Vector3(...a);
  const ro = V(cam.pos), tg = V(cam.target);
  const f = tg.clone().sub(ro).normalize();
  const r = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = r.clone().cross(f);
  const tf = Math.tan((cam.fov * Math.PI) / 360);
  return pts.map((p) => {
    const v = V(p).sub(ro);
    const z = v.dot(f);
    return [v.dot(r) / z / tf / (w / h) * 0.5 + 0.5, 1 - (v.dot(up) / z / tf * 0.5 + 0.5)];
  });
};

/** Изпълнява задание и връща кодирани файлове (base64). */
Baker.prototype.job = async function (job) {
  const { MAP_SHOT, regionShot } = await import('/shots.js');
  const { w, h } = job;
  let spec, cam;
  if (job.kind === 'map') { spec = MAP_SHOT; cam = spec.cam; }
  else { spec = regionShot(job.slug); cam = this.buildCam(spec); }
  const cfg = {
    w, h, cam, mood: { ...spec.mood, ...(job.mood || {}) }, post: { ...spec.post, ...(job.post || {}) },
    samples: job.samples || 1, quality: job.quality ?? 1, tile: job.tile || 64, structs: job.kind === 'map' ? this.structs : this.structs.filter((x) => x.slug === job.slug), debug: job.debug || 0, keep: !!job.keep,
  };
  const t0 = performance.now();
  const { out } = await this.renderShot(cfg);
  const files = [];
  for (const e of job.encode || [{ name: 'out.png', format: 'image/png' }]) files.push({ name: e.name, b64: await this.encode(out, e) });
  let pins = null;
  if (job.kind === 'map') {
    const { REGIONS, anchor } = window.WORLDDEF;
    const pts = REGIONS.map((r) => { const [x, z] = anchor(r); return [x, Math.max(0, this.macroHeights([[x, z]])[0]) + 0.1, z]; });
    pins = REGIONS.map((r, i) => ({ slug: r.slug, uv: this.project(cam, w, h, [pts[i]])[0] }));
  }
  if (job.keep) this.lastOut = out; else out.dispose();
  return { files, pins, ms: performance.now() - t0, first: this.firstTileMs, cam, active: this.lastActiveTiles };
};

window.Baker = Baker;
window.WORLDDEF = { WORLD, REGIONS, DECOR, anchor, structOf };
