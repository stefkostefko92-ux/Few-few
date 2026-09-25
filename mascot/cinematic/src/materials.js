// Physically based material library for the mascot: transmissive lime jelly, lacquered acetate,
// clear lens, sclera/iris/pupil, brushed gold, satin bow tie, felted mortarboard.
// Written for this package (materials.js structure follows boy/src/materials.js: onBeforeCompile
// fresnel/grime-style injection is the same technique, applied to a jelly rim glow instead).
import * as THREE from 'three';

const v2 = (x, y = x) => new THREE.Vector2(x, y);

// Shared secondary-motion uniforms: one clock, one jiggle amount, driven by scene.js every frame
// and read by every jelly surface (torso + limbs) so a click impulse ripples through all of them.
export const jellyMotion = { uTime: { value: 0 }, uJiggle: { value: 0 } };

// Rim/subsurface glow (fragment) + squash-jiggle displacement (vertex): a Fresnel term brightens
// the emissive term at grazing angles, so the edge of the jelly reads as light escaping the
// material (defect #3) instead of a flat fill color; the vertex term is the jelly's secondary motion.
function withRimGlow(mat, color, strength, gradient) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimStrength = { value: strength };
    shader.uniforms.uTime = jellyMotion.uTime;
    shader.uniforms.uJiggle = jellyMotion.uJiggle;
    shader.vertexShader = `uniform float uTime;\nuniform float uJiggle;\n${shader.vertexShader}`
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      float jw = sin(uTime * 2.2 + position.y * 2.4) * uJiggle * 0.04;
      transformed.x += jw * normal.x;
      transformed.z += jw * normal.z;
      vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      );
    let frag = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nvarying float vWorldY;');
    // Top-lit lime, deeper green low. NOTE: with transmission=1 the diffuse albedo barely reaches
    // the screen (the physical BSDF routes almost everything through the transmission lobe, which
    // reads from attenuationColor, not diffuseColor) — tinting diffuseColor here was a no-op in
    // practice. Adding the gradient as emitted light instead (alongside the rim term, in the same
    // additive line) actually shows up, because emission bypasses the transmission lobe entirely.
    let gradLine = '';
    if (gradient) {
      frag = frag.replace('#include <common>', `#include <common>\nuniform vec3 uTopTint;\nuniform vec3 uBottomTint;`);
      shader.uniforms.uTopTint = { value: new THREE.Color(gradient.top) };
      shader.uniforms.uBottomTint = { value: new THREE.Color(gradient.bottom) };
      gradLine = `
        float gradT = clamp(vWorldY * 0.42 + 0.5, 0.0, 1.0);
        gl_FragColor.rgb += mix(uBottomTint, uTopTint, gradT) * 0.16;`;
    }
    shader.fragmentShader = frag.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
        float rimFres = pow(1.0 - max(dot(normalize(vViewPosition), normalize(vNormal)), 0.0), 2.6);
        gl_FragColor.rgb += uRimColor * rimFres * uRimStrength;${gradLine}`,
    );
  };
  mat.customProgramCacheKey = () => `rim-${color}-${strength}-${gradient ? gradient.top + gradient.bottom : ''}`;
  return mat;
}

export function createMaterials(T, palette) {
  const p = palette;

  // True jelly: transmission + thickness + attenuation carry the color, not a painted diffuse —
  // thin edges (ears, limbs) go pale/clear, the thick torso deepens toward bottle/deep, exactly
  // the "material catches light" read the flat MeshStandardMaterial version could not produce.
  const jelly = withRimGlow(
    new THREE.MeshPhysicalMaterial({
      name: 'jelly',
      color: 0xf3fbe4,
      transmission: 1,
      thickness: 1.1,
      ior: 1.34,
      roughness: 0.09,
      specularIntensity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.32, // spreads the specular so one key light does not become a hard hotspot
      normalMap: T.carbon.normalMap,
      normalScale: v2(0.05), // barely visible — sealed inside, not printed on top
      attenuationColor: new THREE.Color(p.olive),
      attenuationDistance: 2.2, // almost no self-absorption — the gradient tint carries the color now
      emissive: new THREE.Color(p.olive),
      emissiveIntensity: 0.05, // faint constant inner glow, on top of the rim Fresnel term
      envMapIntensity: 0.85,
      side: THREE.DoubleSide,
    }),
    p.olive,
    0.3,
    { top: p.pale, bottom: p.neon },
  );
  const limb = jelly.clone();
  limb.thickness = 0.55;
  limb.attenuationDistance = 1.4;
  limb.normalMap = T.carbon.normalMap;
  limb.onBeforeCompile = jelly.onBeforeCompile;

  const fabric = new THREE.MeshStandardMaterial({ name: 'fabric', color: 0x0a0c0a, roughnessMap: T.carbon.roughnessMap, normalMap: T.carbon.normalMap, normalScale: v2(0.4), roughness: 1, metalness: 0.04 });
  const coreGlow = new THREE.MeshBasicMaterial({ name: 'core', color: p.olive, map: T.core, toneMapped: false, transparent: true, opacity: 0.4 });

  // Lacquered acetate: soft, distributed specular instead of a razor clearcoat, so a bright key
  // light does not blow the rim into a single white triangle (the old "broken glasses" look).
  const acetate = new THREE.MeshPhysicalMaterial({ name: 'acetate', color: p.ink, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.5, specularIntensity: 0.4 });
  const lens = new THREE.MeshPhysicalMaterial({ name: 'lens', color: 0xffffff, transmission: 0.95, roughness: 0.1, ior: 1.5, thickness: 0.05, envMapIntensity: 0.16, clearcoat: 0.5, clearcoatRoughness: 0.1 });

  // Wet-eye read: a real clearcoat layer over the sclera, not just a rougher diffuse — a moist eye
  // has its own thin, glossy tear-film highlight separate from the lens' own reflection.
  const sclera = new THREE.MeshPhysicalMaterial({ name: 'sclera', color: p.eye, roughness: 0.32, envMapIntensity: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  const iris = new THREE.MeshStandardMaterial({
    name: 'iris', color: p.inkSoft, roughness: 0.4, envMapIntensity: 0.22,
    normalMap: T.iris.normalMap, normalScale: v2(0.6), roughnessMap: T.iris.roughnessMap,
  });
  // Flat painted ink for shapes that are not the iris disc itself (mouth) — same tone, no radial
  // fiber map, so the texture designed for a round iris does not smear across a thin curved tube.
  const inkPaint = new THREE.MeshStandardMaterial({ name: 'inkPaint', color: p.inkSoft, roughness: 0.4, envMapIntensity: 0.35 });
  const pupil = new THREE.MeshStandardMaterial({ name: 'pupil', color: 0x000000, roughness: 0.06, envMapIntensity: 0.55 });
  const sparkle = new THREE.MeshBasicMaterial({ name: 'sparkle', color: 0xffffff, toneMapped: false });

  const felt = new THREE.MeshStandardMaterial({ name: 'felt', color: p.ink, roughness: 0.66, normalMap: T.felt.normalMap, roughnessMap: T.felt.roughnessMap, envMapIntensity: 0.5 });
  const feltTop = new THREE.MeshStandardMaterial({ name: 'feltTop', color: p.inkSoft, roughness: 0.72, normalMap: T.felt.normalMap, roughnessMap: T.felt.roughnessMap, envMapIntensity: 0.6 });
  const gold = new THREE.MeshPhysicalMaterial({ name: 'gold', color: p.gold, metalness: 1, roughness: 0.28, envMapIntensity: 1.5, clearcoat: 0.25 });

  const satin = new THREE.MeshPhysicalMaterial({ name: 'satin', color: p.inkSoft, roughness: 0.3, sheen: 1, sheenRoughness: 0.2, sheenColor: new THREE.Color(p.pale), normalMap: T.satin.normalMap, normalScale: v2(0.6), envMapIntensity: 1.3, clearcoat: 0.15, clearcoatRoughness: 0.4 });
  const satinKnot = satin.clone();
  satinKnot.color = new THREE.Color(p.inkSoft);

  const ground = new THREE.ShadowMaterial({ opacity: 0.48 });
  const glow = new THREE.MeshBasicMaterial({ color: p.olive, map: T.radial, transparent: true, opacity: 0.4, depthWrite: false });
  const caustic = causticMaterial(p);

  return { jelly, limb, fabric, coreGlow, acetate, lens, sclera, iris, inkPaint, pupil, sparkle, felt, feltTop, gold, satin, satinKnot, ground, glow, caustic };
}

// Floor caustics: the pool of light a transmissive body actually throws on the ground beneath it —
// two drifting layers of warped rings (never a static texture, real light through jelly moves) in
// the accent hue, additive so they only ever brighten the contact-shadow disc, never darken it.
// Cheap fullscreen-quad-style shader on a small plane, not a photoreal caustic solver — reads right
// at mascot scale without a render-target ping-pong the size of this scene does not need.
function causticMaterial(p) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: jellyMotion.uTime, uColor: { value: new THREE.Color(p.neon) }, uColor2: { value: new THREE.Color(p.pale) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uColor2;
      varying vec2 vUv;
      float ring(vec2 uv, float t) {
        float d = length(uv);
        return abs(sin((d * 9.0 - t * 1.1) + sin(uv.x * 5.0 + t * 0.7) * 1.4));
      }
      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float fall = 1.0 - smoothstep(0.15, 1.0, length(uv));
        float r1 = pow(ring(uv, uTime), 5.0);
        float r2 = pow(ring(uv * 1.4 + 0.3, uTime * 0.8 + 2.0), 5.0);
        vec3 col = mix(uColor, uColor2, r2) * (r1 * 0.6 + r2 * 0.4);
        gl_FragColor = vec4(col * fall, (r1 + r2) * fall * 0.5);
      }`,
  });
}
