// Skin: the scan's albedo, normals and specular map on a physical material whose diffuse light is
// pre-integrated subsurface scattering (Penner 2011) — light bleeds red past the terminator where
// the surface curves tightly (nose, lips, ears), while flat skin stays crisp — plus light shining
// through thin parts (ears and nostrils glow in front of the fires), a fine sheen of vellus hair
// that rims the face against back light, and rain on the face.
import * as THREE from 'three/webgpu';
import { attribute, texture, uv, vec2, vec3, vec4, float, mix, normalize, dot, pow, exp, max, smoothstep, normalMap, normalView, normalViewGeometry, normalWorldGeometry, positionViewDirection, positionWorld, cameraViewMatrix, diffuseContribution, BRDF_Lambert, uniform } from 'three/tsl';
import { noise } from './tsl.js';
import { faceLit, inPlace } from './face-light.js';

// d'Eon & Luebke's six-Gaussian skin diffusion profile: variance (mm²) and RGB weights.
const PROFILE = [
  [0.0064, 0.233, 0.455, 0.649],
  [0.0484, 0.1, 0.336, 0.344],
  [0.187, 0.118, 0.198, 0],
  [0.567, 0.113, 0.007, 0.007],
  [1.99, 0.358, 0.004, 0],
  [7.41, 0.078, 0, 0],
];

// Scattered irradiance for N·L (u = N·L/2 + 1/2) and curvature (v = 2 mm / radius), per channel.
export function preintegrate(size = 32, steps = 128) {
  const data = new Float32Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    const radius = 2 / Math.max((j + 0.5) / size, 0.01);
    for (let i = 0; i < size; i++) {
      const theta = Math.acos(((i + 0.5) / size) * 2 - 1);
      for (let c = 0; c < 3; c++) {
        let num = 0;
        let den = 0;
        for (let k = 0; k < steps; k++) {
          const x = -Math.PI + ((k + 0.5) / steps) * 2 * Math.PI;
          const d = 2 * radius * Math.sin(x / 2);
          let r = 0;
          for (const [v, ...w] of PROFILE) r += (w[c] * Math.exp((-d * d) / (2 * v))) / (2 * Math.PI * v);
          num += Math.max(0, Math.cos(theta + x)) * r;
          den += r;
        }
        data[(j * size + i) * 4 + c] = num / den;
      }
      data[(j * size + i) * 4 + 3] = 1;
    }
  }
  return data;
}

export function skinLUT() {
  const size = 32;
  const f = preintegrate(size);
  const t = new THREE.DataTexture(Uint16Array.from(f, (v) => THREE.DataUtils.toHalfFloat(v)), size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// Per-vertex skin data from the bake: x curvature (2 mm / radius), y thickness (/30 mm).
const skinData = () => attribute('skinData', 'vec4');

class SkinLighting extends faceLit(THREE.PhysicalLightingModel) {
  constructor(lut) {
    super(true, true);
    this.lut = lut;
  }

  direct({ lightDirection, lightColor, reflectedLight }, builder) {
    // Specular and clear coat as usual; the Lambert diffuse is replaced below.
    const sink = { directDiffuse: vec3(0).toVar(), directSpecular: reflectedLight.directSpecular };
    super.direct({ lightDirection, lightColor, reflectedLight: sink }, builder);
    const data = skinData();
    const nG = normalize(normalViewGeometry);
    // Red scatters furthest: it sees the smoothest normal, blue the detailed one.
    const lookup = (n, ch) => texture(this.lut, vec2(dot(n, lightDirection).mul(0.5).add(0.5), data.x))[ch];
    const scatter = vec3(lookup(normalize(mix(nG, normalView, 0.35)), 'r'), lookup(normalize(mix(nG, normalView, 0.75)), 'g'), lookup(normalView, 'b'));
    reflectedLight.directDiffuse.addAssign(scatter.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
    // Light through thin flesh, seen against the light (unshadowed lights: the fires).
    const back = pow(max(dot(positionViewDirection, lightDirection.add(normalView.mul(0.3)).normalize().negate()), 0), 3);
    const through = exp(data.y.mul(-30 / 4));
    reflectedLight.directDiffuse.addAssign(lightColor.mul(back).mul(through).mul(diffuseContribution).mul(vec3(1.0, 0.32, 0.22)).mul(0.9));
  }
}

class SkinNodeMaterial extends THREE.MeshPhysicalNodeMaterial {
  static get type() {
    return 'SkinNodeMaterial';
  }

  setupLightingModel() {
    return new SkinLighting(this.lut);
  }
}

// Rain on skin: beads that cling in patches (skin is oily, the water does not sheet like on
// steel). Returns the clear coat's view normal and how wet each patch is.
function rainOnSkin(drops) {
  const n = normalWorldGeometry;
  const p = positionWorld;
  const beads = texture(drops.normal, vec2(p.x.add(p.z.mul(0.7)), p.y.add(p.z.mul(0.3))).mul(1 / (drops.tile * 0.6))).xy.mul(2).sub(1).mul(0.22);
  const t = normalize(vec3(n.z, 0, n.x.negate()).add(vec3(1e-4, 0, 0)));
  const b = normalize(t.cross(n));
  const w = normalize(t.mul(beads.x).add(b.mul(beads.y)).add(n));
  const patch = smoothstep(0.35, 0.7, noise(p.xy.mul(3.1).add(p.z.mul(2.3))).g);
  return { normal: normalize(cameraViewMatrix.mul(vec4(w, 0)).xyz), patch };
}

// maps: { albedo, normal, spec }; look: { tint, root (hair colour at the scalp), beard (0..1),
// scar (0..1) }; drops: baked droplet set. Returns the material and its live uniforms.
export function createSkin(maps, look, drops, lut) {
  const m = new SkinNodeMaterial({ name: `skin${look.id}`, roughness: 0.55, ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 1, sheenColor: new THREE.Color(0.3, 0.25, 0.21), sheenRoughness: 0.45 });
  m.lut = lut;
  m.positionNode = inPlace();
  const live = { effort: uniform(0), wet: uniform(0.55) };
  const a = attribute('regionA', 'vec4');
  const b = attribute('regionB', 'vec4');
  // Only the lining itself is wet and pink; the mask fades across the lid margin's triangles.
  const lining = smoothstep(0.55, 0.95, b.x);
  const albedo = texture(maps.albedo, uv()).rgb.mul(vec3(...look.tint));
  let c = mix(albedo, vec3(...look.root), a.x.mul(0.62));
  c = mix(c, vec3(...look.root).mul(0.8), a.y.mul(look.beard * 0.7));
  // The brows are mostly the skin's own colour: the short hairs on top only add their texture.
  c = mix(c, c.mul(0.45).add(vec3(...look.root).mul(0.25)), a.z.mul(0.6));
  c = mix(c, c.mul(vec3(1.14, 0.9, 0.88)), b.z.mul(live.effort));
  c = mix(c, vec3(0.6, 0.36, 0.33), b.w.mul(look.scar * 0.75));
  c = mix(c, vec3(0.3, 0.12, 0.1), lining);
  m.colorNode = c.mul(b.y.mul(0.93).oneMinus()).mul(live.wet.mul(0.12).oneMinus());
  const spec = texture(maps.spec, uv()).r;
  let rough = mix(float(0.7), float(0.46), spec);
  rough = mix(rough, float(0.34), a.w);
  rough = mix(rough, float(0.74), a.y.mul(look.beard));
  m.roughnessNode = mix(rough, float(0.12), lining);
  m.normalNode = normalMap(texture(maps.normal, uv()), vec2(0.9));
  // Rain: beads cling in patches, less under the hair, none in the mouth; the lining is wet.
  const rain = rainOnSkin(drops);
  m.clearcoatNode = max(live.wet.mul(rain.patch.mul(0.38).add(0.1)).mul(a.x.mul(0.7).oneMinus()).mul(b.y.oneMinus()), lining);
  m.clearcoatRoughnessNode = mix(float(0.16), float(0.06), rain.patch);
  m.clearcoatNormalNode = rain.normal;
  return { material: m, live };
}
