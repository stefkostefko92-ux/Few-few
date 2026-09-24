// Wet cobblestones: puddles with planar reflections, rain ripples and blurred wet sheen.
// Puddle layout and ripple impacts come from precomputed textures, so the floor costs a few
// texture reads per pixel instead of procedural noise.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const SIZE = 44;

export function createGround(T, { reflections, noise, ripple, puddle }) {
  const rep = SIZE / 3;
  const tiled = (tex) => {
    const t = tex.clone();
    t.repeat.set(rep, rep);
    t.needsUpdate = true;
    return t;
  };
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  const reflector = new Reflector(geo, { textureWidth: 512, textureHeight: 512, clipBias: 0.004, multisample: 0 });
  const texMatrix = reflector.material.uniforms.textureMatrix.value;
  const rt = reflector.getRenderTarget();
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  // The mirrored camera sees only layer 0: rain, embers and smoke are skipped in the reflection.
  const baseCamera = reflector.getReflectionCamera;
  reflector.getReflectionCamera = function reflectionCamera(camera) {
    const c = baseCamera.call(this, camera);
    c.layers.set(0);
    return c;
  };
  const uniforms = {
    tReflect: { value: rt.texture },
    uTexMatrix: { value: texMatrix },
    uTime: { value: 0 },
    uReflect: { value: reflections ? 1 : 0 },
    tNoise: { value: noise },
    tRipple: { value: ripple },
    tPuddle: { value: puddle },
  };
  const mat = new THREE.MeshStandardMaterial({
    name: 'cobbles',
    map: tiled(T.cobble.map),
    normalMap: tiled(T.cobble.normalMap),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: tiled(T.cobble.roughnessMap),
    roughness: 1,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uTexMatrix;\nvarying vec4 vReflUv;\nvarying vec3 vGroundW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReflUv = uTexMatrix * vec4(position, 1.0);\nvGroundW = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tReflect;
        uniform sampler2D tNoise;
        uniform sampler2D tRipple;
        uniform sampler2D tPuddle;
        uniform float uTime;
        uniform float uReflect;
        varying vec4 vReflUv;
        varying vec3 vGroundW;
        vec2 rippleLayer(vec2 p, float t) {
          vec4 r = texture2D(tRipple, p);
          vec2 d = r.xy * 2.0 - 1.0;
          float dist = length(d);
          float life = fract(t + r.z);
          float ring = dist - life;
          float amp = r.w * (1.0 - life) * (1.0 - life) * smoothstep(0.3, 0.0, abs(ring));
          return d / max(dist, 1e-3) * sin(ring * 15.7) * amp;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float pud = texture2D(tPuddle, vGroundW.xz / ${SIZE.toFixed(1)} + 0.5).r;
        pud = smoothstep(0.12, 0.8, pud + (texture2D(tNoise, vGroundW.xz * 0.45).b - 0.5) * 0.35);
        diffuseColor.rgb *= mix(0.82, 0.38, pud);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * 0.8, 0.035, pud);')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float ripFade = smoothstep(26.0, 7.0, length(vViewPosition));
        vec2 rip = (rippleLayer(vGroundW.xz, uTime * 1.1) + rippleLayer(vGroundW.xz * 1.37 + 0.5, uTime * 0.93 + 0.37)) * (0.3 + 0.7 * pud) * ripFade;
        vec3 flatN = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        normal = normalize(mix(normal, flatN, pud * 0.85));
        vec3 ripW = normalize(vec3(-rip.x * 0.6, 1.0, -rip.y * 0.6));
        vec3 ripV = normalize((viewMatrix * vec4(ripW, 0.0)).xyz);
        normal = normalize(normal + (ripV - flatN) * (0.35 + 0.65 * pud));`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec2 ruv = vReflUv.xy / vReflUv.w + rip * 0.012 + (normal.xy - flatN.xy) * 0.03;
          vec3 refl = texture2D(tReflect, ruv, roughnessFactor * 9.0).rgb;
          float F = 0.02 + 0.98 * pow(1.0 - saturate(dot(normal, geometryViewDir)), 5.0);
          float amt = F * mix(0.35, 1.0, pud) * uReflect;
          outgoingLight = outgoingLight * (1.0 - amt * 0.6) + refl * amt;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'wetCobbles2';
  reflector.material = mat;
  reflector.rotation.x = -Math.PI / 2;
  reflector.receiveShadow = true;
  reflector.renderOrder = -1;
  const reflectRender = reflector.onBeforeRender;
  const noop = () => {};
  return {
    mesh: reflector,
    uniforms,
    setReflections(on) {
      uniforms.uReflect.value = on ? 1 : 0;
      reflector.onBeforeRender = on ? reflectRender : noop;
    },
    setSize(w, h) {
      rt.setSize(Math.max(64, Math.floor(w * 0.4)), Math.max(64, Math.floor(h * 0.4)));
    },
  };
}
