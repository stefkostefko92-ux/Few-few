// Physically based material library for the mascot: transmissive lime jelly, lacquered acetate,
// clear lens, sclera/iris/pupil, brushed gold, satin bow tie, felted mortarboard.
// Written for this package (materials.js structure follows boy/src/materials.js: onBeforeCompile
// fresnel/grime-style injection is the same technique, applied to a jelly rim glow instead).
import * as THREE from 'three';
import { createJelly, jellyMotion, softenPunctual } from './materials-jelly.js';

const v2 = (x, y = x) => new THREE.Vector2(x, y);

export { jellyMotion };

export function createMaterials(T, palette, { dispersion = 0 } = {}) {
  const p = palette;

  const { jelly, limb } = createJelly(T, p, dispersion);

  const fabric = new THREE.MeshStandardMaterial({ name: 'fabric', color: new THREE.Color(p.deep).multiplyScalar(0.45), /* не черна дупка: тъмно ядро в цвета на accent-а, видимо през желето */ roughnessMap: T.carbon.roughnessMap, normalMap: T.carbon.normalMap, normalScale: v2(0.4), roughness: 1, metalness: 0.04 });

  // Lacquered acetate: soft, distributed specular instead of a razor clearcoat, so a bright key
  // light does not blow the rim into a single white triangle (the old "broken glasses" look).
  const acetate = new THREE.MeshPhysicalMaterial({
    name: 'acetate', color: p.ink, roughness: 0.3, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9, specularIntensity: 0.7,
    normalMap: T.scratch.normalMap, normalScale: v2(0.12), roughnessMap: T.scratch.roughnessMap,
  });
  const lens = lensGlassMaterial();
  // A painted-on softbox catchlight for the lens (face.js): a controllable soft rounded highlight
  // instead of whatever hard-edged shape our 3-flat-panel environment happens to reflect there.
  const catchlight = new THREE.MeshBasicMaterial({ name: 'catchlight', map: T.radial, color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });

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

  // Шапката е вълнен филц: матова основа + `sheen` (влакната на ръба улавят светлина като кадифен
  // ореол по дебелите ръбове) — това чете като плат, а не като матова пластмаса.
  const feltSheen = new THREE.Color(0x8a93a8);
  const felt = new THREE.MeshPhysicalMaterial({ name: 'felt', color: p.ink, roughness: 0.82, sheen: 1, sheenRoughness: 0.45, sheenColor: feltSheen, normalMap: T.felt.normalMap, normalScale: v2(0.8), roughnessMap: T.felt.roughnessMap, envMapIntensity: 0.5 });
  const feltTop = new THREE.MeshPhysicalMaterial({ name: 'feltTop', color: p.inkSoft, roughness: 0.84, sheen: 1, sheenRoughness: 0.4, sheenColor: feltSheen, normalMap: T.felt.normalMap, normalScale: v2(0.8), roughnessMap: T.felt.roughnessMap, envMapIntensity: 0.6 });
  // Четкано злато: анизотропен метал (ивица на отражението се разтяга по посока на четката) +
  // средна грапавост — пискюлът и копчето не са огледало, а сатенирано злато.
  const gold = softenPunctual(new THREE.MeshPhysicalMaterial({ name: 'gold', color: p.gold, metalness: 1, roughness: 0.4, anisotropy: 0.6, anisotropyRotation: Math.PI / 2, envMapIntensity: 0.45, clearcoat: 0 }), 0.25);

  // Soft satin/silk-twill, not lacquered plastic: the earlier version's high envMapIntensity plus a
  // tight clearcoat mirrored our three flat softbox panels almost verbatim off the wing's bevelled
  // facets — sharp rectangular highlights that read as faceted black metal (2026-09-25 review defect).
  // Dropping the clearcoat and the reflection strength, and painting the actual weave into roughness
  // (not just normal), is what turns that same geometry back into cloth: the highlight softens into a
  // sheen bloom instead of a mirror facet, and a close-up shows fine fiber, not a smooth plastic sheet.
  const satin = new THREE.MeshPhysicalMaterial({
    name: 'satin', color: p.inkSoft, roughness: 0.46, sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x6f7890), anisotropy: 0.4, anisotropyRotation: 0.35, // сатен: вплетената нишка опъва блика на отражението по посока на тъканта
    
    normalMap: T.satin.normalMap, normalScale: v2(0.5), roughnessMap: T.satin.roughnessMap, envMapIntensity: 0.22, clearcoat: 0,
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
  // One tile already IS the whole desktop (desk-textures.js `woodTextures` draws all six planks
  // across its own 0..1 U range) — repeating it would just tile the same six planks side by side
  // again, an obvious seam every repeat. No repeat: the single bake maps 1:1 onto the desk mesh.
  const wood = new THREE.MeshStandardMaterial({
    name: 'wood', color: 0xc79a68, map: T.wood.albedoMap, normalMap: T.wood.normalMap, normalScale: v2(0.14),
    roughnessMap: T.wood.roughnessMap, roughness: 0.92, metalness: 0, envMapIntensity: 0.05,
  });
  // Every book on the desk gets its own clone (only `color` differs); `bookLeatherInstances`
  // tracks them so src/baked.js can patch the shared normal/roughness maps in place once the
  // offline bake loads, without buildScene needing to know how many books desk.js built.
  const bookLeatherInstances = [];
  const bookLeather = (hex) => {
    const m = new THREE.MeshPhysicalMaterial({
      name: 'bookLeather', color: hex, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.5,
      normalMap: T.leather.normalMap, normalScale: v2(0.6), roughnessMap: T.leather.roughnessMap, envMapIntensity: 0.4,
    });
    bookLeatherInstances.push(m);
    return m;
  };
  const paper = new THREE.MeshStandardMaterial({ name: 'paper', color: 0xd8cbaa, roughness: 0.95, envMapIntensity: 0.2 });
  const brass = new THREE.MeshPhysicalMaterial({ name: 'brass', color: 0xd8a24a, metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.28, envMapIntensity: 1.4 });
  const bulb = new THREE.MeshBasicMaterial({ name: 'bulb', color: 0xfff6d8, toneMapped: false });
  const shade = new THREE.MeshPhysicalMaterial({ name: 'shade', color: 0x4a3418, roughness: 0.5, side: THREE.DoubleSide, transmission: 0.65, thickness: 0.25, ior: 1.3, envMapIntensity: 0.4, emissive: 0x3a2410, emissiveIntensity: 0.3 });
  const windowGlass = new THREE.MeshBasicMaterial({ name: 'windowGlass', map: T.windowSky, toneMapped: false, color: new THREE.Color(0xffffff).multiplyScalar(1.5) }); // по-ярък от кадъра: през желето това е контражурът
  const windowFrame = new THREE.MeshStandardMaterial({ name: 'windowFrame', color: 0x160f0a, roughness: 0.7, envMapIntensity: 0.3 });
  const dust = new THREE.MeshBasicMaterial({ name: 'dust', color: 0xf2e6c0, map: T.radial, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const dustSprite = new THREE.SpriteMaterial({ color: 0xf2e6c0, map: T.radial, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });

  return {
    jelly, limb, fabric, acetate, lens, catchlight, sclera, iris, inkPaint, pupil, sparkle, browFuzz, felt, feltTop, gold, satin, satinKnot, bubble, ground, glow, caustic,
    wood, bookLeather, bookLeatherInstances, paper, brass, bulb, shade, windowGlass, windowFrame, dust, dustSprite,
  };
}

// Лещата: истинско стъкло, а не фиктивен ореол. Тъмен (диелектричен) физичен материал, на който
// остава само отражението на средата и лампата (спекулар, Френел по ior 1.5); смесването е
// `src + dst·(1 − α)`, т.е. отражението се ДОБАВЯ върху зеницата/склерата зад стъклото, а не я
// затъмнява. α следва яркостта на отражението, та там, където стъклото е огледало (рамката на
// софтбокса, ръбът), очите отзад се покриват, а в останалото остават напълно четими. Предишната
// версия беше неосветен шейдър (светлите прозрачни лещи измиваха очите) — тук светлините отново
// участват, но стъклото няма дифузен слой, така че не може да „избели“ диска.
function lensGlassMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    name: 'lens', color: 0x000000, metalness: 0, roughness: 0.03, ior: 1.52, specularIntensity: 1,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.75,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n      gl_FragColor.a = clamp(dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * 1.1, 0.015, 0.85);',
    );
  };
  m.customProgramCacheKey = () => 'lens-glass';
  return m;
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
