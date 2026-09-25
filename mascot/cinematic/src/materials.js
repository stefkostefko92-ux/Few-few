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
        // Rim fresnel, split a hair per channel (blue falls off fastest, red slowest) so the very
        // edge of the jelly carries a thin warm-to-cool dispersion fringe instead of a flat-tinted
        // rim — the same read a real refractive edge gives under a studio key light.
        float ndv = max(dot(normalize(vViewPosition), normalize(vNormal)), 0.0);
        vec3 dispersion = vec3(pow(1.0 - ndv, 2.3), pow(1.0 - ndv, 2.6), pow(1.0 - ndv, 3.1));
        gl_FragColor.rgb += uRimColor * dispersion * uRimStrength;${gradLine}`,
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
      normalScale: v2(0.09), // barely visible weave + skin micro-imperfections — sealed inside, not printed on top
      attenuationColor: new THREE.Color(p.olive),
      attenuationDistance: 2.2, // almost no self-absorption — the gradient tint carries the color now
      emissive: new THREE.Color(p.olive),
      emissiveIntensity: 0.075, // faint constant inner glow, evenly across the body — no discrete core mesh
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

  // Lacquered acetate: soft, distributed specular instead of a razor clearcoat, so a bright key
  // light does not blow the rim into a single white triangle (the old "broken glasses" look).
  const acetate = new THREE.MeshPhysicalMaterial({
    name: 'acetate', color: p.ink, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.5, specularIntensity: 0.4,
    normalMap: T.scratch.normalMap, normalScale: v2(0.12), roughnessMap: T.scratch.roughnessMap,
  });
  const lens = lensGlassMaterial(p);
  // A painted-on softbox catchlight for the lens (face.js): a controllable soft rounded highlight
  // instead of whatever hard-edged shape our 3-flat-panel environment happens to reflect there.
  const catchlight = new THREE.MeshBasicMaterial({ name: 'catchlight', map: T.radial, color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });

  // Wet-eye read: a real clearcoat layer over the sclera, not just a rougher diffuse — a moist eye
  // has its own thin, glossy tear-film highlight separate from the lens' own reflection.
  const sclera = new THREE.MeshPhysicalMaterial({ name: 'sclera', color: p.eye, roughness: 0.32, envMapIntensity: 0.2, clearcoat: 0.22, clearcoatRoughness: 0.3 });
  const iris = new THREE.MeshStandardMaterial({
    name: 'iris', color: p.inkSoft, roughness: 0.4, envMapIntensity: 0.22,
    normalMap: T.iris.normalMap, normalScale: v2(0.6), roughnessMap: T.iris.roughnessMap,
  });
  // Flat painted ink for shapes that are not the iris disc itself (mouth) — same tone, no radial
  // fiber map, so the texture designed for a round iris does not smear across a thin curved tube.
  const inkPaint = new THREE.MeshStandardMaterial({ name: 'inkPaint', color: p.inkSoft, roughness: 0.4, envMapIntensity: 0.35 });
  const pupil = new THREE.MeshStandardMaterial({ name: 'pupil', color: 0x000000, roughness: 0.06, envMapIntensity: 0.55 });
  const sparkle = new THREE.MeshBasicMaterial({ name: 'sparkle', color: 0xffffff, toneMapped: false });

  // Brows: matte and lightly fibrous (the felt normal map, at a much finer scale, reads as short
  // fine hairs rather than woven fabric) instead of the glossy acetate the plastic frames use —
  // a lacquered-plastic brow was the "too CG-perfect" tell the brief called out (defect: thin,
  // flat, plastic-looking brows).
  const browFuzz = new THREE.MeshStandardMaterial({ name: 'browFuzz', color: p.ink, roughness: 0.82, normalMap: T.felt.normalMap, normalScale: v2(0.35), envMapIntensity: 0.25 });

  const felt = new THREE.MeshStandardMaterial({ name: 'felt', color: p.ink, roughness: 0.66, normalMap: T.felt.normalMap, roughnessMap: T.felt.roughnessMap, envMapIntensity: 0.5 });
  const feltTop = new THREE.MeshStandardMaterial({ name: 'feltTop', color: p.inkSoft, roughness: 0.72, normalMap: T.felt.normalMap, roughnessMap: T.felt.roughnessMap, envMapIntensity: 0.6 });
  const gold = new THREE.MeshPhysicalMaterial({ name: 'gold', color: p.gold, metalness: 1, roughness: 0.28, envMapIntensity: 1.5, clearcoat: 0.25 });

  // Soft satin/silk-twill, not lacquered plastic: the earlier version's high envMapIntensity plus a
  // tight clearcoat mirrored our three flat softbox panels almost verbatim off the wing's bevelled
  // facets — sharp rectangular highlights that read as faceted black metal (2026-09-25 review defect).
  // Dropping the clearcoat and the reflection strength, and painting the actual weave into roughness
  // (not just normal), is what turns that same geometry back into cloth: the highlight softens into a
  // sheen bloom instead of a mirror facet, and a close-up shows fine fiber, not a smooth plastic sheet.
  const satin = new THREE.MeshPhysicalMaterial({
    name: 'satin', color: p.inkSoft, roughness: 0.46, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(p.pale),
    normalMap: T.satin.normalMap, normalScale: v2(0.5), roughnessMap: T.satin.roughnessMap, envMapIntensity: 0.35, clearcoat: 0,
  });
  const satinKnot = satin.clone();
  satinKnot.color = new THREE.Color(p.inkSoft);

  // Internal bubbles get their own, slightly more present fresnel shell than the big flat glasses
  // lens (`lensGlassMaterial` below is tuned to stay near-invisible dead-on so the iris reads through
  // it) — a small sphere is all rim, no flat face, so it needs a higher base alpha to read as a real
  // trapped bubble refracting light inside the jelly rather than vanish (brief: "мехурчетата вътре —
  // да се четат").
  const bubble = new THREE.ShaderMaterial({
    name: 'bubble',
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xf3fbe8) }, uRim: { value: new THREE.Color(p.pale) } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uRim; varying vec3 vN; varying vec3 vV;
      void main() {
        float fres = pow(1.0 - max(dot(vV, normalize(vN)), 0.0), 2.0);
        gl_FragColor = vec4(uColor + uRim * fres, 0.16 + fres * 0.6);
      }`,
  });

  const ground = new THREE.ShadowMaterial({ opacity: 0.48 });
  const glow = new THREE.MeshBasicMaterial({ color: p.olive, map: T.radial, transparent: true, opacity: 0.4, depthWrite: false });
  const caustic = causticMaterial(p);

  // The desk set: everything the mascot now sits inside of. Baked once here, at load, exactly
  // like the mascot's own jelly/felt/satin above — no external images, tileable procedural maps
  // from textures.js (defect this fixes: the mascot used to sit in a black void, which read as
  // "rendered", not "photographed" — see mascot/CLAUDE.md cinematic/ 2026-09-25).
  // The desktop is much bigger than one bake tile — repeat the grain plank-scale (5x3) instead of
  // stretching one 42-ring sine sweep across the whole slab, which read as flat horizontal bands
  // (2026-09-25 review regression, not real grain).
  for (const m of [T.wood.albedoMap, T.wood.normalMap, T.wood.roughnessMap]) m.repeat.set(5, 3);
  const wood = new THREE.MeshStandardMaterial({
    name: 'wood', color: 0xc79a68, map: T.wood.albedoMap, normalMap: T.wood.normalMap, normalScale: v2(0.3),
    roughnessMap: T.wood.roughnessMap, roughness: 0.8, metalness: 0, envMapIntensity: 0.18,
  });
  const bookLeather = (hex) => new THREE.MeshPhysicalMaterial({
    name: 'bookLeather', color: hex, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.5,
    normalMap: T.leather.normalMap, normalScale: v2(0.6), roughnessMap: T.leather.roughnessMap, envMapIntensity: 0.4,
  });
  const paper = new THREE.MeshStandardMaterial({ name: 'paper', color: 0xd8cbaa, roughness: 0.95, envMapIntensity: 0.2 });
  const brass = new THREE.MeshPhysicalMaterial({ name: 'brass', color: 0xd8a24a, metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.28, envMapIntensity: 1.4 });
  const bulb = new THREE.MeshBasicMaterial({ name: 'bulb', color: 0xfff6d8, toneMapped: false });
  const shade = new THREE.MeshPhysicalMaterial({ name: 'shade', color: 0x4a3418, roughness: 0.5, side: THREE.DoubleSide, transmission: 0.65, thickness: 0.25, ior: 1.3, envMapIntensity: 0.4, emissive: 0x3a2410, emissiveIntensity: 0.3 });
  const windowGlass = new THREE.MeshBasicMaterial({ name: 'windowGlass', map: T.windowSky, toneMapped: false });
  const windowFrame = new THREE.MeshStandardMaterial({ name: 'windowFrame', color: 0x160f0a, roughness: 0.7, envMapIntensity: 0.3 });
  const dust = new THREE.MeshBasicMaterial({ name: 'dust', color: 0xf2e6c0, map: T.radial, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const dustSprite = new THREE.SpriteMaterial({ color: 0xf2e6c0, map: T.radial, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });

  return {
    jelly, limb, fabric, acetate, lens, catchlight, sclera, iris, inkPaint, pupil, sparkle, browFuzz, felt, feltTop, gold, satin, satinKnot, bubble, ground, glow, caustic,
    wood, bookLeather, paper, brass, bulb, shade, windowGlass, windowFrame, dust, dustSprite,
  };
}

// The lens: a small unlit fresnel shader instead of a lit `transparent`/`transmission` material —
// both of those reacted to the studio's five-plus lights and washed the whole disc bright white,
// hiding the iris/pupil behind it, and `transmission` additionally sampled the black void past the
// head's own silhouette as a dark wedge INSIDE the lens (never an environment reflection — see the
// git history on this file). Fully unlit removes both failure modes at the source: alpha stays low
// dead-on (the eye reads clearly through it) and only rises toward the rim (a real Fresnel term,
// not scene geometry) — the separate `catchlight` quad supplies the soft upper-left softbox glint.
function lensGlassMaterial(p) {
  return new THREE.ShaderMaterial({
    name: 'lens',
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xf3fbe8) }, uRim: { value: new THREE.Color(p.pale) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uRim;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float fres = pow(1.0 - max(dot(vV, normalize(vN)), 0.0), 3.2);
        vec3 col = uColor + uRim * fres * 0.7;
        gl_FragColor = vec4(col, 0.05 + fres * 0.55);
      }`,
  });
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
