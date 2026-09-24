// Physically based material library: wet polished steel, blackened plate, mail, cloth, stone.
import * as THREE from 'three';

const v2 = (x, y = x) => new THREE.Vector2(x, y);

function repeated(tex, x, y) {
  const t = tex.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

// Darker, glossier stone within splash height of the wet ground.
function wetBase(mat, height = 1.4) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWetY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWetY;')
      .replace('#include <map_fragment>', `#include <map_fragment>\nfloat wetK = 1.0 - smoothstep(0.0, ${height.toFixed(2)}, vWetY);\ndiffuseColor.rgb *= 1.0 - 0.5 * wetK;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.55 * wetK;');
  };
  mat.customProgramCacheKey = () => `wetBase${height}`;
  return mat;
}

export function createMaterials(T) {
  const drops = T.drops.normalMap;
  const steelA = new THREE.MeshPhysicalMaterial({
    name: 'steelA',
    color: 0xc6cad0,
    metalness: 1,
    roughness: 0.3,
    roughnessMap: T.metal.roughnessMap,
    normalMap: T.metal.normalMap,
    normalScale: v2(0.3),
    clearcoat: 0.6,
    clearcoatRoughness: 0.06,
    clearcoatNormalMap: drops,
    clearcoatNormalScale: v2(0.55),
    side: THREE.DoubleSide,
  });
  const steelB = new THREE.MeshPhysicalMaterial({
    name: 'steelB',
    color: 0x1f1e22,
    metalness: 0.92,
    roughness: 0.52,
    roughnessMap: T.metal.roughnessMap,
    normalMap: T.metal.normalMap,
    normalScale: v2(0.45),
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    clearcoatNormalMap: drops,
    clearcoatNormalScale: v2(0.55),
    side: THREE.DoubleSide,
  });
  const brass = new THREE.MeshPhysicalMaterial({ name: 'brass', color: 0xc9a25a, metalness: 1, roughness: 0.3, roughnessMap: T.metal.roughnessMap, clearcoat: 0.4, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const goldB = new THREE.MeshPhysicalMaterial({ name: 'goldB', color: 0xa77a30, metalness: 1, roughness: 0.34, roughnessMap: T.metal.roughnessMap, clearcoat: 0.4, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const mail = new THREE.MeshStandardMaterial({
    name: 'mail',
    color: 0x8e949c,
    map: T.mail.map,
    normalMap: T.mail.normalMap,
    normalScale: v2(1.1),
    metalness: 1,
    roughness: 0.44,
    side: THREE.DoubleSide,
  });
  const gambeson = new THREE.MeshPhysicalMaterial({ name: 'gambeson', color: 0x3c3226, roughness: 0.95, sheen: 0.6, sheenColor: 0x7a6a50, sheenRoughness: 0.6, normalMap: repeated(T.fabric.normalMap, 6, 6) });
  const leather = new THREE.MeshStandardMaterial({ name: 'leather', color: 0x3a2417, roughness: 0.62, roughnessMap: T.leather.roughnessMap, normalMap: T.leather.normalMap, normalScale: v2(0.8) });
  const slit = new THREE.MeshBasicMaterial({ name: 'slit', color: 0x010101, side: THREE.DoubleSide });
  const blade = new THREE.MeshPhysicalMaterial({
    name: 'blade',
    color: 0xd9dde2,
    metalness: 1,
    roughness: 0.24,
    roughnessMap: repeated(T.metal.roughnessMap, 1, 5),
    anisotropy: 0.55,
    clearcoat: 0.15,
    clearcoatRoughness: 0.05,
    clearcoatNormalMap: drops,
    side: THREE.DoubleSide,
  });
  const bladeDark = blade.clone();
  bladeDark.color.set(0x9da1a8);
  bladeDark.roughness = 0.24;
  const capeA = new THREE.MeshPhysicalMaterial({
    name: 'capeA',
    map: T.capeA,
    roughness: 0.86,
    sheen: 1,
    sheenColor: 0x5b78c8,
    sheenRoughness: 0.45,
    normalMap: repeated(T.fabric.normalMap, 8, 12),
    normalScale: v2(0.6),
    side: THREE.DoubleSide,
  });
  const capeB = new THREE.MeshPhysicalMaterial({
    name: 'capeB',
    map: T.capeB,
    alphaTest: 0.5,
    roughness: 0.88,
    sheen: 1,
    sheenColor: 0xa22a34,
    sheenRoughness: 0.5,
    normalMap: repeated(T.fabric.normalMap, 8, 12),
    normalScale: v2(0.6),
    side: THREE.DoubleSide,
  });
  const shieldFace = new THREE.MeshPhysicalMaterial({
    name: 'shieldFace',
    map: T.shield.map,
    roughness: 0.9,
    roughnessMap: T.shield.roughnessMap,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
    clearcoatNormalMap: drops,
    clearcoatNormalScale: v2(0.5),
    side: THREE.DoubleSide,
  });
  const wood = new THREE.MeshStandardMaterial({ name: 'wood', map: T.wood.map, normalMap: T.wood.normalMap, roughnessMap: T.wood.roughnessMap, roughness: 1, side: THREE.DoubleSide });
  const iron = new THREE.MeshStandardMaterial({ name: 'iron', color: 0x2b2724, metalness: 0.85, roughness: 0.6, roughnessMap: T.metal.roughnessMap, normalMap: T.metal.normalMap });
  const stone = wetBase(new THREE.MeshStandardMaterial({ name: 'stone', map: T.wall.map, normalMap: T.wall.normalMap, normalScale: v2(1.2), roughnessMap: T.wall.roughnessMap, roughness: 1 }));
  const roof = new THREE.MeshStandardMaterial({ name: 'roof', color: 0x2a2d33, roughness: 0.55, metalness: 0.1, normalMap: repeated(T.wall.normalMap, 3, 3) });
  const banner = new THREE.MeshPhysicalMaterial({ name: 'banner', map: T.banner, alphaTest: 0.5, roughness: 0.85, sheen: 1, sheenColor: 0xa22a34, side: THREE.DoubleSide });
  const coal = new THREE.MeshStandardMaterial({ name: 'coal', color: 0x120b08, roughness: 0.9, emissive: new THREE.Color(1.0, 0.28, 0.05), emissiveIntensity: 1.3 });
  const windowGlow = new THREE.MeshBasicMaterial({ name: 'window', color: new THREE.Color(1.5, 0.66, 0.2) });
  return { steelA, steelB, brass, goldB, mail, gambeson, leather, slit, blade, bladeDark, capeA, capeB, shieldFace, wood, iron, stone, roof, banner, coal, windowGlow };
}

// Wet mud splashed up the greaves and sabatons: darker, rougher, no longer bare metal.
export function applyGrime(materials, noise) {
  for (const mat of materials) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.tGrimeNoise = { value: noise };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 grimeW = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            grimeW = batchingMatrix * grimeW;
          #endif
          vGrimeW = (modelMatrix * grimeW).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrimeNoise;\nvarying vec3 vGrimeW;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float grime = (1.0 - smoothstep(0.03, 0.55, vGrimeW.y)) * smoothstep(0.35, 0.75, texture2D(tGrimeNoise, vGrimeW.xz * 1.7 + vGrimeW.y * 2.3).a + 0.25);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.034, 0.024), grime * 0.85);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, grime * 0.7);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - grime * 0.85;');
    };
    mat.customProgramCacheKey = () => `grime-${mat.name}`;
  }
}
