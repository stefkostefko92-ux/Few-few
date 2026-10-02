// Bakes a procedural surface on the GPU into the textures a physical material uses: colour (sRGB), normal map from
// the height, and roughness/metalness (glTF layout: G roughness, B metal). The colour is calibrated: a small preview
// is read back and the gain makes its average equal to the decor colour of the catalogue (the median colour of the
// manufacturer's sample). Each pattern is GLSL `void pattern(vec2 p, inout Surface s)` with p in millimetres.
import * as THREE from 'three';
import { DEVICE } from './viewer-device.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { NOISE, SURFACE } from './tex-glsl.js';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentFor = (pattern, uniforms) => /* glsl */ `
varying vec2 vUv;
uniform vec2 uSpan;
uniform vec3 uGain;
uniform int uMode;
${Object.entries(uniforms)
  .map(([name, u]) => `uniform ${glslType(u.value)} ${name};`)
  .join('\n')}
${NOISE}
${SURFACE}
${pattern}
void main() {
  vec2 p = vUv * uSpan;
  Surface s = Surface(vec3(0.5), 0.0, 0.5, 0.0);
  pattern(p, s);
  if (uMode == 0) gl_FragColor = vec4(max(s.albedo, vec3(0.0)) * uGain, 1.0);
  else if (uMode == 1) gl_FragColor = vec4(s.height, 0.0, 0.0, 1.0);
  else gl_FragColor = vec4(1.0, clamp(s.rough, 0.03, 1.0), clamp(s.metal, 0.0, 1.0), 1.0);
}`;

const NORMAL = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tHeight;
uniform vec2 uTexel;
uniform vec2 uMm;
void main() {
  float l = texture2D(tHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(tHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float d = texture2D(tHeight, vUv - vec2(0.0, uTexel.y)).r;
  float u = texture2D(tHeight, vUv + vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3(-(r - l) / (2.0 * uMm.x), -(u - d) / (2.0 * uMm.y), 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}`;

function glslType(v) {
  if (typeof v === 'number') return 'float';
  if (v.isColor || v.isVector3) return 'vec3';
  if (v.isVector2) return 'vec2';
  if (v.isVector4) return 'vec4';
  throw new Error('tex-bake: unsupported uniform');
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// Anisotropy goes in with the target: three sets a render target's sampling parameters once, when it is created.
function target(
  width,
  height,
  { srgb = false, type = THREE.UnsignedByteType, mips = true, anisotropy = 1 } = {},
) {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    type,
    anisotropy,
    depthBuffer: false,
    generateMipmaps: mips,
    minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.MirroredRepeatWrapping,
    wrapT: THREE.MirroredRepeatWrapping,
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
  });
  return rt;
}

export class Baker {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new FullScreenQuad(null);
    this.programs = new Map();
    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: NORMAL,
      uniforms: {
        tHeight: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uMm: { value: new THREE.Vector2() },
      },
    });
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  material(kind, pattern, uniforms) {
    let m = this.programs.get(kind);
    if (!m) {
      m = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: fragmentFor(pattern, uniforms),
        uniforms: {
          uSpan: { value: new THREE.Vector2() },
          uGain: { value: new THREE.Vector3(1, 1, 1) },
          uMode: { value: 0 },
          ...THREE.UniformsUtils.clone(uniforms),
        },
      });
      this.programs.set(kind, m);
    }
    for (const [name, u] of Object.entries(uniforms)) {
      const v = m.uniforms[name].value;
      if (typeof u.value === 'number') m.uniforms[name].value = u.value;
      else v.copy(u.value);
    }
    return m;
  }

  draw(material, rt) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = material;
    r.setRenderTarget(rt);
    this.quad.render(r);
    r.setRenderTarget(prev);
  }

  // spec: kind, glsl, uniforms, span [mmU, mmV], size [w, h], color (#hex to match, optional), normal (bool),
  // orm (bool). Returns the textures and the span in metres (UVs of the boards are in metres).
  bake(spec) {
    const m = this.material(spec.kind, spec.glsl, spec.uniforms ?? {});
    m.uniforms.uSpan.value.set(spec.span[0], spec.span[1]);
    m.uniforms.uGain.value.set(1, 1, 1);
    if (spec.color) m.uniforms.uGain.value.copy(this.gain(m, spec.color));
    const [w, h] = spec.size.map((n) => Math.max(64, Math.round(n * DEVICE.texScale)));
    const out = { span: [spec.span[0] / 1000, spec.span[1] / 1000], targets: [] };
    const finish = (rt) => {
      rt.texture.repeat.set(1000 / spec.span[0], 1000 / spec.span[1]);
      out.targets.push(rt);
      return rt.texture;
    };
    m.uniforms.uMode.value = 0;
    const aniso = this.anisotropy;
    const map = target(w, h, { srgb: true, anisotropy: aniso });
    this.draw(m, map);
    out.map = finish(map);
    if (spec.normal) {
      const height = target(w, h, { type: THREE.HalfFloatType, mips: false });
      m.uniforms.uMode.value = 1;
      this.draw(m, height);
      const nm = target(w, h, { anisotropy: aniso });
      const u = this.normalMaterial.uniforms;
      u.tHeight.value = height.texture;
      u.uTexel.value.set(1 / w, 1 / h);
      u.uMm.value.set(spec.span[0] / w, spec.span[1] / h);
      this.draw(this.normalMaterial, nm);
      height.dispose();
      out.normalMap = finish(nm);
    }
    if (spec.orm) {
      const orm = target(Math.max(64, w >> 1), Math.max(64, h >> 1), { anisotropy: aniso });
      m.uniforms.uMode.value = 2;
      this.draw(m, orm);
      out.ormMap = finish(orm);
    }
    return out;
  }

  // Average colour of a small preview → per-channel gain towards the catalogue colour (linear light).
  gain(m, hex) {
    const W = 96;
    const H = 48;
    const rt = target(W, H, { srgb: true, mips: false });
    m.uniforms.uMode.value = 0;
    this.draw(m, rt);
    const px = new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    rt.dispose();
    const sum = [0, 0, 0];
    for (let i = 0; i < W * H; i++)
      for (let c = 0; c < 3; c++) sum[c] += toLinear(px[i * 4 + c] / 255);
    const want = new THREE.Color(hex);
    const tgt = [want.r, want.g, want.b];
    return new THREE.Vector3(
      ...sum.map((s, c) => Math.min(4, Math.max(0.25, tgt[c] / Math.max(1e-4, s / (W * H))))),
    );
  }

  dispose() {
    this.quad.dispose();
    this.normalMaterial.dispose();
    for (const m of this.programs.values()) m.dispose();
  }
}

export function disposeBake(b) {
  for (const rt of b.targets) rt.dispose();
}
