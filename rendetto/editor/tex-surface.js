// The other surfaces, one GLSL program with styles: the fine structure of plain decors and lacquer, metal-look decors
// (brushed, cross-brushed, oxidised, sparkle), fabrics (linen, canvas), the raw chipboard edge (fine outer layers,
// coarse core), the brown back of HDF, wall plaster, grooved decors and the quilted mattress cover.
import * as THREE from 'three';

export const STYLES = {
  pearl: 0,
  brushed: 1,
  crossed: 2,
  oxidized: 3,
  sparkle: 4,
  linen: 5,
  canvas: 6,
  chip: 7,
  hdf: 8,
  plaster: 9,
  groove: 10,
  quilt: 11,
};

export const SURFACE_GLSL = /* glsl */ `
float weave(vec2 p, float pitch, out float warpUp) {
  vec2 c = floor(p / pitch);
  vec2 f = fract(p / pitch);
  warpUp = mod(c.x + c.y, 2.0);
  float across = warpUp > 0.5 ? f.y : f.x;
  float along = warpUp > 0.5 ? f.x : f.y;
  return sin(3.14159 * across) * (0.75 + 0.25 * sin(3.14159 * along));
}

void pattern(vec2 p, inout Surface s) {
  vec2 q = p + uSeed * 23.0;
  vec3 col = uBase;
  float h = 0.0;
  float rough = uGloss;
  float metal = uMetal;
  if (uStyle < 0.5) {
    // pearl: the fine orange-peel structure of melamine and lacquer
    float n = fbm(q * 1.8, 3);
    h = n * 0.004;
    col *= 1.0 + vnoise(q * 0.02) * 0.02 - 0.01;
    rough += n * 0.03;
  } else if (uStyle < 1.5) {
    float l = fbm(vec2(q.x * 0.004, q.y * 2.2), 4);
    float m = vnoise(vec2(q.x * 0.02, q.y * 7.0)) - 0.5;
    col *= 1.0 + l * 0.18 + m * 0.07;
    h = l * 0.004 + m * 0.002;
    rough += l * 0.06;
  } else if (uStyle < 2.5) {
    float a = fbm(vec2(q.x * 0.004, q.y * 2.2), 4);
    float b = fbm(vec2(q.y * 0.004, q.x * 2.2) + 7.0, 4);
    col *= 1.0 + (a + b) * 0.1;
    h = (a + b) * 0.003;
  } else if (uStyle < 3.5) {
    float c = fbm(q * 0.006, 5);
    float spots = smoothstep(0.1, 0.45, fbm(q * 0.02 + 4.0, 4));
    col = mix(uBase * (1.0 + c * 0.35), uAccent, spots * 0.55);
    h = c * 0.05;
    rough = clamp(uGloss + spots * 0.25, 0.05, 1.0);
    metal = uMetal * (1.0 - spots * 0.7);
  } else if (uStyle < 4.5) {
    vec3 w = worley(q / 0.6);
    float spark = (1.0 - smoothstep(0.0, 0.18, w.x)) * step(0.82, w.z);
    col = mix(uBase * (1.0 + fbm(q * 0.01, 3) * 0.12), uAccent, spark);
    rough = mix(uGloss, 0.15, spark);
    metal = mix(uMetal, 1.0, spark);
  } else if (uStyle < 6.5) {
    // linen and canvas: plain weave with slubs (thicker stretches of yarn)
    float pitch = uStyle < 5.5 ? 0.55 : 0.9;
    float up;
    float wv = weave(q, pitch, up);
    float slub = smoothstep(0.55, 0.9, vnoise(vec2(q.x * 0.05, floor(q.y / pitch))));
    float slubW = smoothstep(0.55, 0.9, vnoise(vec2(floor(q.x / pitch), q.y * 0.05) + 3.0));
    float yarn = up > 0.5 ? slub : slubW;
    col *= (0.86 + 0.18 * wv) * (1.0 + (yarn - 0.3) * 0.12) * (1.0 + fbm(q * 0.01, 3) * 0.08);
    h = wv * 0.08 + yarn * 0.03;
    rough += 0.08 * (1.0 - wv);
  } else if (uStyle < 7.5) {
    // raw chipboard edge: v runs across the thickness (0..1); fine chips near the faces, coarse in the core
    float t = p.y / uSpan.y;
    float core = smoothstep(0.12, 0.38, t) * (1.0 - smoothstep(0.62, 0.88, t));
    float size = mix(0.28, 1.3, core);
    vec3 w = worley(vec2(q.x / (size * 1.8), p.y / size));
    vec3 tone = w.z < 0.3 ? vec3(0.85, 0.74, 0.55) : (w.z < 0.62 ? vec3(1.02, 0.93, 0.76) : vec3(0.72, 0.6, 0.43));
    float gap = smoothstep(0.0, 0.1, w.y - w.x);
    col = uBase * tone * mix(0.55, 1.0, gap);
    h = (gap - 1.0) * 0.12 * mix(0.4, 1.0, core);
    rough = 0.85;
  } else if (uStyle < 8.5) {
    // HDF back: pressed brown fibres
    float f = fbm(vec2(q.x * 0.5, q.y * 0.5), 5);
    float fib = vnoise(vec2(q.x * 0.9, q.y * 3.5));
    col *= 1.0 + f * 0.25 + (fib - 0.5) * 0.12;
    h = f * 0.03;
    rough = 0.82;
  } else if (uStyle < 9.5) {
    // plaster: roller stipple and trowel clouds
    float c = fbm(q * 0.004, 4);
    float st = fbm(q * 0.9, 3);
    col *= 1.0 + c * 0.05 + st * 0.03;
    h = st * 0.06 + c * 0.2;
    rough = 0.9;
  } else if (uStyle < 10.5) {
    float g = fract(q.y / 6.0);
    float groove = smoothstep(0.0, 0.08, g) * (1.0 - smoothstep(0.92, 1.0, g));
    col *= mix(0.78, 1.0, groove);
    h = groove * 0.25;
  } else {
    // quilted cover: diamond stitching pulled in, puffy cells, a fine jacquard
    vec2 d = vec2(q.x + q.y, q.x - q.y) / 95.0;
    vec2 f = abs(fract(d) - 0.5);
    float cell = min(f.x, f.y);
    float puff = smoothstep(0.0, 0.35, cell);
    float stitch = 1.0 - smoothstep(0.0, 0.02, cell);
    float up;
    float wv = weave(q, 0.45, up);
    float jac = smoothstep(0.4, 0.6, vnoise(q * 0.06));
    col *= (0.93 + 0.07 * puff) * (0.95 + 0.05 * wv) * (1.0 - jac * 0.035) * (1.0 - stitch * 0.12);
    h = puff * 6.0 + wv * 0.05 - stitch * 1.5;
    rough = 0.92;
  }
  s.albedo = col;
  s.height = h;
  s.rough = clamp(rough, 0.03, 1.0);
  s.metal = clamp(metal, 0.0, 1.0);
}
`;

// One baked surface: style name, base colour, span in mm, texture size, roughness, metalness, accent colour.
export function surfaceSpec({
  style,
  hex,
  span,
  size,
  gloss = 0.5,
  metal = 0,
  accent,
  seed = 1,
  match = true,
}) {
  const base = new THREE.Color(hex);
  return {
    kind: 'surface',
    glsl: SURFACE_GLSL,
    span,
    size,
    color: match ? hex : null,
    normal: true,
    orm: true,
    uniforms: {
      uBase: { value: base },
      uAccent: { value: new THREE.Color(accent ?? hex) },
      uStyle: { value: STYLES[style] },
      uGloss: { value: gloss },
      uMetal: { value: metal },
      uSeed: { value: (seed % 983) * 0.577 },
    },
  };
}

// Metal-look and other non-wood, non-stone decors → style and look. Metal-look decors are prints with metallic
// pigment under the melamine, not sheet metal: half metallic, so the board keeps its catalogue colour in any light.
export function decorSurface(d) {
  const name = `${d.name ?? ''} ${d.nameEn ?? ''}`;
  const gloss = {
    gloss: 0.1,
    'high-gloss': 0.07,
    satin: 0.3,
    pearl: 0.36,
    matt: 0.48,
    'super-matt': 0.6,
  }[d.finish];
  if (d.category === 'metal') {
    if (/oxidi[sz]ed|окисл|патин|patina|rust/i.test(name))
      return {
        style: 'oxidized',
        gloss: gloss ?? 0.5,
        metal: 0.35,
        accent: /copper|мед/i.test(name) ? '#3f6e5f' : '#5a4b3c',
      };
    if (/galaxy|галакси|cloud|клауд/i.test(name))
      return { style: 'sparkle', gloss: gloss ?? 0.4, metal: 0.3, accent: '#f2e6c8' };
    if (/кръстос|crossed|cross/i.test(name))
      return { style: 'crossed', gloss: gloss ?? 0.34, metal: 0.35 };
    if (/gloss|гланц/i.test(name)) return { style: 'pearl', gloss: gloss ?? 0.1, metal: 0.4 };
    return { style: 'brushed', gloss: gloss ?? 0.33, metal: 0.35 };
  }
  if (d.category === 'textile') {
    if (/брезент|canvas|tessea/i.test(name)) return { style: 'canvas', gloss: gloss ?? 0.62 };
    return { style: 'linen', gloss: gloss ?? 0.6 };
  }
  if (/groove|грув|набразд/i.test(name)) return { style: 'groove', gloss: gloss ?? 0.45 };
  if (/galaxy|галакси|star|metallic|металик|pearl|перл|matrix/i.test(name))
    return { style: 'sparkle', gloss: gloss ?? 0.42, metal: 0.2, accent: '#ffffff' };
  if (/oxidi[sz]ed|окисл|vintage|винтидж|mist|lotus|trend|тренд|aris|арис|ivy/i.test(name))
    return { style: 'oxidized', gloss: gloss ?? 0.5, metal: 0, accent: d.hex };
  return { style: 'pearl', gloss: gloss ?? 0.56 };
}
