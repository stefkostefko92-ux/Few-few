// Stone and concrete decors: marble (veins from warped noise, light veins on dark marble), granite (crystals of
// three tones), travertine (bands and voids), slate (cleft layers) and concrete (clouds, dark patches, air holes).
// The style comes from the name, the colour from the catalogue.
import * as THREE from 'three';

const STONE_GLSL = /* glsl */ `
void pattern(vec2 p, inout Surface s) {
  vec2 q = p + uSeed * 37.0;
  float cloud = fbm(q * 0.0035, 5);
  vec3 col = uBase * (1.0 + cloud * 0.22);
  float h = 0.0;
  float rough = uGloss;
  if (uStyle < 0.5) {
    // marble: a soft cloudy ground; a few long veins across the slab that wander, thicken, thin out and break off,
    // each with a feathered halo; thin secondary veins at another angle, only in places. Distances in millimetres.
    vec2 w = vec2(fbm(q * 0.0014, 3), fbm(q * 0.0014 + 19.0, 3)) * 1.5
      + vec2(gnoise(q * 0.009 + 3.0), gnoise(q * 0.009 + 7.0)) * 0.05;
    float a1 = q.x * 0.0032 + q.y * 0.0017 + w.x * 1.6;
    float n1 = floor(a1 + 0.5);
    float d1 = abs(a1 - n1) / 0.0036;
    float s1 = hash11(n1 * 7.13 + uSeed);
    float on1 = smoothstep(-0.12, 0.18, fbm(q * 0.0012 + n1 * 13.7, 3) + s1 * 0.3 - 0.12) * step(0.2, s1);
    float w1 = mix(1.2, 9.0, pow(vnoise(q * 0.004 + n1 * 3.1), 2.0)) * mix(0.6, 1.3, s1);
    float vmain = (1.0 - smoothstep(w1 * 0.3, w1, d1)) * on1;
    float halo = exp(-d1 / mix(10.0, 40.0, s1)) * on1 * 0.5;
    float a2 = q.x * -0.0018 + q.y * 0.0052 + w.y * 1.8 + 0.37;
    float d2 = abs(a2 - floor(a2 + 0.5)) / 0.0055;
    float vfine = (1.0 - smoothstep(0.5, 1.6, d2)) * smoothstep(0.1, 0.35, fbm(q * 0.0016 + 41.0, 3)) * 0.75;
    col = mix(col, mix(uBase, uVein, 0.4), halo);
    col = mix(col, uVein, clamp(vmain + vfine, 0.0, 1.0));
    h = -vmain * 0.01;
  } else if (uStyle < 1.5) {
    // granite: crystals of three tones at two sizes
    vec3 a = worley(q / 3.2);
    vec3 b = worley(q / 1.4 + 11.0);
    vec3 c1 = mix(uBase, uVein, 0.85);
    vec3 c2 = uBase * 1.25;
    vec3 grain = a.z < 0.33 ? c1 : (a.z < 0.6 ? c2 : uBase);
    float edge = smoothstep(0.0, 0.12, a.y - a.x);
    col = mix(col, grain, 0.75) * mix(0.82, 1.0, edge);
    col = mix(col, b.z < 0.25 ? c1 : c2, (1.0 - smoothstep(0.15, 0.4, b.x)) * 0.6);
    h = (edge - 1.0) * 0.006;
  } else if (uStyle < 2.5) {
    // travertine: bands along the slab, voids stretched with them
    float band = fbm(vec2(q.x * 0.0012, q.y * 0.02), 5);
    col = uBase * (1.0 + band * 0.3) * (1.0 + vnoise(q * vec2(0.01, 0.2)) * 0.08 - 0.04);
    vec3 v = worley(vec2(q.x / 9.0, q.y / 2.2));
    float hole = (1.0 - smoothstep(0.12, 0.3, v.x)) * step(v.z, 0.16 + band * 0.3);
    col = mix(col, uVein * 0.7, hole * 0.8);
    h = -hole * 0.35;
    rough += hole * 0.25;
  } else if (uStyle < 3.5) {
    // slate: cleft layers, fine streaks, sheen changing from layer to layer
    float layer = fbm(vec2(q.x * 0.004, q.y * 0.03), 5);
    float streak = vnoise(vec2(q.x * 0.03, q.y * 0.9));
    col = uBase * (1.0 + layer * 0.35 + (streak - 0.5) * 0.1);
    h = layer * 0.25 + streak * 0.02;
    rough = clamp(uGloss + layer * 0.15, 0.05, 1.0);
  } else {
    // concrete: clouds at three scales, darker patches, air holes
    float c1 = fbm(q * 0.0025, 4);
    float c2 = fbm(q * 0.012 + 5.0, 4);
    float c3 = vnoise(q * 0.25) - 0.5;
    float blot = smoothstep(0.0, 0.3, fbm(q * 0.0016 + 9.0, 3));
    vec3 agg = worley(q / 1.6 + 3.0);
    float speck = (1.0 - smoothstep(0.1, 0.3, agg.x)) * (agg.z - 0.5);
    col = uBase * (1.0 + c1 * 0.55 + c2 * 0.24 + c3 * 0.09 + speck * 0.18) * (1.0 - blot * 0.3 * uPatches);
    vec3 v = worley(q / 7.5);
    float hole = (1.0 - smoothstep(0.05, 0.16, v.x)) * step(v.z, 0.22 * uPores);
    col = mix(col, uBase * 0.45, hole * 0.85);
    h = -hole * 0.4 + c2 * 0.03;
    rough += hole * 0.2 + c2 * 0.04;
  }
  s.albedo = col;
  s.height = h;
  s.rough = clamp(rough, 0.05, 1.0);
  s.metal = 0.0;
}
`;

const STYLE = [
  [/травертин|travertin/i, 2],
  [
    /мрамор|marble|marmo|calacatta|калакат|carrara|статуар|statuar|venato|венато|onyx|оникс|emperador|empredor|arabescato|делфи|delphi|calcutta/i,
    0,
  ],
  [/шист|slate|сланец|pietra|пиетра|scivaro|скиваро/i, 3],
  [/гранит|granite|granada|cosmos|космос|orient|bermuda|jasper|lava|лава|galaxy|галакси|amb/i, 1],
  [
    /бетон|concrete|cement|atelier|ателие|flow|arosa|calcit|калцит|chromix|кромикс|albus|oxidi[sz]ed|окисл|industrial|индустриал/i,
    4,
  ],
];

export function stoneSpec(d, seed) {
  const name = `${d.name ?? ''} ${d.nameEn ?? ''}`;
  const hit = STYLE.find(([re]) => re.test(name));
  const style = hit ? hit[1] : d.category === 'concrete' ? 4 : 1;
  const base = new THREE.Color(d.hex);
  const lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
  let vein;
  if (/злат|gold|oro|calacatta/i.test(name) && lum > 0.3) vein = new THREE.Color('#9c8152');
  else if (lum < 0.12) {
    vein = new THREE.Color().setRGB(0.55, 0.53, 0.5);
    // the light crystals of a near-black granite are greys, at most ten times as bright as the ground (linear
    // light): white ones over a third of the slab would turn a black stone grey
    if (style === 1) vein.multiplyScalar(Math.min(1, (lum * 10) / 0.53));
  } else vein = base.clone().multiplyScalar(style === 0 ? 0.35 : 0.42);
  const gloss =
    { gloss: 0.12, 'high-gloss': 0.08, satin: 0.32 }[d.finish] ?? (style === 3 ? 0.55 : 0.5);
  return {
    kind: 'stone',
    glsl: STONE_GLSL,
    span: [2400, 1200],
    size: [2048, 1024],
    color: d.hex,
    uniforms: {
      uBase: { value: base },
      uVein: { value: vein },
      uStyle: { value: style },
      uGloss: { value: gloss },
      uPatches: { value: /чикаго|chicago|rusty|iron|dark/i.test(name) ? 1.4 : 0.8 },
      uPores: { value: /flow|silk|soft/i.test(name) ? 0.4 : 1 },
      uSeed: { value: (seed % 991) * 0.613 },
    },
  };
}
